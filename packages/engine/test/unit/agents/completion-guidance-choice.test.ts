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

function completionConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalog['library']['considerations'][string], 'scopes'>>,
): AgentPolicyCatalog['library']['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['completion'], ...definition }]),
  );
}

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
    preview: { mode: 'exactWorld' },
    selection: { mode: 'argmax' },
    use: {
      pruningRules: [],
      considerations: ['preferTarget'],
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations: ['preferTarget'],
    },
    ...overrides,
  };
}

function createCatalog(
  considerations: AgentPolicyCatalog['library']['considerations'],
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
      considerations,
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
  considerations: AgentPolicyCatalog['library']['considerations'],
  profile: CompiledAgentProfile = createProfile(),
) {
  const catalog = createCatalog(considerations, profile);
  const def = createDef(catalog);
  return {
    catalog,
    def,
    profile,
    state: initialState(def, 7, 2).state,
  } as const;
}

describe('completion-guidance-choice', () => {
  it('returns undefined when no completion-scoped considerations are configured', () => {
    const harness = createHarness({}, createProfile({
      use: { pruningRules: [], considerations: [], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
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

  it('returns undefined when the profile references no completion considerations', () => {
    const harness = createHarness({}, createProfile({
      use: { pruningRules: [], considerations: [], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
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
    const harness = createHarness(completionConsiderations({
      preferZoneB: {
        costClass: 'state',
        when: literal(true),
        weight: literal(5),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-b'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }), createProfile({
      use: { pruningRules: [], considerations: ['preferZoneB'], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: ['preferZoneB'] },
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
    const harness = createHarness(completionConsiderations({
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
    }), createProfile({
      use: { pruningRules: [], considerations: ['preferZoneA', 'preferZoneB'], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: ['preferZoneA', 'preferZoneB'] },
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

  it('returns undefined when no positive completion score exists', () => {
    const harness = createHarness(completionConsiderations({
      noMatch: {
        costClass: 'state',
        when: literal(false),
        weight: literal(1),
        value: literal(100),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }), createProfile({
      use: { pruningRules: [], considerations: ['noMatch'], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: ['noMatch'] },
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
    const harness = createHarness(completionConsiderations({
      preferZoneB: {
        costClass: 'state',
        when: literal(true),
        weight: literal(5),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-b'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }), createProfile({
      use: { pruningRules: [], considerations: ['preferZoneB'], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: ['preferZoneB'] },
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
    const harness = createHarness(completionConsiderations({
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
    }), createProfile({
      use: { pruningRules: [], considerations: ['preferZoneA', 'preferZoneC'], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: ['preferZoneA', 'preferZoneC'] },
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
    const harness = createHarness(completionConsiderations({
      preferZoneB: {
        costClass: 'state',
        when: literal(true),
        weight: literal(5),
        value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('zone-b'))),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }), createProfile({
      use: { pruningRules: [], considerations: ['preferZoneB'], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: ['preferZoneB'] },
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

  it('returns undefined for chooseN when no option has a positive score', () => {
    const harness = createHarness(completionConsiderations({
      noMatch: {
        costClass: 'state',
        when: literal(false),
        weight: literal(1),
        value: literal(100),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    }), createProfile({
      use: { pruningRules: [], considerations: ['noMatch'], tieBreakers: [] },
      plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: ['noMatch'] },
    }));

    const choose = buildCompletionChooseCallback({
      state: harness.state,
      def: harness.def,
      catalog: harness.catalog,
      playerId: asPlayerId(0),
      seatId: 'us',
      profile: harness.profile,
    });

    assert.equal(choose?.(createChooseNRequest({ min: 2, max: 3 })), undefined);
  });
});
