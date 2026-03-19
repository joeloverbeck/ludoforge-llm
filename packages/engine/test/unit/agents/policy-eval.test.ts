import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove, evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  initialState,
  type AgentPolicyCatalog,
  type GameDef,
  type Move,
  type ActionDef,
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

function createBaseDef(agents: AgentPolicyCatalog): GameDef {
  return {
    metadata: { id: 'policy-eval', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'usMargin', type: 'int', init: 1, min: -10, max: 10 }],
    perPlayerVars: [{ name: 'tempo', type: 'int', init: 0, min: 0, max: 10 }],
    zones: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents,
    actions: [createAction('pass'), createAction('event'), createAction('operation'), createAction('alpha'), createAction('beta')],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { ref: 'gvar', var: 'usMargin' } },
        { seat: 'arvn', value: 0 },
      ],
      ranking: {
        order: 'desc',
        tieBreakOrder: ['us', 'arvn'],
      },
    },
  };
}

function createCatalog(overrides: Partial<AgentPolicyCatalog['library']> = {}, profileOverrides?: Partial<AgentPolicyCatalog['profiles']['baseline']>): AgentPolicyCatalog {
  return {
    schemaVersion: 1,
    catalogFingerprint: 'catalog',
    parameterDefs: {
      passFloor: {
        type: 'number',
        required: false,
        tunable: true,
        default: 0.5,
        min: -5,
        max: 5,
      },
    },
    library: {
      stateFeatures: {
        currentMargin: {
          type: 'number',
          costClass: 'state',
          expr: { ref: 'victory.currentMargin.us' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        ...(overrides.stateFeatures ?? {}),
      },
      candidateFeatures: {
        isPass: {
          type: 'boolean',
          costClass: 'candidate',
          expr: { ref: 'candidate.isPass' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        isEvent: {
          type: 'boolean',
          costClass: 'candidate',
          expr: { eq: [{ ref: 'candidate.actionId' }, 'event'] },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        ...(overrides.candidateFeatures ?? {}),
      },
      candidateAggregates: {
        bestNonPassMargin: {
          type: 'number',
          costClass: 'candidate',
          op: 'max',
          of: { ref: 'feature.currentMargin' },
          where: { not: { ref: 'feature.isPass' } },
          dependencies: {
            parameters: [],
            stateFeatures: ['currentMargin'],
            candidateFeatures: ['isPass'],
            aggregates: [],
          },
        },
        ...(overrides.candidateAggregates ?? {}),
      },
      pruningRules: {
        dropPassWhenMarginExists: {
          costClass: 'candidate',
          when: {
            and: [
              { ref: 'feature.isPass' },
              { gt: [{ ref: 'aggregate.bestNonPassMargin' }, { param: 'passFloor' }] },
            ],
          },
          dependencies: {
            parameters: ['passFloor'],
            stateFeatures: [],
            candidateFeatures: ['isPass'],
            aggregates: ['bestNonPassMargin'],
          },
          onEmpty: 'skipRule',
        },
        ...(overrides.pruningRules ?? {}),
      },
      scoreTerms: {
        preferEvents: {
          costClass: 'candidate',
          weight: 10,
          value: { boolToNumber: { ref: 'feature.isEvent' } },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['isEvent'], aggregates: [] },
        },
        ...(overrides.scoreTerms ?? {}),
      },
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        rng: {
          kind: 'rng',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        ...(overrides.tieBreakers ?? {}),
      },
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: { passFloor: 0.5 },
        use: {
          pruningRules: ['dropPassWhenMarginExists'],
          scoreTerms: ['preferEvents'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: ['currentMargin'],
          candidateFeatures: ['isPass', 'isEvent'],
          candidateAggregates: ['bestNonPassMargin'],
        },
        ...profileOverrides,
      },
    },
    bindingsBySeat: {
      us: 'baseline',
    },
  };
}

function createMoves(...actionIds: string[]): readonly Move[] {
  return actionIds.map((actionId) => ({ actionId: asActionId(actionId), params: {} }));
}

function createInput(agents: AgentPolicyCatalog, legalMoves: readonly Move[], seed = 7n) {
  const def = createBaseDef(agents);
  const state = initialState(def, Number(seed), 2).state;
  return {
    def,
    state: {
      ...state,
      globalVars: {
        ...state.globalVars,
        usMargin: 1,
      },
    },
    playerId: asPlayerId(0),
    legalMoves,
    rng: createRng(seed),
  } as const;
}

describe('policy-eval', () => {
  it('prunes pass, scores surviving candidates, and resolves deterministic ties by stable move key', () => {
    const input = createInput(createCatalog(), createMoves('operation', 'pass', 'event'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('event'));
    assert.equal(result.metadata.usedFallback, false);
    assert.equal(result.metadata.failure, null);
    assert.deepEqual(result.metadata.canonicalOrder, [
      'event|{}|false|unclassified',
      'operation|{}|false|unclassified',
      'pass|{}|false|unclassified',
    ]);
    assert.deepEqual(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'pass')?.prunedBy,
      ['dropPassWhenMarginExists'],
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'event')?.score,
      10,
    );
  });

  it('treats skipRule pruning as non-destructive when it would empty the candidate set', () => {
    const agents = createCatalog(
      {
        pruningRules: {
          pruneEverything: {
            costClass: 'candidate',
            when: true,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
            onEmpty: 'skipRule',
          },
        },
      },
      {
        use: {
          pruningRules: ['pruneEverything'],
          scoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.deepEqual(
      result.metadata.candidates.map((candidate) => candidate.prunedBy),
      [[], []],
    );
  });

  it('returns failure metadata from the core and canonical fallback from the public helper when pruning onEmpty is error', () => {
    const agents = createCatalog(
      {
        pruningRules: {
          pruneEverything: {
            costClass: 'candidate',
            when: true,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
            onEmpty: 'error',
          },
        },
      },
      {
        use: {
          pruningRules: ['pruneEverything'],
          scoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const core = evaluatePolicyMoveCore(input);
    assert.equal(core.kind, 'failure');
    if (core.kind === 'failure') {
      assert.equal(core.failure.code, 'PRUNING_RULE_EMPTIED_CANDIDATES');
    }

    const fallback = evaluatePolicyMove(input);
    assert.equal(fallback.move.actionId, asActionId('alpha'));
    assert.equal(fallback.metadata.usedFallback, true);
    assert.equal(fallback.metadata.failure?.code, 'PRUNING_RULE_EMPTIED_CANDIDATES');
  });

  it('reports preview-backed profiles as unsupported and falls back canonically', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          previewMargin: {
            type: 'number',
            costClass: 'preview',
            expr: { ref: 'preview.victory.currentMargin.us' },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferPreviewMargin: {
            costClass: 'preview',
            weight: 1,
            value: { ref: 'feature.previewMargin' },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['previewMargin'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferPreviewMargin'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['previewMargin'],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(result.metadata.usedFallback, true);
    assert.equal(result.metadata.failure?.code, 'UNSUPPORTED_PREVIEW');
  });

  it('reports metric refs as unsupported until the shared runtime metric contract is executable', () => {
    const agents = createCatalog(
      {
        stateFeatures: {
          unsupportedMetric: {
            type: 'number',
            costClass: 'state',
            expr: { ref: 'metric.boardPressure' },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferMetric: {
            costClass: 'state',
            weight: 1,
            value: { ref: 'feature.unsupportedMetric' },
            dependencies: { parameters: [], stateFeatures: ['unsupportedMetric'], candidateFeatures: [], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferMetric'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: ['unsupportedMetric'],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(result.metadata.usedFallback, true);
    assert.equal(result.metadata.failure?.code, 'UNSUPPORTED_RUNTIME_REF');
  });
});
