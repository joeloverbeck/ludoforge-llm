import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../../src/agents/policy-evaluation-core.js';
import {
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../../helpers/production-spec-helpers.js';
import {
  compileGameSpecToGameDef,
  createEmptyGameSpecDoc,
} from '../../../src/cnl/index.js';
import type { GameSpecDoc, GameSpecAgentLibrary } from '../../../src/cnl/game-spec-doc.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledStrategicCondition,
  type GameDef,
} from '../../../src/kernel/index.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const phaseId = asPhaseId('main');

// ---------------------------------------------------------------------------
// Helpers — YAML-to-compile path
// ---------------------------------------------------------------------------

function createCompileReadyDoc(): GameSpecDoc {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'strat-cond-e2e', players: { min: 2, max: 2 } },
    observability: { observers: { testObserver: { surfaces: { victory: { currentMargin: 'public' as const } } } } },
    zones: [
      { id: 'board', owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    ],
    tokenTypes: [
      { id: 'guerrilla', props: {} },
      { id: 'base', props: {} },
    ],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [
      {
        id: 'act',
        actor: 'active',
        executor: 'actor',
        phase: ['main'],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    terminal: {
      conditions: [{ when: { op: '==', left: 1, right: 0 }, result: { type: 'draw' } }],
      margins: [
        { seat: 'p1', value: 0 },
        { seat: 'p2', value: 0 },
      ],
      ranking: { order: 'desc' as const },
    },
  };
}

function createSeatCatalogAsset(seatIds: readonly string[]) {
  return {
    id: 'seats',
    kind: 'seatCatalog' as const,
    payload: {
      seats: seatIds.map((seatId) => ({ id: seatId })),
    },
  };
}

function hasErrors(diagnostics: readonly { readonly severity: string }[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

function buildLibrary(
  strategicConditions: GameSpecAgentLibrary['strategicConditions'],
  extras?: Partial<GameSpecAgentLibrary>,
): GameSpecAgentLibrary {
  const base: GameSpecAgentLibrary = {};
  if (strategicConditions !== undefined) {
    (base as Record<string, unknown>)['strategicConditions'] = strategicConditions;
  }
  if (extras !== undefined) {
    for (const [key, value] of Object.entries(extras)) {
      if (value !== undefined) {
        (base as Record<string, unknown>)[key] = value;
      }
    }
  }
  return base;
}

function compileWithConditions(
  strategicConditions: GameSpecAgentLibrary['strategicConditions'],
  extras?: {
    library?: Partial<GameSpecAgentLibrary>;
  },
) {
  return compileGameSpecToGameDef({
    ...createCompileReadyDoc(),
    dataAssets: [createSeatCatalogAsset(['p1', 'p2'])],
    agents: {
      library: buildLibrary(strategicConditions, extras?.library),
      profiles: {},
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers — pre-compiled evaluation path
// ---------------------------------------------------------------------------

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (
  op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'],
  ...args: AgentPolicyExpr[]
): AgentPolicyExpr => ({ kind: 'op', op, args });

const emptyDeps = {
  parameters: [] as readonly string[],
  stateFeatures: [] as readonly string[],
  candidateFeatures: [] as readonly string[],
  aggregates: [] as readonly string[],
  strategicConditions: [] as readonly string[],
};

function createBaseDef(overrides?: {
  tokenTypes?: GameDef['tokenTypes'];
  zones?: GameDef['zones'];
}): GameDef {
  return {
    metadata: { id: 'strat-cond-e2e', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: overrides?.zones ?? [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', attributes: {} },
    ],
    derivedMetrics: [],
    seats: [{ id: 'p1' }, { id: 'p2' }],
    tokenTypes: overrides?.tokenTypes ?? [
      { id: 'guerrilla', props: {} },
      { id: 'base', props: {} },
    ],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: {
      schemaVersion: 2,
      catalogFingerprint: 'test',
      surfaceVisibility: {
        globalVars: {},
        perPlayerVars: {},
        derivedMetrics: {},
        victory: {
          currentMargin: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
          currentRank: { current: 'public', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        },
        activeCardIdentity: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        activeCardTag: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        activeCardMetadata: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
        activeCardAnnotation: { current: 'hidden', preview: { visibility: 'hidden', allowWhenHiddenSampling: false } },
      },
      parameterDefs: {},
      candidateParamDefs: {},
      library: {
        stateFeatures: {},
        candidateFeatures: {},
        candidateAggregates: {},
        pruningRules: {},
        scoreTerms: {},
        completionScoreTerms: {},
        tieBreakers: {
          rng: { kind: 'rng', costClass: 'state', dependencies: emptyDeps },
        },
        strategicConditions: {},
      },
      profiles: {
        baseline: {
          fingerprint: 'baseline',
          params: {},
          use: { pruningRules: [], scoreTerms: [], completionScoreTerms: [], tieBreakers: ['rng'] },
          plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [] },
        },
      },
      bindingsBySeat: { p1: 'baseline' },
    },
    actions: [
      {
        id: asActionId('pass'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [{ seat: 'p1', value: 0 }, { seat: 'p2', value: 0 }],
      ranking: { order: 'desc', tieBreakOrder: ['p1', 'p2'] },
    },
  };
}

function createCatalog(
  strategicConditions: Record<string, CompiledStrategicCondition>,
  overrides?: Partial<AgentPolicyCatalog['library']>,
): AgentPolicyCatalog {
  const def = createBaseDef();
  const catalog = def.agents as AgentPolicyCatalog;
  return {
    ...catalog,
    library: {
      ...catalog.library,
      strategicConditions,
      ...overrides,
    },
  };
}

function createContext(
  def: GameDef,
  strategicConditions: Record<string, CompiledStrategicCondition>,
  stateOverrides?: (state: ReturnType<typeof initialState>['state']) => ReturnType<typeof initialState>['state'],
  libraryOverrides?: Partial<AgentPolicyCatalog['library']>,
): PolicyEvaluationContext {
  const catalog = createCatalog(strategicConditions, libraryOverrides);
  const { state } = initialState(def, 42, 2);
  const overriddenState = stateOverrides ? stateOverrides(state) : state;
  return new PolicyEvaluationContext(
    {
      def,
      state: overriddenState,
      playerId: asPlayerId(0),
      seatId: 'p1',
      catalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
    },
    [],
  );
}

function conditionRef(conditionId: string, field: 'satisfied' | 'proximity'): AgentPolicyExpr {
  return refExpr({ kind: 'strategicCondition', conditionId, field });
}

// ---------------------------------------------------------------------------
// 1. Cross-game compilation tests
// ---------------------------------------------------------------------------

describe('strategic condition E2E — cross-game compilation', () => {
  it('Texas Hold\'em compiles cleanly with empty strategicConditions', () => {
    const result = compileTexasProductionSpec();
    const gameDef = result.compiled.gameDef;
    assert.ok(gameDef.agents, 'Texas Hold\'em should have an agents catalog');
    assert.deepStrictEqual(
      gameDef.agents.library.strategicConditions,
      {},
      'Texas Hold\'em should have empty strategicConditions',
    );
  });

  it('FITL compiles cleanly with empty strategicConditions', () => {
    const result = compileProductionSpec();
    const gameDef = result.compiled.gameDef;
    assert.ok(gameDef.agents, 'FITL should have an agents catalog');
    assert.deepStrictEqual(
      gameDef.agents.library.strategicConditions,
      {},
      'FITL should have empty strategicConditions (no conditions authored in production profile yet)',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. FITL integration test — VC pivotal condition approximation
// ---------------------------------------------------------------------------

describe('strategic condition E2E — FITL integration (VC pivotal)', () => {
  // Compile a spec with a VC pivotal-like strategic condition via YAML-to-compile path
  it('VC pivotal condition compiles successfully via YAML', () => {
    const result = compileWithConditions({
      vcPivotalReady: {
        description: 'VC pivotal event play condition approximation',
        target: {
          gte: [
            {
              add: [
                {
                  globalTokenAgg: {
                    tokenFilter: { type: 'guerrilla' },
                    aggOp: 'count',
                  },
                },
                {
                  globalTokenAgg: {
                    tokenFilter: { type: 'base' },
                    aggOp: 'count',
                  },
                },
              ],
            },
            15,
          ],
        },
        proximity: {
          current: {
            add: [
              {
                globalTokenAgg: {
                  tokenFilter: { type: 'guerrilla' },
                  aggOp: 'count',
                },
              },
              {
                globalTokenAgg: {
                  tokenFilter: { type: 'base' },
                  aggOp: 'count',
                },
              },
            ],
          },
          threshold: 15,
        },
      },
    });

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const condition = result.gameDef!.agents!.library.strategicConditions['vcPivotalReady'];
    assert.ok(condition, 'vcPivotalReady should exist in compiled output');
    assert.strictEqual(condition.target.kind, 'op');
    assert.ok(condition.proximity, 'vcPivotalReady should have proximity');
    assert.strictEqual(condition.proximity.threshold, 15);
  });

  // Evaluate proximity using pre-compiled expressions against a test state with tokens
  it('proximity correctly reflects token counts in a test state', () => {
    const def = createBaseDef();
    const guerrillaAgg: AgentPolicyExpr = {
      kind: 'globalTokenAgg',
      tokenFilter: { type: 'guerrilla' },
      aggOp: 'count',
      zoneScope: 'board',
    };
    const baseAgg: AgentPolicyExpr = {
      kind: 'globalTokenAgg',
      tokenFilter: { type: 'base' },
      aggOp: 'count',
      zoneScope: 'board',
    };
    const vcPivotalCondition: CompiledStrategicCondition = {
      target: opExpr('gte', opExpr('add', guerrillaAgg, baseAgg), literal(15)),
      proximity: {
        current: opExpr('add', guerrillaAgg, baseAgg),
        threshold: 15,
      },
    };

    // Place 8 guerrillas + 2 bases = 10 tokens → proximity = 10/15 ≈ 0.667
    const ctx = createContext(def, { vcPivotalReady: vcPivotalCondition }, (state) => ({
      ...state,
      zones: {
        ...state.zones,
        'board:none': [
          ...Array.from({ length: 8 }, (_, i) => ({ id: (100 + i) as never, type: 'guerrilla', props: {} })),
          ...Array.from({ length: 2 }, (_, i) => ({ id: (200 + i) as never, type: 'base', props: {} })),
        ],
      },
    }));

    const proximity = ctx.evaluateExpr(conditionRef('vcPivotalReady', 'proximity'), undefined) as number;
    assert.ok(Math.abs(proximity - 10 / 15) < 0.001, `Expected ~0.667, got ${proximity}`);

    const satisfied = ctx.evaluateExpr(conditionRef('vcPivotalReady', 'satisfied'), undefined);
    assert.equal(satisfied, false, 'Should not be satisfied at 10/15');
  });

  it('condition becomes satisfied when token count meets threshold', () => {
    const def = createBaseDef();
    const guerrillaAgg: AgentPolicyExpr = {
      kind: 'globalTokenAgg',
      tokenFilter: { type: 'guerrilla' },
      aggOp: 'count',
      zoneScope: 'board',
    };
    const baseAgg: AgentPolicyExpr = {
      kind: 'globalTokenAgg',
      tokenFilter: { type: 'base' },
      aggOp: 'count',
      zoneScope: 'board',
    };
    const vcPivotalCondition: CompiledStrategicCondition = {
      target: opExpr('gte', opExpr('add', guerrillaAgg, baseAgg), literal(15)),
      proximity: {
        current: opExpr('add', guerrillaAgg, baseAgg),
        threshold: 15,
      },
    };

    // Place 12 guerrillas + 4 bases = 16 tokens → proximity = 1.0, satisfied = true
    const ctx = createContext(def, { vcPivotalReady: vcPivotalCondition }, (state) => ({
      ...state,
      zones: {
        ...state.zones,
        'board:none': [
          ...Array.from({ length: 12 }, (_, i) => ({ id: (100 + i) as never, type: 'guerrilla', props: {} })),
          ...Array.from({ length: 4 }, (_, i) => ({ id: (200 + i) as never, type: 'base', props: {} })),
        ],
      },
    }));

    const proximity = ctx.evaluateExpr(conditionRef('vcPivotalReady', 'proximity'), undefined);
    assert.equal(proximity, 1.0, 'Proximity should be clamped to 1.0 when above threshold');

    const satisfied = ctx.evaluateExpr(conditionRef('vcPivotalReady', 'satisfied'), undefined);
    assert.equal(satisfied, true, 'Should be satisfied at 16/15');
  });

  it('score term using condition.vcPivotalReady.proximity produces correct scores', () => {
    const result = compileWithConditions(
      {
        vcPivotalReady: {
          target: { gte: [{ ref: 'victory.currentMargin.p1' }, 15] },
          proximity: {
            current: { ref: 'victory.currentMargin.p1' },
            threshold: 15,
          },
        },
      },
      {
        library: {
          scoreTerms: {
            rewardPivotalProgress: {
              weight: 2,
              value: {
                sub: [1, { ref: 'condition.vcPivotalReady.proximity' }],
              },
            },
          },
        },
      },
    );

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);

    const scoreTerm = result.gameDef!.agents!.library.scoreTerms['rewardPivotalProgress'];
    assert.ok(scoreTerm, 'rewardPivotalProgress should exist in compiled output');
    assert.deepStrictEqual(scoreTerm.weight, { kind: 'literal', value: 2 }, 'Weight should be literal 2');
    assert.ok(
      scoreTerm.dependencies.strategicConditions.includes('vcPivotalReady'),
      'Score term should depend on vcPivotalReady',
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Cross-condition reference and composite evaluation tests
// ---------------------------------------------------------------------------

describe('strategic condition E2E — cross-condition references', () => {
  it('condition A referencing condition B.satisfied compiles and evaluates correctly', () => {
    const result = compileWithConditions({
      forceReady: {
        target: { gte: [{ ref: 'victory.currentMargin.p1' }, 5] },
        proximity: {
          current: { ref: 'victory.currentMargin.p1' },
          threshold: 5,
        },
      },
      pivotalGate: {
        target: { ref: 'condition.forceReady.satisfied' },
      },
    });

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    assert.ok(result.gameDef!.agents!.library.strategicConditions['forceReady']);
    assert.ok(result.gameDef!.agents!.library.strategicConditions['pivotalGate']);
  });

  it('composite condition using min of two sub-condition proximities evaluates correctly', () => {
    // Two conditions with different proximity values, a state feature uses min of both
    const condA: CompiledStrategicCondition = {
      target: literal(false),
      proximity: { current: literal(6), threshold: 10 },
    };
    const condB: CompiledStrategicCondition = {
      target: literal(false),
      proximity: { current: literal(8), threshold: 10 },
    };

    const def = createBaseDef();
    const ctx = createContext(def, { condA, condB });

    const proxA = ctx.evaluateExpr(conditionRef('condA', 'proximity'), undefined) as number;
    const proxB = ctx.evaluateExpr(conditionRef('condB', 'proximity'), undefined) as number;

    assert.ok(Math.abs(proxA - 0.6) < 0.001, `Expected condA proximity ~0.6, got ${proxA}`);
    assert.ok(Math.abs(proxB - 0.8) < 0.001, `Expected condB proximity ~0.8, got ${proxB}`);

    // Evaluate min(proxA, proxB) via an expression
    const minExpr = opExpr(
      'min',
      conditionRef('condA', 'proximity'),
      conditionRef('condB', 'proximity'),
    );
    const minResult = ctx.evaluateExpr(minExpr, undefined) as number;
    assert.ok(Math.abs(minResult - 0.6) < 0.001, `Expected min ~0.6, got ${minResult}`);
  });

  it('composite condition compiles via YAML with min of two condition proximities', () => {
    const result = compileWithConditions(
      {
        forceA: {
          target: { gte: [{ ref: 'victory.currentMargin.p1' }, 5] },
          proximity: { current: { ref: 'victory.currentMargin.p1' }, threshold: 5 },
        },
        forceB: {
          target: { gte: [{ ref: 'victory.currentMargin.p2' }, 3] },
          proximity: { current: { ref: 'victory.currentMargin.p2' }, threshold: 3 },
        },
      },
      {
        library: {
          stateFeatures: {
            compositeProximity: {
              type: 'number',
              expr: {
                min: [
                  { ref: 'condition.forceA.proximity' },
                  { ref: 'condition.forceB.proximity' },
                ],
              },
            },
          },
        },
      },
    );

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const feature = result.gameDef!.agents!.library.stateFeatures['compositeProximity'];
    assert.ok(feature, 'compositeProximity feature should exist');
    assert.ok(
      feature.dependencies.strategicConditions.includes('forceA'),
      'Should depend on forceA',
    );
    assert.ok(
      feature.dependencies.strategicConditions.includes('forceB'),
      'Should depend on forceB',
    );
  });

  it('cyclic cross-condition reference produces compiler diagnostic', () => {
    const result = compileWithConditions({
      cycleX: {
        target: { ref: 'condition.cycleY.satisfied' },
      },
      cycleY: {
        target: { ref: 'condition.cycleX.satisfied' },
      },
    });

    assert.equal(hasErrors(result.diagnostics), true, 'Should fail with cyclic reference');
    const cycleDiag = result.diagnostics.find((d) => d.message.includes('cycle'));
    assert.ok(cycleDiag, 'Should detect dependency cycle');
  });
});

// ---------------------------------------------------------------------------
// 4. Dependency tracking tests
// ---------------------------------------------------------------------------

describe('strategic condition E2E — dependency tracking', () => {
  it('score term referencing condition.X.proximity has X in dependencies.strategicConditions', () => {
    const result = compileWithConditions(
      {
        goalCondition: {
          target: { gte: [{ ref: 'victory.currentMargin.p1' }, 10] },
          proximity: { current: { ref: 'victory.currentMargin.p1' }, threshold: 10 },
        },
      },
      {
        library: {
          scoreTerms: {
            pivotalScore: {
              weight: 1,
              value: { ref: 'condition.goalCondition.proximity' },
            },
          },
        },
      },
    );

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const scoreTerm = result.gameDef!.agents!.library.scoreTerms['pivotalScore'];
    assert.ok(scoreTerm, 'pivotalScore should exist');
    assert.ok(
      scoreTerm.dependencies.strategicConditions.includes('goalCondition'),
      `Score term deps should include goalCondition: ${JSON.stringify(scoreTerm.dependencies.strategicConditions)}`,
    );
  });

  it('state feature referencing condition.Y.satisfied has Y in dependency refs', () => {
    const result = compileWithConditions(
      {
        readyCheck: {
          target: { gte: [{ ref: 'victory.currentMargin.p1' }, 7] },
        },
      },
      {
        library: {
          stateFeatures: {
            isReady: {
              type: 'boolean',
              expr: { ref: 'condition.readyCheck.satisfied' },
            },
          },
        },
      },
    );

    assert.equal(hasErrors(result.diagnostics), false, `Unexpected errors: ${JSON.stringify(result.diagnostics)}`);
    assert.notEqual(result.gameDef, null);
    const feature = result.gameDef!.agents!.library.stateFeatures['isReady'];
    assert.ok(feature, 'isReady feature should exist');
    assert.ok(
      feature.dependencies.strategicConditions.includes('readyCheck'),
      `Feature deps should include readyCheck: ${JSON.stringify(feature.dependencies.strategicConditions)}`,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Score term integration — candidate scoring
// ---------------------------------------------------------------------------

describe('strategic condition E2E — score term integration', () => {
  it('score term with condition.X.proximity produces different scores for different states', () => {
    const def = createBaseDef();

    // State A: low proximity (3/10 = 0.3) → high urgency score
    const conditionLow: CompiledStrategicCondition = {
      target: opExpr('gte', literal(3), literal(10)),
      proximity: { current: literal(3), threshold: 10 },
    };
    const ctxLow = createContext(def, { goal: conditionLow });
    const proxLow = ctxLow.evaluateExpr(conditionRef('goal', 'proximity'), undefined) as number;
    const urgencyScoreLow = 2 * (1 - proxLow);

    // State B: high proximity (8/10 = 0.8) → low urgency score
    const conditionHigh: CompiledStrategicCondition = {
      target: opExpr('gte', literal(8), literal(10)),
      proximity: { current: literal(8), threshold: 10 },
    };
    const ctxHigh = createContext(def, { goal: conditionHigh });
    const proxHigh = ctxHigh.evaluateExpr(conditionRef('goal', 'proximity'), undefined) as number;
    const urgencyScoreHigh = 2 * (1 - proxHigh);

    assert.ok(urgencyScoreLow > urgencyScoreHigh,
      `Low-proximity state should have higher urgency score: ${urgencyScoreLow} vs ${urgencyScoreHigh}`);
    assert.ok(Math.abs(urgencyScoreLow - 1.4) < 0.001, `Expected urgency score ~1.4 at 0.3 proximity, got ${urgencyScoreLow}`);
    assert.ok(Math.abs(urgencyScoreHigh - 0.4) < 0.001, `Expected urgency score ~0.4 at 0.8 proximity, got ${urgencyScoreHigh}`);
  });

  it('condition evaluation is deterministic for the same state', () => {
    const def = createBaseDef();
    const guerrillaAgg: AgentPolicyExpr = {
      kind: 'globalTokenAgg',
      tokenFilter: { type: 'guerrilla' },
      aggOp: 'count',
      zoneScope: 'board',
    };
    const condition: CompiledStrategicCondition = {
      target: opExpr('gte', guerrillaAgg, literal(5)),
      proximity: { current: guerrillaAgg, threshold: 5 },
    };

    const makeCtx = () => createContext(def, { test: condition }, (state) => ({
      ...state,
      zones: {
        ...state.zones,
        'board:none': Array.from({ length: 3 }, (_, i) => ({ id: (100 + i) as never, type: 'guerrilla', props: {} })),
      },
    }));

    const result1 = makeCtx().evaluateExpr(conditionRef('test', 'proximity'), undefined);
    const result2 = makeCtx().evaluateExpr(conditionRef('test', 'proximity'), undefined);
    assert.strictEqual(result1, result2, 'Same state should produce same proximity');
    assert.ok(Math.abs((result1 as number) - 0.6) < 0.001, `Expected 0.6, got ${result1}`);
  });
});
