import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCompletionChooseCallback } from '../../../src/agents/completion-guidance-choice.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  initialState,
  type ActionDef,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type ChoicePendingRequest,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');
const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

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

function createProfile(
  overrides: Partial<CompiledAgentProfile> = {},
): CompiledAgentProfile {
  return {
    fingerprint: 'baseline',
    params: {},
    use: {
      pruningRules: [],
      scoreTerms: [],
      completionScoreTerms: ['preferTarget'],
      tieBreakers: [],
    },
    completionGuidance: {
      enabled: true,
      fallback: 'random',
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
    },
    ...overrides,
  };
}

function createCatalog(
  completionScoreTerms: AgentPolicyCatalog['library']['completionScoreTerms'],
  profile: CompiledAgentProfile = createProfile(),
): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'completion-guidance-choice-catalog',
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
      activeCardAnnotation: {
        current: 'hidden',
        preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
      },
    },
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      pruningRules: {},
      scoreTerms: {},
      completionScoreTerms,
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: profile,
    },
    bindingsBySeat: {
      us: 'baseline',
    },
  };
}

function createDef(catalog: AgentPolicyCatalog): GameDef {
  return {
    metadata: { id: 'completion-guidance-choice', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
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
      { value: 'zone-a', legality: 'legal', illegalReason: null },
      { value: 'zone-b', legality: 'legal', illegalReason: null },
    ],
    targetKinds: ['zone'],
    ...overrides,
  } as ChoicePendingRequest;
}

function createChooseNRequest(overrides: Partial<ChoicePendingRequest> = {}): ChoicePendingRequest {
  return {
    kind: 'pending',
    complete: false,
    decisionKey: '$targets',
    type: 'chooseN',
    name: '$targets',
    options: [
      { value: 'zone-a', legality: 'unknown', illegalReason: null },
      { value: 'zone-b', legality: 'unknown', illegalReason: null },
      { value: 'zone-c', legality: 'unknown', illegalReason: null },
    ],
    targetKinds: ['zone'],
    min: 0,
    max: 3,
    selected: [],
    canConfirm: true,
    ...overrides,
  } as ChoicePendingRequest;
}

function createHarness(
  completionScoreTerms: AgentPolicyCatalog['library']['completionScoreTerms'],
  profile: CompiledAgentProfile = createProfile(),
) {
  const catalog = createCatalog(completionScoreTerms, profile);
  const def = createDef(catalog);
  return {
    catalog,
    def,
    profile,
    state: initialState(def, 7, 2).state,
  } as const;
}

describe('completion-guidance-choice', () => {
  it('returns undefined when guidance is disabled', () => {
    const harness = createHarness({}, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: [], tieBreakers: [] },
      completionGuidance: { enabled: false, fallback: 'random' },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.equal(choose, undefined);
  });

  it('returns undefined when no completion score terms are configured', () => {
    const harness = createHarness({}, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: [], tieBreakers: [] },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.equal(choose, undefined);
  });

  it('returns the highest-scoring legal option', () => {
    const harness = createHarness({
      preferZoneB: {
        costClass: 'state',
        when: literal(true),
        weight: literal(5),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-b'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: ['preferZoneB'], tieBreakers: [] },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.equal(choose?.(createChoiceRequest()), 'zone-b');
  });

  it('ignores illegal options when choosing', () => {
    const harness = createHarness({
      preferZoneA: {
        costClass: 'state',
        when: literal(true),
        weight: literal(3),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-a'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      preferZoneB: {
        costClass: 'state',
        when: literal(true),
        weight: literal(10),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-b'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: ['preferZoneA', 'preferZoneB'], tieBreakers: [] },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

      assert.equal(choose?.(createChoiceRequest({
      options: [
        { value: 'zone-a', legality: 'legal', illegalReason: null },
        { value: 'zone-c', legality: 'legal', illegalReason: null },
        { value: 'zone-b', legality: 'illegal', illegalReason: 'emptyDomain' },
      ],
    })), 'zone-a');
  });

  it('returns the first legal option when fallback is first and no positive score exists', () => {
    const harness = createHarness({
      noMatch: {
        costClass: 'state',
        when: literal(false),
        weight: literal(1),
        value: literal(100),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: ['noMatch'], tieBreakers: [] },
      completionGuidance: { enabled: true, fallback: 'first' },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.equal(choose?.(createChoiceRequest()), 'zone-a');
  });

  it('returns undefined when fallback is random and no positive score exists', () => {
    const harness = createHarness({
      noMatch: {
        costClass: 'state',
        when: literal(false),
        weight: literal(1),
        value: literal(100),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: ['noMatch'], tieBreakers: [] },
      completionGuidance: { enabled: true, fallback: 'random' },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.equal(choose?.(createChoiceRequest()), undefined);
  });

  it('scores unknown options when no legal options are available', () => {
    const harness = createHarness({
      preferZoneB: {
        costClass: 'state',
        when: literal(true),
        weight: literal(5),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-b'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: ['preferZoneB'], tieBreakers: [] },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.equal(choose?.(createChoiceRequest({
      options: [
        { value: 'zone-a', legality: 'unknown', illegalReason: null },
        { value: 'zone-b', legality: 'unknown', illegalReason: null },
      ],
    })), 'zone-b');
  });

  it('returns a chooseN subset containing all positive-scoring options up to max', () => {
    const harness = createHarness({
      preferZoneA: {
        costClass: 'state',
        when: literal(true),
        weight: literal(4),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-a'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      preferZoneC: {
        costClass: 'state',
        when: literal(true),
        weight: literal(2),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-c'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: ['preferZoneA', 'preferZoneC'], tieBreakers: [] },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.deepEqual(choose?.(createChooseNRequest({ max: 2 })), ['zone-a', 'zone-c']);
  });

  it('pads chooseN selections up to min using highest-ranked remaining options', () => {
    const harness = createHarness({
      preferZoneB: {
        costClass: 'state',
        when: literal(true),
        weight: literal(5),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-b'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: ['preferZoneB'], tieBreakers: [] },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.deepEqual(choose?.(createChooseNRequest({ min: 2, max: 2 })), ['zone-b', 'zone-a']);
  });

  it('returns the first deterministic chooseN subset when fallback is first', () => {
    const harness = createHarness({
      noMatch: {
        costClass: 'state',
        when: literal(false),
        weight: literal(1),
        value: literal(100),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }, createProfile({
      use: { pruningRules: [], scoreTerms: [], completionScoreTerms: ['noMatch'], tieBreakers: [] },
      completionGuidance: { enabled: true, fallback: 'first' },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.deepEqual(choose?.(createChooseNRequest({ min: 2, max: 3 })), ['zone-a', 'zone-b']);
  });
});
