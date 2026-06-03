import * as assert from 'node:assert/strict';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import { buildPolicyVictorySurface } from '../../../src/agents/policy-surface.js';
import {
  asPlayerId,
  computeAllVictoryStandings,
  computeDerivedMetricValue,
  isCoinControlled,
  isSoloSeatControlled,
  type AgentParameterValue,
  type GameDef,
  type GameState,
  type SeatGroupConfig,
  type Token,
  type ZoneDef,
} from '../../../src/kernel/index.js';

export type OutcomeScalar = string | number | boolean;
export type OutcomeValue = OutcomeScalar | readonly OutcomeScalar[] | undefined;

export type OutcomeDeltaQuery =
  | { readonly kind: 'terminalVictoryMargin'; readonly seat: string }
  | { readonly kind: 'terminalVictoryRank'; readonly seat: string }
  | { readonly kind: 'victoryStandingMargin'; readonly seat: string }
  | { readonly kind: 'victoryStandingRank'; readonly seat: string }
  | { readonly kind: 'derivedMetric'; readonly id: string }
  | {
      readonly kind: 'stateFeature';
      readonly id: string;
      readonly seatId?: string;
      readonly playerId?: number;
      readonly parameterValues?: Readonly<Record<string, AgentParameterValue>>;
    }
  | { readonly kind: 'globalVar'; readonly name: string }
  | { readonly kind: 'perPlayerVar'; readonly playerId: number; readonly name: string }
  | { readonly kind: 'zoneVar'; readonly zoneId: string; readonly name: string }
  | { readonly kind: 'zoneAttribute'; readonly zoneId: string; readonly name: string }
  | { readonly kind: 'marker'; readonly zoneId: string; readonly markerId: string; readonly missingValue?: string }
  | {
      readonly kind: 'markerCount';
      readonly markerId: string;
      readonly markerState?: string;
      readonly zoneIds?: readonly string[];
    }
  | {
      readonly kind: 'tokenCount';
      readonly zoneId?: string;
      readonly zoneIds?: readonly string[];
      readonly tokenType?: string;
      readonly status?: OutcomeScalar;
      readonly statusProp?: string;
      readonly props?: Readonly<Record<string, OutcomeScalar>>;
    }
  | {
      readonly kind: 'controlCount';
      readonly control: 'coin' | 'solo';
      readonly seatGroupConfig: SeatGroupConfig;
      readonly zoneIds?: readonly string[];
      readonly zoneKind?: ZoneDef['zoneKind'];
      readonly category?: string;
    };

export type OutcomeDeltaDirection = 'increase' | 'decrease' | 'unchanged';

export interface NumericDeltaExpectation {
  readonly exact?: number;
  readonly min?: number;
  readonly max?: number;
  readonly direction?: OutcomeDeltaDirection;
}

export interface OutcomeDeltaAssertion {
  readonly label?: string;
  readonly query: OutcomeDeltaQuery;
  readonly before?: OutcomeValue;
  readonly after?: OutcomeValue;
  readonly delta?: NumericDeltaExpectation;
}

export interface OutcomeDeltaResult {
  readonly label: string;
  readonly query: OutcomeDeltaQuery;
  readonly before: OutcomeValue;
  readonly after: OutcomeValue;
  readonly delta: number | undefined;
}

export interface AssertOutcomeDeltasInput {
  readonly def: GameDef;
  readonly before: GameState;
  readonly after: GameState;
  readonly assertions: readonly OutcomeDeltaAssertion[];
}

export const assertOutcomeDeltas = (input: AssertOutcomeDeltasInput): readonly OutcomeDeltaResult[] => {
  const results = computeOutcomeDeltas(input);
  for (const result of results) {
    const expected = input.assertions.find((entry) => labelFor(entry) === result.label);
    assert.ok(expected, `missing outcome delta assertion for ${result.label}`);
    assertExpectedValue(`${result.label} before`, result.before, expected.before);
    assertExpectedValue(`${result.label} after`, result.after, expected.after);
    assertExpectedDelta(result, expected.delta);
  }
  return results;
};

export const computeOutcomeDeltas = (input: AssertOutcomeDeltasInput): readonly OutcomeDeltaResult[] =>
  input.assertions.map((entry) => {
    const before = evaluateOutcomeDeltaQuery(input.def, input.before, entry.query);
    const after = evaluateOutcomeDeltaQuery(input.def, input.after, entry.query);
    return {
      label: labelFor(entry),
      query: entry.query,
      before,
      after,
      delta: numericDelta(before, after),
    };
  });

export const evaluateOutcomeDeltaQuery = (
  def: GameDef,
  state: GameState,
  query: OutcomeDeltaQuery,
): OutcomeValue => {
  switch (query.kind) {
    case 'terminalVictoryMargin':
      return requireMapValue(buildPolicyVictorySurface(def, state).marginBySeat, query.seat, query.kind);
    case 'terminalVictoryRank':
      return requireMapValue(buildPolicyVictorySurface(def, state).rankBySeat, query.seat, query.kind);
    case 'victoryStandingMargin':
      return requireVictoryStanding(def, state, query.seat).margin;
    case 'victoryStandingRank':
      return requireVictoryStandingRank(def, state, query.seat);
    case 'derivedMetric':
      return computeDerivedMetricValue(def, state, query.id);
    case 'stateFeature':
      return evaluateStateFeature(def, state, query);
    case 'globalVar':
      return state.globalVars[query.name] as OutcomeValue;
    case 'perPlayerVar':
      return state.perPlayerVars[query.playerId]?.[query.name] as OutcomeValue;
    case 'zoneVar':
      return state.zoneVars[query.zoneId]?.[query.name];
    case 'zoneAttribute':
      return requireZone(def, query.zoneId).attributes?.[query.name] as OutcomeValue;
    case 'marker':
      return state.markers[query.zoneId]?.[query.markerId] ?? query.missingValue;
    case 'markerCount':
      return countMarkers(def, state, query);
    case 'tokenCount':
      return countTokens(state, query);
    case 'controlCount':
      return countControlledZones(def, state, query);
  }
};

const labelFor = (assertion: OutcomeDeltaAssertion): string =>
  assertion.label ?? `${assertion.query.kind}:${JSON.stringify(assertion.query)}`;

const assertExpectedValue = (label: string, actual: OutcomeValue, expected: OutcomeValue): void => {
  if (expected === undefined) {
    return;
  }
  assert.deepEqual(actual, expected, `expected ${label} to be ${format(expected)}, got ${format(actual)}`);
};

const assertExpectedDelta = (
  result: OutcomeDeltaResult,
  expected: NumericDeltaExpectation | undefined,
): void => {
  if (expected === undefined) {
    return;
  }
  assert.ok(result.delta !== undefined, `expected numeric delta for ${result.label}`);
  if (expected.exact !== undefined) {
    assert.equal(result.delta, expected.exact, `expected ${result.label} delta ${expected.exact}, got ${result.delta}`);
  }
  if (expected.min !== undefined) {
    assert.ok(result.delta >= expected.min, `expected ${result.label} delta >= ${expected.min}, got ${result.delta}`);
  }
  if (expected.max !== undefined) {
    assert.ok(result.delta <= expected.max, `expected ${result.label} delta <= ${expected.max}, got ${result.delta}`);
  }
  if (expected.direction !== undefined) {
    assertDeltaDirection(result.label, result.delta, expected.direction);
  }
};

const assertDeltaDirection = (label: string, delta: number, direction: OutcomeDeltaDirection): void => {
  switch (direction) {
    case 'increase':
      assert.ok(delta > 0, `expected ${label} to increase, got delta ${delta}`);
      return;
    case 'decrease':
      assert.ok(delta < 0, `expected ${label} to decrease, got delta ${delta}`);
      return;
    case 'unchanged':
      assert.equal(delta, 0, `expected ${label} to be unchanged, got delta ${delta}`);
      return;
  }
};

const numericDelta = (before: OutcomeValue, after: OutcomeValue): number | undefined => {
  if (typeof before !== 'number' || typeof after !== 'number') {
    return undefined;
  }
  return after - before;
};

const evaluateStateFeature = (
  def: GameDef,
  state: GameState,
  query: Extract<OutcomeDeltaQuery, { readonly kind: 'stateFeature' }>,
): OutcomeValue => {
  const catalog = def.agents;
  assert.ok(catalog, 'expected GameDef.agents before evaluating state feature');
  assert.ok(catalog.compiled.stateFeatures[query.id], `expected compiled state feature ${query.id}`);
  const context = new PolicyEvaluationContext({
    def,
    state,
    playerId: asPlayerId(query.playerId ?? Number(state.activePlayer)),
    seatId: query.seatId ?? String(def.seats?.[Number(state.activePlayer)]?.id ?? state.activePlayer),
    catalog,
    parameterValues: query.parameterValues ?? {},
    trustedMoveIndex: new Map(),
    cacheBinding: { kind: 'isolated' },
  }, []);
  try {
    return context.evaluateStateFeature(query.id) as OutcomeValue;
  } finally {
    context.dispose();
  }
};

const requireVictoryStanding = (def: GameDef, state: GameState, seat: string): { readonly margin: number } => {
  assert.ok(def.victoryStandings, 'expected GameDef.victoryStandings');
  const standing = computeAllVictoryStandings(def, state, def.victoryStandings).find((entry) => entry.seat === seat);
  assert.ok(standing, `expected victory standing for seat ${seat}`);
  return standing;
};

const requireVictoryStandingRank = (def: GameDef, state: GameState, seat: string): number => {
  assert.ok(def.victoryStandings, 'expected GameDef.victoryStandings');
  const index = computeAllVictoryStandings(def, state, def.victoryStandings).findIndex((entry) => entry.seat === seat);
  assert.notEqual(index, -1, `expected victory standing for seat ${seat}`);
  return index + 1;
};

const requireMapValue = <T>(map: ReadonlyMap<string, T>, key: string, label: string): T => {
  const value = map.get(key);
  assert.notEqual(value, undefined, `expected ${label} value for ${key}`);
  return value as T;
};

const requireZone = (def: GameDef, zoneId: string): ZoneDef => {
  const zone = def.zones.find((entry) => entry.id === zoneId);
  assert.ok(zone, `expected zone ${zoneId}`);
  return zone;
};

const zoneIdsFrom = (
  state: GameState,
  query: Pick<Extract<OutcomeDeltaQuery, { readonly kind: 'tokenCount' }>, 'zoneId' | 'zoneIds'>,
): readonly string[] => {
  if (query.zoneId !== undefined) {
    return [query.zoneId];
  }
  if (query.zoneIds !== undefined) {
    return query.zoneIds;
  }
  return Object.keys(state.zones);
};

const countTokens = (
  state: GameState,
  query: Extract<OutcomeDeltaQuery, { readonly kind: 'tokenCount' }>,
): number => {
  let count = 0;
  for (const zoneId of zoneIdsFrom(state, query)) {
    for (const token of state.zones[zoneId] ?? []) {
      if (matchesToken(token, query)) {
        count++;
      }
    }
  }
  return count;
};

const matchesToken = (
  token: Token,
  query: Extract<OutcomeDeltaQuery, { readonly kind: 'tokenCount' }>,
): boolean => {
  if (query.tokenType !== undefined && token.type !== query.tokenType) {
    return false;
  }
  if (query.status !== undefined && token.props[query.statusProp ?? 'status'] !== query.status) {
    return false;
  }
  for (const [key, expected] of Object.entries(query.props ?? {})) {
    if (token.props[key] !== expected) {
      return false;
    }
  }
  return true;
};

const countMarkers = (
  def: GameDef,
  state: GameState,
  query: Extract<OutcomeDeltaQuery, { readonly kind: 'markerCount' }>,
): number => {
  const zoneIds = query.zoneIds ?? def.zones.map((zone) => zone.id);
  let count = 0;
  for (const zoneId of zoneIds) {
    const value = state.markers[zoneId]?.[query.markerId];
    if (query.markerState === undefined ? value !== undefined : value === query.markerState) {
      count++;
    }
  }
  return count;
};

const countControlledZones = (
  def: GameDef,
  state: GameState,
  query: Extract<OutcomeDeltaQuery, { readonly kind: 'controlCount' }>,
): number => {
  const zoneIdFilter = query.zoneIds === undefined ? undefined : new Set(query.zoneIds);
  let count = 0;
  for (const zone of def.zones) {
    if (zoneIdFilter !== undefined && !zoneIdFilter.has(zone.id)) {
      continue;
    }
    if (query.zoneKind !== undefined && zone.zoneKind !== query.zoneKind) {
      continue;
    }
    if (query.category !== undefined && zone.category !== query.category) {
      continue;
    }
    const isControlled = query.control === 'coin'
      ? isCoinControlled(state, zone.id, query.seatGroupConfig)
      : isSoloSeatControlled(state, zone.id, query.seatGroupConfig);
    if (isControlled) {
      count++;
    }
  }
  return count;
};

const format = (value: unknown): string => JSON.stringify(value);
