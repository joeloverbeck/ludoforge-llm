import type { DerivedMetricDef, GameDef, GameState, VictoryStandingsDef, ZoneDef, Token } from './types.js';
import { attributeValueEquals } from './attribute-value-equals.js';
import { kernelRuntimeError } from './runtime-error.js';
import { resolveTokenViewFieldValue } from './token-view.js';

type DerivedComputationId = 'computeMarkerTotal' | 'computeTotalEcon' | 'sumControlledPopulation';

type DerivedMetricComputation = DerivedMetricDef['computation'];
type DerivedMetricsContext = Readonly<Pick<GameDef, 'derivedMetrics'>>;

function describeAttributeType(value: unknown): string {
  if (value === undefined) {
    return 'missing';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function requireNumericZoneAttribute(
  gameDef: DerivedMetricsContext,
  zone: ZoneDef,
  key: string,
  computation: DerivedComputationId,
  metricComputation: DerivedMetricComputation,
): number {
  const metrics = (gameDef.derivedMetrics ?? []).filter((metric) => {
    if (metric.computation !== metricComputation) {
      return false;
    }
    return derivedMetricMatchesZone(metric, zone);
  });

  const hasDeclaredRequirement = metrics.some((metric) =>
    metric.requirements.some((requirement) => requirement.key === key && requirement.expectedType === 'number'),
  );
  if (!hasDeclaredRequirement) {
    throw kernelRuntimeError(
      'DERIVED_VALUE_CONTRACT_MISSING',
      `Derived computation "${computation}" requires a declared contract for zone "${zone.id}" attribute "${key}".`,
      {
        computation,
        zoneId: zone.id,
        attributeKey: key,
      },
    );
  }

  const value = zone.attributes?.[key];
  if (typeof value === 'number') {
    return value;
  }

  const actualType = describeAttributeType(value);
  throw kernelRuntimeError(
    'DERIVED_VALUE_ZONE_ATTRIBUTE_INVALID',
    `Derived computation "${computation}" requires zone "${zone.id}" attribute "${key}" to be number; got ${actualType}.`,
    {
      computation,
      zoneId: zone.id,
      attributeKey: key,
      expectedType: 'number',
      actualType,
    },
  );
}

function derivedMetricMatchesZone(metric: DerivedMetricDef, zone: ZoneDef): boolean {
  const filter = metric.zoneFilter;
  if (filter === undefined) {
    return true;
  }
  if (filter.zoneIds !== undefined && filter.zoneIds.length > 0 && !filter.zoneIds.includes(zone.id)) {
    return false;
  }
  if (filter.zoneKinds !== undefined && filter.zoneKinds.length > 0) {
    const zoneKind = zone.zoneKind ?? 'aux';
    if (!filter.zoneKinds.includes(zoneKind)) {
      return false;
    }
  }
  if (filter.category !== undefined && filter.category.length > 0) {
    if (zone.category === undefined || !filter.category.includes(zone.category)) {
      return false;
    }
  }
  if (filter.attributeEquals !== undefined) {
    for (const [attributeKey, expected] of Object.entries(filter.attributeEquals)) {
      if (!attributeValueEquals(zone.attributes?.[attributeKey], expected)) {
        return false;
      }
    }
  }
  return true;
}

// ─── Configuration Types ─────────────────────────────────────────────────────

/** Seat grouping for control computation. Game-agnostic: callers provide seat IDs. */
export interface SeatGroupConfig {
  readonly coinSeats: readonly string[];
  readonly insurgentSeats: readonly string[];
  readonly soloSeat: string;
  readonly seatProp: string;
}

/** Marker weight config for population-weighted aggregates. */
export interface MarkerWeightConfig {
  readonly activeState: string;
  readonly passiveState: string;
}

/** Victory formula — discriminated union for game-agnostic per-seat formulas. */
export type VictoryFormula =
  | {
      readonly type: 'markerTotalPlusZoneCount';
      readonly markerConfig: MarkerWeightConfig;
      readonly countZone: string;
      readonly countTokenTypes?: readonly string[];
    }
  | {
      readonly type: 'markerTotalPlusMapBases';
      readonly markerConfig: MarkerWeightConfig;
      readonly baseSeat: string;
      readonly basePieceTypes: readonly string[];
    }
  | {
      readonly type: 'controlledPopulationPlusMapBases';
      readonly controlFn: 'coin' | 'solo';
      readonly baseSeat: string;
      readonly basePieceTypes: readonly string[];
    }
  | {
      readonly type: 'controlledPopulationPlusGlobalVar';
      readonly controlFn: 'coin' | 'solo';
      readonly varName: string;
    };

// ─── Token Counting ──────────────────────────────────────────────────────────

function getZoneTokens(state: GameState, spaceId: string): readonly Token[] {
  return state.zones[spaceId] ?? [];
}

/**
 * Count tokens in a zone whose `seatProp` value is in `seats`.
 * Returns 0 for empty or missing zones.
 */
export function countSeatTokens(
  state: GameState,
  spaceId: string,
  seats: readonly string[],
  seatProp: string,
): number {
  const tokens = getZoneTokens(state, spaceId);
  let count = 0;
  for (const token of tokens) {
    const value = resolveTokenViewFieldValue(token, seatProp);
    if (typeof value === 'string' && seats.includes(value)) {
      count++;
    }
  }
  return count;
}

// ─── Control Functions ───────────────────────────────────────────────────────

/**
 * COIN controls a space when COIN faction token count strictly exceeds insurgent count.
 */
export function isCoinControlled(
  state: GameState,
  spaceId: string,
  seatGroupConfig: SeatGroupConfig,
): boolean {
  const coinCount = countSeatTokens(state, spaceId, seatGroupConfig.coinSeats, seatGroupConfig.seatProp);
  const insurgentCount = countSeatTokens(
    state,
    spaceId,
    seatGroupConfig.insurgentSeats,
    seatGroupConfig.seatProp,
  );
  return coinCount > insurgentCount;
}

/**
 * Solo faction controls a space when its token count strictly exceeds all other tokens combined.
 */
export function isSoloSeatControlled(
  state: GameState,
  spaceId: string,
  seatGroupConfig: SeatGroupConfig,
): boolean {
  const tokens = getZoneTokens(state, spaceId);
  const soloCount = countSeatTokens(state, spaceId, [seatGroupConfig.soloSeat], seatGroupConfig.seatProp);
  const othersCount = tokens.length - soloCount;
  return soloCount > othersCount;
}

// ─── Marker State Helpers ───────────────────────────────────────────────────

/**
 * Build a spaceId → markerState map for a specific marker from state.markers.
 * state.markers is keyed by spaceId: { [spaceId]: { [markerId]: state } }.
 * This produces { [spaceId]: markerState } suitable for computeMarkerTotal.
 */
function buildMarkerStatesBySpace(
  state: GameState,
  markerId: string,
  defaultState: string = 'neutral',
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [spaceId, markers] of Object.entries(state.markers)) {
    result[spaceId] = markers[markerId] ?? defaultState;
  }
  return result;
}

// ─── Population-Weighted Aggregates ──────────────────────────────────────────

/**
 * Returns the multiplier for a marker state:
 * activeState → 2, passiveState → 1, anything else → 0.
 */
export function getPopulationMultiplier(markerState: string, config: MarkerWeightConfig): number {
  if (markerState === config.activeState) return 2;
  if (markerState === config.passiveState) return 1;
  return 0;
}

/**
 * Sum population × multiplier across all spaces.
 * `markerStates` maps spaceId → marker state name. Missing entries use `defaultMarkerState`.
 */
export function computeMarkerTotal(
  gameDef: DerivedMetricsContext,
  spaces: readonly ZoneDef[],
  markerStates: Readonly<Record<string, string>>,
  config: MarkerWeightConfig,
  defaultMarkerState: string = 'neutral',
): number {
  let total = 0;
  for (const space of spaces) {
    const marker = markerStates[space.id] ?? defaultMarkerState;
    const population = requireNumericZoneAttribute(gameDef, space, 'population', 'computeMarkerTotal', 'markerTotal');
    total += population * getPopulationMultiplier(marker, config);
  }
  return total;
}

/**
 * Convenience: compute Total Support using a support-specific MarkerWeightConfig.
 */
export function computeTotalSupport(
  gameDef: DerivedMetricsContext,
  spaces: readonly ZoneDef[],
  markerStates: Readonly<Record<string, string>>,
  config: MarkerWeightConfig,
  defaultMarkerState: string = 'neutral',
): number {
  return computeMarkerTotal(gameDef, spaces, markerStates, config, defaultMarkerState);
}

/**
 * Convenience: compute Total Opposition using an opposition-specific MarkerWeightConfig.
 */
export function computeTotalOpposition(
  gameDef: DerivedMetricsContext,
  spaces: readonly ZoneDef[],
  markerStates: Readonly<Record<string, string>>,
  config: MarkerWeightConfig,
  defaultMarkerState: string = 'neutral',
): number {
  return computeMarkerTotal(gameDef, spaces, markerStates, config, defaultMarkerState);
}

// ─── Econ and Sabotage ───────────────────────────────────────────────────────

/**
 * A space is sabotaged if it contains any token of the given terror type.
 */
export function isSabotaged(state: GameState, spaceId: string, terrorTokenType: string): boolean {
  const tokens = getZoneTokens(state, spaceId);
  return tokens.some((t) => t.type === terrorTokenType);
}

/**
 * Total Econ = sum of econ for LoCs that are COIN-controlled and NOT sabotaged.
 */
export function computeTotalEcon(
  gameDef: DerivedMetricsContext,
  state: GameState,
  spaces: readonly ZoneDef[],
  seatGroupConfig: SeatGroupConfig,
  terrorTokenType: string,
  locSpaceType: string = 'loc',
): number {
  let total = 0;
  for (const space of spaces) {
    if (space.category !== locSpaceType) continue;
    if (!isCoinControlled(state, space.id, seatGroupConfig)) continue;
    if (isSabotaged(state, space.id, terrorTokenType)) continue;
    total += requireNumericZoneAttribute(gameDef, space, 'econ', 'computeTotalEcon', 'totalEcon');
  }
  return total;
}

function selectDerivedMetricZones(gameDef: GameDef, metric: DerivedMetricDef): readonly ZoneDef[] {
  return gameDef.zones.filter((zone) => derivedMetricMatchesZone(metric, zone));
}

function findDerivedMetric(gameDef: GameDef, metricId: string): DerivedMetricDef {
  const metric = gameDef.derivedMetrics?.find((entry) => entry.id === metricId);
  if (metric !== undefined) {
    return metric;
  }
  throw kernelRuntimeError(
    'DERIVED_VALUE_CONTRACT_MISSING',
    `Derived metric "${metricId}" is not declared in GameDef.derivedMetrics.`,
  );
}

export function computeDerivedMetricValue(
  gameDef: GameDef,
  state: GameState,
  metricId: string,
): number {
  const metric = findDerivedMetric(gameDef, metricId);
  const spaces = selectDerivedMetricZones(gameDef, metric);

  switch (metric.runtime.kind) {
    case 'markerTotal': {
      const markerStates = buildMarkerStatesBySpace(state, metric.runtime.markerId, metric.runtime.defaultMarkerState);
      return computeMarkerTotal(
        gameDef,
        spaces,
        markerStates,
        metric.runtime.markerConfig,
        metric.runtime.defaultMarkerState,
      );
    }
    case 'controlledPopulation': {
      const controlFn = metric.runtime.controlFn === 'coin' ? isCoinControlled : isSoloSeatControlled;
      return sumControlledPopulation(gameDef, state, spaces, controlFn, metric.runtime.seatGroupConfig);
    }
    case 'totalEcon': {
      const controlFn = metric.runtime.controlFn === 'coin' ? isCoinControlled : isSoloSeatControlled;
      const blockedByTokenTypes = new Set(metric.runtime.blockedByTokenTypes ?? []);
      let total = 0;
      for (const space of spaces) {
        if (!controlFn(state, space.id, metric.runtime.seatGroupConfig)) {
          continue;
        }
        if (blockedByTokenTypes.size > 0) {
          const tokens = getZoneTokens(state, space.id);
          if (tokens.some((token) => blockedByTokenTypes.has(token.type))) {
            continue;
          }
        }
        total += requireNumericZoneAttribute(gameDef, space, 'econ', 'computeTotalEcon', 'totalEcon');
      }
      return total;
    }
  }
}

// ─── Victory Marker Building Blocks ──────────────────────────────────────────

/**
 * Sum population of spaces where the given control function returns true.
 */
export function sumControlledPopulation(
  gameDef: DerivedMetricsContext,
  state: GameState,
  spaces: readonly ZoneDef[],
  controlFn: (state: GameState, spaceId: string, seatGroupConfig: SeatGroupConfig) => boolean,
  seatGroupConfig: SeatGroupConfig,
): number {
  let total = 0;
  for (const space of spaces) {
    if (controlFn(state, space.id, seatGroupConfig)) {
      total += requireNumericZoneAttribute(gameDef, space, 'population', 'sumControlledPopulation', 'controlledPopulation');
    }
  }
  return total;
}

/** Discriminated filter for `countTokensInZone`. */
export type ZoneCountFilter =
  | { readonly kind: 'bySeat'; readonly seats: readonly string[]; readonly seatProp: string }
  | { readonly kind: 'byTokenType'; readonly tokenTypes: readonly string[] };

/**
 * Count tokens in a single zone, optionally filtered by seat or token type.
 * The two filter modes are mutually exclusive (enforced by the discriminated union).
 */
export function countTokensInZone(
  state: GameState,
  zoneId: string,
  filter?: ZoneCountFilter,
): number {
  if (filter === undefined) {
    return getZoneTokens(state, zoneId).length;
  }
  switch (filter.kind) {
    case 'bySeat':
      return countSeatTokens(state, zoneId, filter.seats, filter.seatProp);
    case 'byTokenType': {
      const tokens = getZoneTokens(state, zoneId);
      return tokens.filter(t => filter.tokenTypes.includes(t.type)).length;
    }
  }
}

/**
 * Count bases (or any piece types) belonging to a seat across all map spaces.
 */
export function countBasesOnMap(
  state: GameState,
  spaces: readonly ZoneDef[],
  seat: string,
  basePieceTypes: readonly string[],
  seatProp: string,
): number {
  let total = 0;
  for (const space of spaces) {
    const tokens = getZoneTokens(state, space.id);
    for (const token of tokens) {
      if (basePieceTypes.includes(token.type) && resolveTokenViewFieldValue(token, seatProp) === seat) {
        total++;
      }
    }
  }
  return total;
}

// ─── Victory Marker Composite ────────────────────────────────────────────────

export interface SpaceContribution {
  readonly spaceId: string;
  readonly contribution: number;
  readonly factors: Readonly<Record<string, number>>;
}

export interface ComponentBreakdown {
  readonly aggregate: number;
  readonly spaces: readonly SpaceContribution[];
}

function sumBreakdownContributions(spaces: readonly SpaceContribution[]): number {
  let total = 0;
  for (const space of spaces) {
    total += space.contribution;
  }
  return total;
}

function toComponentBreakdown(spaces: readonly SpaceContribution[]): ComponentBreakdown {
  return {
    aggregate: sumBreakdownContributions(spaces),
    spaces,
  };
}

export function computeMarkerTotalBreakdown(
  gameDef: DerivedMetricsContext,
  spaces: readonly ZoneDef[],
  markerStates: Readonly<Record<string, string>>,
  config: MarkerWeightConfig,
  defaultMarkerState: string = 'neutral',
): ComponentBreakdown {
  const contributions: SpaceContribution[] = [];
  for (const space of spaces) {
    const marker = markerStates[space.id] ?? defaultMarkerState;
    const population = requireNumericZoneAttribute(gameDef, space, 'population', 'computeMarkerTotal', 'markerTotal');
    const multiplier = getPopulationMultiplier(marker, config);
    contributions.push({
      spaceId: space.id,
      contribution: population * multiplier,
      factors: { population, multiplier },
    });
  }
  return toComponentBreakdown(contributions);
}

export function countBasesOnMapBreakdown(
  state: GameState,
  spaces: readonly ZoneDef[],
  seat: string,
  basePieceTypes: readonly string[],
  seatProp: string,
): ComponentBreakdown {
  const contributions: SpaceContribution[] = [];
  for (const space of spaces) {
    const tokens = getZoneTokens(state, space.id);
    let count = 0;
    for (const token of tokens) {
      if (basePieceTypes.includes(token.type) && resolveTokenViewFieldValue(token, seatProp) === seat) {
        count++;
      }
    }
    if (count > 0) {
      contributions.push({
        spaceId: space.id,
        contribution: count,
        factors: { count },
      });
    }
  }
  return toComponentBreakdown(contributions);
}

export function sumControlledPopulationBreakdown(
  gameDef: DerivedMetricsContext,
  state: GameState,
  spaces: readonly ZoneDef[],
  controlFn: (state: GameState, spaceId: string, seatGroupConfig: SeatGroupConfig) => boolean,
  seatGroupConfig: SeatGroupConfig,
): ComponentBreakdown {
  const contributions: SpaceContribution[] = [];
  for (const space of spaces) {
    if (!controlFn(state, space.id, seatGroupConfig)) {
      continue;
    }
    const population = requireNumericZoneAttribute(gameDef, space, 'population', 'sumControlledPopulation', 'controlledPopulation');
    contributions.push({
      spaceId: space.id,
      contribution: population,
      factors: { population },
    });
  }
  return toComponentBreakdown(contributions);
}

function getNumericGlobalVar(state: GameState, varName: string): number {
  const varValue = state.globalVars[varName];
  if (typeof varValue !== 'number') {
    throw kernelRuntimeError(
      'DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR',
      `Derived value formula requires numeric global var: ${varName}`,
      { varName },
    );
  }
  return varValue;
}

function computeVictoryComponentBreakdowns(
  gameDef: DerivedMetricsContext,
  state: GameState,
  spaces: readonly ZoneDef[],
  markerStates: Readonly<Record<string, string>>,
  seatGroupConfig: SeatGroupConfig,
  formula: VictoryFormula,
): readonly ComponentBreakdown[] {
  switch (formula.type) {
    case 'markerTotalPlusZoneCount': {
      const markerTotal = computeMarkerTotalBreakdown(gameDef, spaces, markerStates, formula.markerConfig);
      const zoneCount = countTokensInZone(
        state,
        formula.countZone,
        formula.countTokenTypes !== undefined
          ? { kind: 'byTokenType', tokenTypes: formula.countTokenTypes }
          : undefined,
      );
      return [markerTotal, { aggregate: zoneCount, spaces: [] }];
    }
    case 'markerTotalPlusMapBases': {
      const markerTotal = computeMarkerTotalBreakdown(gameDef, spaces, markerStates, formula.markerConfig);
      const bases = countBasesOnMapBreakdown(state, spaces, formula.baseSeat, formula.basePieceTypes, seatGroupConfig.seatProp);
      return [markerTotal, bases];
    }
    case 'controlledPopulationPlusMapBases': {
      const controlFn = formula.controlFn === 'coin' ? isCoinControlled : isSoloSeatControlled;
      const population = sumControlledPopulationBreakdown(gameDef, state, spaces, controlFn, seatGroupConfig);
      const bases = countBasesOnMapBreakdown(state, spaces, formula.baseSeat, formula.basePieceTypes, seatGroupConfig.seatProp);
      return [population, bases];
    }
    case 'controlledPopulationPlusGlobalVar': {
      const controlFn = formula.controlFn === 'coin' ? isCoinControlled : isSoloSeatControlled;
      const population = sumControlledPopulationBreakdown(gameDef, state, spaces, controlFn, seatGroupConfig);
      const varValue = getNumericGlobalVar(state, formula.varName);
      return [population, { aggregate: varValue, spaces: [] }];
    }
  }
}

/**
 * Compute a victory marker value using a game-agnostic formula.
 */
export function computeVictoryMarker(
  gameDef: DerivedMetricsContext,
  state: GameState,
  spaces: readonly ZoneDef[],
  markerStates: Readonly<Record<string, string>>,
  seatGroupConfig: SeatGroupConfig,
  formula: VictoryFormula,
): number {
  const breakdowns = computeVictoryComponentBreakdowns(gameDef, state, spaces, markerStates, seatGroupConfig, formula);
  let total = 0;
  for (const breakdown of breakdowns) {
    total += breakdown.aggregate;
  }
  return total;
}

// ─── Victory Components (for tooltip breakdown) ──────────────────────────────

export interface VictoryComponents {
  readonly breakdowns: readonly ComponentBreakdown[];
}

/**
 * Decompose a victory formula into its component values (for tooltip breakdown).
 * Returns one number per formula component in a fixed order matching the formula type.
 */
export function computeVictoryComponents(
  gameDef: DerivedMetricsContext,
  state: GameState,
  spaces: readonly ZoneDef[],
  markerStates: Readonly<Record<string, string>>,
  seatGroupConfig: SeatGroupConfig,
  formula: VictoryFormula,
): VictoryComponents {
  return {
    breakdowns: computeVictoryComponentBreakdowns(gameDef, state, spaces, markerStates, seatGroupConfig, formula),
  };
}

// ─── Victory Standings Aggregate ─────────────────────────────────────────────

export interface VictoryStandingResult {
  readonly seat: string;
  readonly score: number;
  readonly threshold: number;
  readonly margin: number;
  readonly components: VictoryComponents;
}

/**
 * Compute victory standings for all entries in a VictoryStandingsDef.
 * Returns entries sorted by margin descending, with tie-break order applied.
 */
export function computeAllVictoryStandings(
  gameDef: GameDef,
  state: GameState,
  standings: VictoryStandingsDef,
): readonly VictoryStandingResult[] {
  const spaces = gameDef.zones.filter((z) => z.zoneKind === 'board');
  const markerStates = buildMarkerStatesBySpace(state, standings.markerName);

  const results: VictoryStandingResult[] = standings.entries.map((entry) => {
    const score = computeVictoryMarker(
      gameDef,
      state,
      spaces,
      markerStates,
      standings.seatGroupConfig,
      entry.formula,
    );
    const components = computeVictoryComponents(
      gameDef,
      state,
      spaces,
      markerStates,
      standings.seatGroupConfig,
      entry.formula,
    );
    return {
      seat: entry.seat,
      score,
      threshold: entry.threshold,
      margin: score - entry.threshold,
      components,
    };
  });

  const tieBreakIndex = new Map(standings.tieBreakOrder.map((seat, i) => [seat, i]));
  results.sort((a, b) => {
    const marginDiff = b.margin - a.margin;
    if (marginDiff !== 0) return marginDiff;
    const aTieBreak = tieBreakIndex.get(a.seat) ?? Infinity;
    const bTieBreak = tieBreakIndex.get(b.seat) ?? Infinity;
    return aTieBreak - bTieBreak;
  });

  return results;
}
