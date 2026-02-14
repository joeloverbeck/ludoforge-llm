import type { GameState, MapSpaceDef, Token } from './types.js';
import { kernelRuntimeError } from './runtime-error.js';

// ─── Configuration Types ─────────────────────────────────────────────────────

/** Faction grouping for control computation. Game-agnostic: callers provide faction IDs. */
export interface FactionConfig {
  readonly coinFactions: readonly string[];
  readonly insurgentFactions: readonly string[];
  readonly soloFaction: string;
  readonly factionProp: string;
}

/** Marker weight config for population-weighted aggregates. */
export interface MarkerWeightConfig {
  readonly activeState: string;
  readonly passiveState: string;
}

/** Victory formula — discriminated union for game-agnostic per-faction formulas. */
export type VictoryFormula =
  | {
      readonly type: 'markerTotalPlusZoneCount';
      readonly markerConfig: MarkerWeightConfig;
      readonly countZone: string;
    }
  | {
      readonly type: 'markerTotalPlusMapBases';
      readonly markerConfig: MarkerWeightConfig;
      readonly baseFaction: string;
      readonly basePieceTypes: readonly string[];
    }
  | {
      readonly type: 'controlledPopulationPlusMapBases';
      readonly controlFn: 'coin' | 'solo';
      readonly baseFaction: string;
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
 * Count tokens in a zone whose `factionProp` value is in `factions`.
 * Returns 0 for empty or missing zones.
 */
export function countFactionTokens(
  state: GameState,
  spaceId: string,
  factions: readonly string[],
  factionProp: string,
): number {
  const tokens = getZoneTokens(state, spaceId);
  let count = 0;
  for (const token of tokens) {
    const value = token.props[factionProp];
    if (typeof value === 'string' && factions.includes(value)) {
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
  factionConfig: FactionConfig,
): boolean {
  const coinCount = countFactionTokens(state, spaceId, factionConfig.coinFactions, factionConfig.factionProp);
  const insurgentCount = countFactionTokens(
    state,
    spaceId,
    factionConfig.insurgentFactions,
    factionConfig.factionProp,
  );
  return coinCount > insurgentCount;
}

/**
 * Solo faction controls a space when its token count strictly exceeds all other tokens combined.
 */
export function isSoloFactionControlled(
  state: GameState,
  spaceId: string,
  factionConfig: FactionConfig,
): boolean {
  const tokens = getZoneTokens(state, spaceId);
  const soloCount = countFactionTokens(state, spaceId, [factionConfig.soloFaction], factionConfig.factionProp);
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
  spaces: readonly MapSpaceDef[],
  markerStates: Readonly<Record<string, string>>,
  config: MarkerWeightConfig,
  defaultMarkerState: string = 'neutral',
): number {
  let total = 0;
  for (const space of spaces) {
    const marker = markerStates[space.id] ?? defaultMarkerState;
    total += space.population * getPopulationMultiplier(marker, config);
  }
  return total;
}

/**
 * Convenience: compute Total Support using a support-specific MarkerWeightConfig.
 */
export function computeTotalSupport(
  spaces: readonly MapSpaceDef[],
  markerStates: Readonly<Record<string, string>>,
  config: MarkerWeightConfig,
  defaultMarkerState: string = 'neutral',
): number {
  return computeMarkerTotal(spaces, markerStates, config, defaultMarkerState);
}

/**
 * Convenience: compute Total Opposition using an opposition-specific MarkerWeightConfig.
 */
export function computeTotalOpposition(
  spaces: readonly MapSpaceDef[],
  markerStates: Readonly<Record<string, string>>,
  config: MarkerWeightConfig,
  defaultMarkerState: string = 'neutral',
): number {
  return computeMarkerTotal(spaces, markerStates, config, defaultMarkerState);
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
  state: GameState,
  spaces: readonly MapSpaceDef[],
  factionConfig: FactionConfig,
  terrorTokenType: string,
  locSpaceType: string = 'loc',
): number {
  let total = 0;
  for (const space of spaces) {
    if (space.spaceType !== locSpaceType) continue;
    if (!isCoinControlled(state, space.id, factionConfig)) continue;
    if (isSabotaged(state, space.id, terrorTokenType)) continue;
    total += space.econ;
  }
  return total;
}

// ─── Victory Marker Building Blocks ──────────────────────────────────────────

/**
 * Sum population of spaces where the given control function returns true.
 */
export function sumControlledPopulation(
  state: GameState,
  spaces: readonly MapSpaceDef[],
  controlFn: (state: GameState, spaceId: string, factionConfig: FactionConfig) => boolean,
  factionConfig: FactionConfig,
): number {
  let total = 0;
  for (const space of spaces) {
    if (controlFn(state, space.id, factionConfig)) {
      total += space.population;
    }
  }
  return total;
}

/**
 * Count tokens in a single zone, optionally filtered by faction.
 */
export function countTokensInZone(
  state: GameState,
  zoneId: string,
  factions?: readonly string[],
  factionProp?: string,
): number {
  if (factions !== undefined && factionProp !== undefined) {
    return countFactionTokens(state, zoneId, factions, factionProp);
  }
  return getZoneTokens(state, zoneId).length;
}

/**
 * Count bases (or any piece types) belonging to a faction across all map spaces.
 */
export function countBasesOnMap(
  state: GameState,
  spaces: readonly MapSpaceDef[],
  faction: string,
  basePieceTypes: readonly string[],
  factionProp: string,
): number {
  let total = 0;
  for (const space of spaces) {
    const tokens = getZoneTokens(state, space.id);
    for (const token of tokens) {
      if (basePieceTypes.includes(token.type) && token.props[factionProp] === faction) {
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
  state: GameState,
  spaces: readonly MapSpaceDef[],
  markerStates: Readonly<Record<string, string>>,
  factionConfig: FactionConfig,
  formula: VictoryFormula,
): number {
  switch (formula.type) {
    case 'markerTotalPlusZoneCount': {
      const markerTotal = computeMarkerTotal(spaces, markerStates, formula.markerConfig);
      const zoneCount = countTokensInZone(state, formula.countZone);
      return markerTotal + zoneCount;
    }
    case 'markerTotalPlusMapBases': {
      const markerTotal = computeMarkerTotal(spaces, markerStates, formula.markerConfig);
      const bases = countBasesOnMap(
        state,
        spaces,
        formula.baseFaction,
        formula.basePieceTypes,
        factionConfig.factionProp,
      );
      return markerTotal + bases;
    }
    case 'controlledPopulationPlusMapBases': {
      const controlFn = formula.controlFn === 'coin' ? isCoinControlled : isSoloFactionControlled;
      const pop = sumControlledPopulation(state, spaces, controlFn, factionConfig);
      const bases = countBasesOnMap(
        state,
        spaces,
        formula.baseFaction,
        formula.basePieceTypes,
        factionConfig.factionProp,
      );
      return pop + bases;
    }
    case 'controlledPopulationPlusGlobalVar': {
      const controlFn = formula.controlFn === 'coin' ? isCoinControlled : isSoloFactionControlled;
      const pop = sumControlledPopulation(state, spaces, controlFn, factionConfig);
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
