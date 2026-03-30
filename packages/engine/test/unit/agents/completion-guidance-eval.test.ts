import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scoreCompletionOption } from '../../../src/agents/completion-guidance-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  initialState,
  type ActionDef,
  type AgentParameterValue,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type ChoicePendingRequest,
  type CompiledAgentPolicyRef,
  type GameDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');
const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});
const paramExpr = (id: string): AgentPolicyExpr => ({ kind: 'param', id });

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

function createCatalog(
  completionScoreTerms: AgentPolicyCatalog['library']['completionScoreTerms'],
  parameterDefs: AgentPolicyCatalog['parameterDefs'] = {},
): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'completion-guidance-catalog',
    surfaceVisibility: {
      globalVars: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
        currentRank: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
      },
    },
    parameterDefs,
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {},
      completionScoreTerms,
      tieBreakers: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        use: {
          pruningRules: [],
          scoreTerms: [],
          completionScoreTerms: Object.keys(completionScoreTerms),
          tieBreakers: [],
        },
        plan: {
          stateFeatures: [],
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

function createDef(agents: AgentPolicyCatalog): GameDef {
  return {
    metadata: { id: 'completion-guidance-eval', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('target-a:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province' },
      { id: asZoneId('target-b:none'), owner: 'none', visibility: 'public', ordering: 'set', category: 'province' },
      { id: asZoneId('zone-a:0'), owner: 'player', visibility: 'owner', ordering: 'set' },
      { id: asZoneId('zone-b:0'), owner: 'player', visibility: 'owner', ordering: 'set' },
    ],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents,
    actions: [createAction('pass')],
    triggers: [],
    terminal: { conditions: [] },
  };
}

function createChoiceRequest(overrides: Partial<ChoicePendingRequest> = {}): ChoicePendingRequest {
  return {
    kind: 'pending',
    complete: false,
    decisionKey: '$target',
    type: 'chooseOne',
    name: '$target',
    options: [
      { value: 'target-a:none', legality: 'legal', illegalReason: null },
      { value: 'target-b:none', legality: 'legal', illegalReason: null },
    ],
    targetKinds: ['zone'],
    ...overrides,
  } as ChoicePendingRequest;
}

function createHarness(
  completionScoreTerms: AgentPolicyCatalog['library']['completionScoreTerms'],
  parameterDefs: AgentPolicyCatalog['parameterDefs'] = {},
) {
  const catalog = createCatalog(completionScoreTerms, parameterDefs);
  const def = createDef(catalog);
  const state = initialState(def, 7, 2).state;
  return {
    catalog,
    def,
    state,
    playerId: asPlayerId(0),
    seatId: 'us',
  } as const;
}

describe('completion-guidance-eval', () => {
  it('scores a single completion term when its predicate matches', () => {
    const harness = createHarness({
      constant: {
        costClass: 'state',
        when: literal(true),
        weight: literal(2),
        value: literal(3),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
      },
    });

    const score = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {},
      createChoiceRequest(),
      'zone-a',
      ['constant'],
    );

    assert.equal(score, 6);
  });

  it('returns zero when the completion term predicate does not match', () => {
    const harness = createHarness({
      gated: {
        costClass: 'state',
        when: literal(false),
        weight: literal(9),
        value: literal(9),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
      },
    });

    const score = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {},
      createChoiceRequest(),
      'zone-a',
      ['gated'],
    );

    assert.equal(score, 0);
  });

  it('filters by decision.targetKind', () => {
    const harness = createHarness({
      onlyZones: {
        costClass: 'state',
        when: opExpr('eq', refExpr({ kind: 'decisionIntrinsic', intrinsic: 'targetKind' }), literal('zone')),
        weight: literal(5),
        value: literal(1),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
      },
    });

    const zoneScore = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {},
      createChoiceRequest({ targetKinds: ['zone'] }),
      'zone-a',
      ['onlyZones'],
    );
    const tokenScore = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {},
      createChoiceRequest({ targetKinds: ['token'] }),
      'zone-a',
      ['onlyZones'],
    );

    assert.equal(zoneScore, 5);
    assert.equal(tokenScore, 0);
  });

  it('resolves dynamic zoneTokenAgg zones from option.value', () => {
    const harness = createHarness({
      zoneLoad: {
        costClass: 'state',
        when: literal(true),
        weight: literal(1),
        value: {
          kind: 'zoneTokenAgg',
          zone: refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }),
          owner: 'self',
          prop: 'strength',
          aggOp: 'sum',
        },
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
      },
    });
    const state = {
      ...harness.state,
      zones: {
        ...harness.state.zones,
        'target-a:none': [
          { id: asTokenId('t0'), type: 'unit', props: { strength: 2 } },
          { id: asTokenId('t1'), type: 'unit', props: { strength: 3 } },
        ],
        'target-b:none': [
          { id: asTokenId('t2'), type: 'unit', props: { strength: 1 } },
        ],
      },
    };

    const scoreA = scoreCompletionOption(
      state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {},
      createChoiceRequest(),
      'target-a:none',
      ['zoneLoad'],
    );
    const scoreB = scoreCompletionOption(
      state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {},
      createChoiceRequest(),
      'target-b:none',
      ['zoneLoad'],
    );

    assert.equal(scoreA, 5);
    assert.equal(scoreB, 1);
  });

  it('treats unresolved dynamic zone strings as unknown rather than zero', () => {
    const harness = createHarness({
      invalidZone: {
        costClass: 'state',
        when: literal(true),
        weight: literal(2),
        value: {
          kind: 'zoneTokenAgg',
          zone: paramExpr('badZone'),
          owner: 'self',
          prop: 'strength',
          aggOp: 'sum',
        },
        unknownAs: 7,
        dependencies: { parameters: ['badZone'], stateFeatures: [], candidateFeatures: [], aggregates: [] },
      },
    }, {
      badZone: {
        type: 'enum',
        required: false,
        tunable: true,
        default: 'target-a:none',
        values: ['target-a:none', 'missing-space'],
      },
    });

    const score = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      { badZone: 'missing-space' },
      createChoiceRequest(),
      'target-a:none',
      ['invalidZone'],
    );

    assert.equal(score, 7);
  });

  it('applies unknownAs when the value expression resolves to undefined', () => {
    const harness = createHarness(
      {
        invalidZone: {
          costClass: 'state',
          when: literal(true),
          weight: literal(2),
          value: {
            kind: 'zoneTokenAgg',
            zone: paramExpr('badZone'),
            owner: 'self',
            prop: 'strength',
            aggOp: 'sum',
          },
          unknownAs: 7,
          dependencies: { parameters: ['badZone'], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
      {
        badZone: {
          type: 'number',
          required: false,
          tunable: true,
          default: 0,
        },
      },
    );

    const score = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      { badZone: 3 },
      createChoiceRequest(),
      'target-a:none',
      ['invalidZone'],
    );

    assert.equal(score, 7);
  });

  it('applies clamp semantics identical to move scoring', () => {
    const harness = createHarness({
      clamped: {
        costClass: 'state',
        when: literal(true),
        weight: literal(3),
        value: literal(4),
        clamp: { max: 10 },
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
      },
    });

    const score = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {},
      createChoiceRequest(),
      'target-a:none',
      ['clamped'],
    );

    assert.equal(score, 10);
  });

  it('accumulates multiple completion score terms', () => {
    const harness = createHarness({
      first: {
        costClass: 'state',
        when: literal(true),
        weight: literal(2),
        value: literal(3),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
      },
      second: {
        costClass: 'state',
        when: literal(true),
        weight: literal(4),
        value: literal(1),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
      },
    });

    const score = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {},
      createChoiceRequest(),
      'target-a:none',
      ['first', 'second'],
    );

    assert.equal(score, 10);
  });

  it('uses caller-supplied parameterValues for parameterized terms', () => {
    const harness = createHarness(
      {
        weighted: {
          costClass: 'state',
          when: literal(true),
          weight: paramExpr('zoneWeight'),
          value: literal(2),
          dependencies: { parameters: ['zoneWeight'], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
      },
      {
        zoneWeight: {
          type: 'number',
          required: false,
          tunable: true,
          default: 1,
          min: -10,
          max: 10,
        },
      },
    );

    const lowScore = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      { zoneWeight: 2 },
      createChoiceRequest(),
      'target-a:none',
      ['weighted'],
    );
    const highScore = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      { zoneWeight: 5 },
      createChoiceRequest(),
      'target-a:none',
      ['weighted'],
    );

    assert.equal(lowScore, 4);
    assert.equal(highScore, 10);
  });

  it('returns zero when no completion score terms are requested', () => {
    const harness = createHarness({});

    const score = scoreCompletionOption(
      harness.state,
      harness.def,
      harness.catalog,
      harness.playerId,
      harness.seatId,
      {} satisfies Readonly<Record<string, AgentParameterValue>>,
      createChoiceRequest(),
      'target-a:none',
      [],
    );

    assert.equal(score, 0);
  });
});
