import type { DerivedMetricDef, GameDef, GameState, ZoneDef, Token } from './types.js';
import { attributeValueEquals } from './attribute-value-equals.js';
import { kernelRuntimeError } from './runtime-error.js';

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
    const value = token.props[seatProp];
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
      if (basePieceTypes.includes(token.type) && token.props[seatProp] === seat) {
        total++;
      }
    }
  }
  return total;
}

// ─── Victory Marker Composite ────────────────────────────────────────────────

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
  switch (formula.type) {
    case 'markerTotalPlusZoneCount': {
      const markerTotal = computeMarkerTotal(gameDef, spaces, markerStates, formula.markerConfig);
      const zoneCount = countTokensInZone(
        state,
        formula.countZone,
        formula.countTokenTypes !== undefined
          ? { kind: 'byTokenType', tokenTypes: formula.countTokenTypes }
          : undefined,
      );
      return markerTotal + zoneCount;
    }
    case 'markerTotalPlusMapBases': {
      const markerTotal = computeMarkerTotal(gameDef, spaces, markerStates, formula.markerConfig);
      const bases = countBasesOnMap(
        state,
        spaces,
        formula.baseSeat,
        formula.basePieceTypes,
        seatGroupConfig.seatProp,
      );
      return markerTotal + bases;
    }
    case 'controlledPopulationPlusMapBases': {
      const controlFn = formula.controlFn === 'coin' ? isCoinControlled : isSoloSeatControlled;
      const pop = sumControlledPopulation(gameDef, state, spaces, controlFn, seatGroupConfig);
      const bases = countBasesOnMap(
        state,
        spaces,
        formula.baseSeat,
        formula.basePieceTypes,
        seatGroupConfig.seatProp,
      );
      return pop + bases;
    }
    case 'controlledPopulationPlusGlobalVar': {
      const controlFn = formula.controlFn === 'coin' ? isCoinControlled : isSoloSeatControlled;
      const pop = sumControlledPopulation(gameDef, state, spaces, controlFn, seatGroupConfig);
      const varValue = state.globalVars[formula.varName];
      if (typeof varValue !== 'number') {
        throw kernelRuntimeError(
          'DERIVED_VALUE_FORMULA_NON_NUMERIC_VAR',
          `Derived value formula requires numeric global var: ${formula.varName}`,
          { varName: formula.varName },
        );
      }
      return pop + varValue;
    }
  }
}
