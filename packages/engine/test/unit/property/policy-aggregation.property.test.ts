import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  createGameDefRuntime,
  initialState,
  type ActionDef,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type GameDef,
  type GameState,
  type Move,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

function createAction(id: string): ActionDef {
  return {
    id: asActionId(id),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };
}

function literal(value: number): Extract<AgentPolicyExpr, { readonly kind: 'literal' }> {
  return { kind: 'literal', value };
}

function refStateFeature(id: string): Extract<AgentPolicyExpr, { readonly kind: 'ref' }> {
  return { kind: 'ref', ref: { kind: 'library', refKind: 'stateFeature', id } };
}

function createAggregationCatalog(expr: AgentPolicyExpr): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'policy-aggregation-property',
    surfaceVisibility: {
      globalVars: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        currentRank: {
          current: 'hidden',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
      },
      activeCardIdentity: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardTag: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
      activeCardMetadata: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {
        metric: {
          type: 'number',
          costClass: 'state',
          expr,
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {
        metricScore: {
          costClass: 'candidate',
          weight: literal(1),
          value: refStateFeature('metric'),
          dependencies: { parameters: [], stateFeatures: ['metric'], candidateFeatures: [], aggregates: [] },
        },
      },
      completionScoreTerms: {},
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'candidate',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        use: {
          pruningRules: [],
          scoreTerms: ['metricScore'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: ['metric'],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    },
    bindingsBySeat: {
      us: 'baseline',
    },
  };
}

function createDef(expr: AgentPolicyExpr): GameDef {
  return {
    metadata: { id: 'policy-aggregation-property', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      {
        id: asZoneId('frontier:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1 },
        adjacentTo: [
          { to: asZoneId('target-a:none'), direction: 'bidirectional' },
          { to: asZoneId('target-b:none'), direction: 'bidirectional' },
        ],
      },
      {
        id: asZoneId('target-a:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1 },
        adjacentTo: [{ to: asZoneId('frontier:none'), direction: 'bidirectional' }],
      },
      {
        id: asZoneId('target-b:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'province',
        attributes: { population: 1 },
        adjacentTo: [{ to: asZoneId('frontier:none'), direction: 'bidirectional' }],
      },
      {
        id: asZoneId('reserve:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        zoneKind: 'aux',
      },
    ],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createAggregationCatalog(expr),
    actions: [createAction('alpha')],
    triggers: [],
    terminal: { conditions: [] },
  };
}

function createGeneratedState(def: GameDef, seed: number): GameState {
  const base = initialState(def, seed + 1, 2).state;
  const makeTokens = (prefix: string, count: number, type: 'base' | 'troop', seat: string): GameState['zones'][string] =>
    Array.from({ length: count }, (_, index) => ({
      id: asTokenId(`${prefix}-${index}`),
      type,
      props: { seat, strength: index + 1 },
    }));

  return {
    ...base,
    zones: {
      ...base.zones,
      'frontier:none': [
        ...makeTokens('frontier-base', seed % 3, 'base', '0'),
        ...makeTokens('frontier-troop', (seed + 1) % 3, 'troop', seed % 2 === 0 ? '0' : '1'),
      ],
      'target-a:none': [
        ...makeTokens('target-a-base', (seed + 2) % 4, 'base', '1'),
        ...makeTokens('target-a-troop', seed % 4, 'troop', '0'),
      ],
      'target-b:none': [
        ...makeTokens('target-b-base', (seed + 3) % 2, 'base', '0'),
        ...makeTokens('target-b-troop', (seed + 1) % 5, 'troop', '0'),
      ],
      'reserve:none': [
        ...makeTokens('reserve-troop', (seed + 2) % 3, 'troop', '0'),
      ],
    },
    zoneVars: {
      ...base.zoneVars,
      'frontier:none': { pressure: seed % 3 },
      'target-a:none': { pressure: seed + 1 },
      'target-b:none': { pressure: seed + 2 },
    },
  };
}

function evaluateAggregation(expr: AgentPolicyExpr, state: GameState): number {
  const def = createDef(expr);
  const runtime = createGameDefRuntime(def);
  const result = evaluatePolicyMove({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: [{ actionId: asActionId('alpha'), params: {} } satisfies Move],
    trustedMoveIndex: new Map(),
    rng: createRng(99n),
    runtime,
  });

  const score = result.metadata.candidates[0]?.score;
  assert.equal(typeof score, 'number');
  return score as number;
}

function countBoardTokens(def: GameDef, state: GameState): number {
  let total = 0;
  for (const zone of def.zones) {
    if ((zone.zoneKind ?? 'board') !== 'board') {
      continue;
    }
    total += state.zones[String(zone.id)]?.length ?? 0;
  }
  return total;
}

function countBoardTroopsForUs(def: GameDef, state: GameState): number {
  let total = 0;
  for (const zone of def.zones) {
    if ((zone.zoneKind ?? 'board') !== 'board') {
      continue;
    }
    for (const token of state.zones[String(zone.id)] ?? []) {
      if (token.type === 'troop' && String(token.props?.seat) === '0') {
        total += 1;
      }
    }
  }
  return total;
}

describe('policy aggregation invariants', () => {
  it('globalTokenAgg count matches manual board token totals across generated states', () => {
    const expr: AgentPolicyExpr = {
      kind: 'globalTokenAgg',
      aggOp: 'count',
      zoneScope: 'board',
    };
    const def = createDef(expr);

    for (let seed = 0; seed < 24; seed += 1) {
      const state = createGeneratedState(def, seed);
      const actual = evaluateAggregation(expr, state);
      const expected = countBoardTokens(def, state);

      assert.equal(actual, expected, `seed ${seed} should match manual board token count`);
    }
  });

  it('adjacentTokenAgg count never exceeds the equivalent globalTokenAgg count', () => {
    const globalExpr: AgentPolicyExpr = {
      kind: 'globalTokenAgg',
      aggOp: 'count',
      zoneScope: 'board',
      tokenFilter: {
        type: 'troop',
        props: { seat: { eq: '0' } },
      },
    };
    const adjacentExpr: AgentPolicyExpr = {
      kind: 'adjacentTokenAgg',
      anchorZone: 'frontier:none',
      aggOp: 'count',
      tokenFilter: {
        type: 'troop',
        props: { seat: { eq: '0' } },
      },
    };
    const def = createDef(globalExpr);

    for (let seed = 0; seed < 24; seed += 1) {
      const state = createGeneratedState(def, seed);
      const globalCount = evaluateAggregation(globalExpr, state);
      const adjacentCount = evaluateAggregation(adjacentExpr, state);
      const manualGlobal = countBoardTroopsForUs(def, state);

      assert.equal(globalCount, manualGlobal, `seed ${seed} should keep the global reference honest`);
      assert.equal(adjacentCount <= globalCount, true, `seed ${seed} adjacent count should be a subset of the global count`);
    }
  });

  it('preserves zero semantics for empty-state count and sum aggregations', () => {
    const globalCount = evaluateAggregation(
      {
        kind: 'globalTokenAgg',
        aggOp: 'count',
        zoneScope: 'board',
      },
      initialState(createDef({ kind: 'globalTokenAgg', aggOp: 'count', zoneScope: 'board' }), 5, 2).state,
    );
    const globalZoneSum = evaluateAggregation(
      {
        kind: 'globalZoneAgg',
        source: 'variable',
        field: 'pressure',
        aggOp: 'sum',
        zoneScope: 'board',
      },
      initialState(createDef({ kind: 'globalZoneAgg', source: 'variable', field: 'pressure', aggOp: 'sum', zoneScope: 'board' }), 5, 2).state,
    );
    const adjacentCount = evaluateAggregation(
      {
        kind: 'adjacentTokenAgg',
        anchorZone: 'frontier:none',
        aggOp: 'count',
        tokenFilter: { type: 'troop' },
      },
      initialState(createDef({ kind: 'adjacentTokenAgg', anchorZone: 'frontier:none', aggOp: 'count', tokenFilter: { type: 'troop' } }), 5, 2).state,
    );

    assert.equal(globalCount, 0);
    assert.equal(globalZoneSum, 0);
    assert.equal(adjacentCount, 0);
  });
});
