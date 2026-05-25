// @test-class: architectural-invariant
// Complements policy-evaluation-context-constructor-invariant.test.ts and
// policy-eval-cache-binding-dedup.test.ts by proving outer-state isolation
// across the inner microturn-option wrapper.
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext } from '../../src/agents/policy-evaluation-core.js';
import type { SelectorEvalMicroturnOption } from '../../src/agents/policy-selector-eval.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asZoneId,
  createGameDefRuntime,
  initialState,
  type AgentPolicyCatalog,
  type ChoicePendingRequest,
  type CompiledPolicyExpr,
  type GameDef,
  type GameDefRuntime,
  type GameState,
} from '../../src/kernel/index.js';
import { withCompiledPolicyCatalog } from '../helpers/policy-catalog-fixtures.js';

const phaseId = asPhaseId('main');
const completionRequest: ChoicePendingRequest = {
  kind: 'pending',
  complete: false,
  type: 'chooseOne',
  decisionPlayer: asPlayerId(0),
  decisionKey: '$pick' as ChoicePendingRequest['decisionKey'],
  name: 'pick',
  options: [
    { value: 'left', legality: 'legal', illegalReason: null },
    { value: 'right', legality: 'legal', illegalReason: null },
  ],
  targetKinds: ['zone'],
};
const outerOption: SelectorEvalMicroturnOption = { key: '"left"', value: 'left', index: 0 };
const innerOption: SelectorEvalMicroturnOption = { key: '"right"', value: 'right', index: 1 };
const innerExpr: CompiledPolicyExpr = {
  kind: 'op',
  op: 'and',
  args: [
    {
      kind: 'op',
      op: 'eq',
      args: [
        { kind: 'ref', ref: { kind: 'microturnOptionIntrinsic', intrinsic: 'value' } },
        { kind: 'literal', value: 'right' },
      ],
    },
    {
      kind: 'op',
      op: 'eq',
      args: [
        { kind: 'ref', ref: { kind: 'selectorItemIntrinsic', intrinsic: 'key' } },
        { kind: 'literal', value: 'inner-item' },
      ],
    },
  ],
};

type ContextInternals = {
  readonly input: { readonly cacheBinding: unknown };
  readonly encodedState: unknown;
  readonly encodedStateLayout: unknown;
  readonly encodedZoneIndexById: unknown;
  readonly runtime: unknown;
  readonly runtimeProviders: {
    readonly intrinsics: unknown;
    readonly phaseSchedule: unknown;
    readonly candidates: unknown;
    readonly currentSurface: unknown;
    readonly previewSurface: unknown;
    readonly lookupSurface: unknown;
    readonly completion?: unknown;
  };
  readonly rootStateFeatureCache?: Map<string, unknown>;
  readonly candidateFeatureCache?: Map<string, unknown>;
  readonly aggregateCache?: Map<string, unknown>;
  readonly selectorCache?: Map<string, unknown>;
  readonly strategyModuleActivationCache?: Map<string, unknown>;
  readonly strategyModuleEvaluationCache?: Map<string, unknown>;
  readonly guardrailWhenCache?: Map<string, unknown>;
  readonly turnShapeEvaluationCache?: Map<string, unknown>;
  readonly strategicConditionCache?: Map<string, unknown>;
  readonly relationshipCache?: Map<string, unknown>;
  readonly fallbackPolicyBytecodeCache?: WeakMap<object, unknown>;
  readonly resolvedPreviewRefValues?: Map<string, unknown>;
  readonly schedulePartialsDuringValue?: readonly unknown[];
  withInnerMicroturnOption(
    microturnOption: SelectorEvalMicroturnOption,
    selectorItemKey: string | undefined,
  ): PolicyEvaluationContext;
  evaluateSelectorItemExpr(
    expr: CompiledPolicyExpr,
    candidate: undefined,
    microturnOption: SelectorEvalMicroturnOption | undefined,
    selectorItemKey: string | undefined,
  ): unknown;
};

type RuntimeProviderSnapshot = Pick<
  ContextInternals['runtimeProviders'],
  'intrinsics' | 'phaseSchedule' | 'candidates' | 'currentSurface' | 'previewSurface' | 'lookupSurface'
>;

interface OuterSnapshot {
  readonly encodedState: unknown;
  readonly encodedStateLayout: unknown;
  readonly encodedZoneIndexById: unknown;
  readonly runtime: unknown;
  readonly cacheBinding: unknown;
  readonly runtimeProviders: RuntimeProviderSnapshot;
  readonly semanticCaches: readonly {
    readonly name: string;
    readonly identity: unknown;
    readonly size?: number;
    readonly length?: number;
  }[];
}

function createCatalog(): AgentPolicyCatalog {
  return withCompiledPolicyCatalog({
    schemaVersion: 3,
    catalogFingerprint: 'policy-evaluation-context-outer-state-isolation',
    surfaceVisibility: {
      globalVars: {},
      globalMarkers: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
      guardrails: {},
      considerations: {},
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: {
        fingerprint: 'baseline',
        params: {},
        preview: { mode: 'disabled' },
        selection: { mode: 'argmax' },
        use: { guardrails: [], considerations: [], tieBreakers: [] },
        plan: { stateFeatures: [], candidateFeatures: [], candidateAggregates: [], considerations: [] },
      },
    },
    bindingsBySeat: { alpha: 'baseline' },
  });
}

function createDef(): GameDef {
  return {
    metadata: { id: 'policy-evaluation-context-outer-state-isolation', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [
      { id: asZoneId('board:none'), owner: 'none', visibility: 'public', ordering: 'set', zoneKind: 'board' },
    ],
    derivedMetrics: [],
    seats: [{ id: 'alpha' }, { id: 'beta' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: createCatalog(),
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
    terminal: { conditions: [] },
  };
}

function createContext(def: GameDef, runtime: GameDefRuntime, state: GameState): PolicyEvaluationContext {
  return new PolicyEvaluationContext(
    {
      def,
      state,
      playerId: asPlayerId(0),
      seatId: 'alpha',
      catalog: def.agents as AgentPolicyCatalog,
      parameterValues: {},
      trustedMoveIndex: new Map(),
      cacheBinding: { kind: 'runtime', runtime },
      completion: {
        request: completionRequest,
        optionValue: outerOption.value,
        optionIndex: outerOption.index,
      },
      selectorMicroturnOptions: [outerOption, innerOption],
    },
    [],
  );
}

function internals(context: PolicyEvaluationContext): ContextInternals {
  return context as unknown as ContextInternals;
}

function materializeOuterSemanticCaches(context: PolicyEvaluationContext): void {
  const target = context as unknown as {
    rootStateFeatureCache: Map<string, unknown>;
    candidateFeatureCache: Map<string, unknown>;
    aggregateCache: Map<string, unknown>;
    selectorCache: Map<string, unknown>;
    strategyModuleActivationCache: Map<string, unknown>;
    strategyModuleEvaluationCache: Map<string, unknown>;
    guardrailWhenCache: Map<string, unknown>;
    turnShapeEvaluationCache: Map<string, unknown>;
    strategicConditionCache: Map<string, unknown>;
    relationshipCache: Map<string, unknown>;
    fallbackPolicyBytecodeCache: WeakMap<object, unknown>;
    resolvedPreviewRefValues: Map<string, unknown>;
    schedulePartialsDuringValue: unknown[];
  };
  target.rootStateFeatureCache = new Map([['outer-state', 1]]);
  target.candidateFeatureCache = new Map([['outer-candidate', new Map()]]);
  target.aggregateCache = new Map([['outer-aggregate', 1]]);
  target.selectorCache = new Map([['outer-selector', { selectorId: 'outer', selected: [], impactSatisfied: true }]]);
  target.strategyModuleActivationCache = new Map([['outer-activation', { active: false }]]);
  target.strategyModuleEvaluationCache = new Map([['outer-evaluation', { contribution: 0 }]]);
  target.guardrailWhenCache = new Map([['outer-guardrail', false]]);
  target.turnShapeEvaluationCache = new Map([['outer-turn-shape', { minimumImpactSatisfied: true }]]);
  target.strategicConditionCache = new Map([['outer-strategic-condition', true]]);
  target.relationshipCache = new Map([['outer-relationship', 0]]);
  target.fallbackPolicyBytecodeCache = new WeakMap();
  target.resolvedPreviewRefValues = new Map([['outer-preview', new Map()]]);
  target.schedulePartialsDuringValue = [{ refId: 'outer-schedule', lowerBound: 1 }];
}

function snapshotOuter(context: PolicyEvaluationContext): OuterSnapshot {
  const current = internals(context);
  const runtimeProviders = current.runtimeProviders;
  return {
    encodedState: current.encodedState,
    encodedStateLayout: current.encodedStateLayout,
    encodedZoneIndexById: current.encodedZoneIndexById,
    runtime: current.runtime,
    cacheBinding: current.input.cacheBinding,
    runtimeProviders: {
      intrinsics: runtimeProviders.intrinsics,
      phaseSchedule: runtimeProviders.phaseSchedule,
      candidates: runtimeProviders.candidates,
      currentSurface: runtimeProviders.currentSurface,
      previewSurface: runtimeProviders.previewSurface,
      lookupSurface: runtimeProviders.lookupSurface,
    },
    semanticCaches: [
      mapSnapshot('rootStateFeatureCache', current.rootStateFeatureCache),
      mapSnapshot('candidateFeatureCache', current.candidateFeatureCache),
      mapSnapshot('aggregateCache', current.aggregateCache),
      mapSnapshot('selectorCache', current.selectorCache),
      mapSnapshot('strategyModuleActivationCache', current.strategyModuleActivationCache),
      mapSnapshot('strategyModuleEvaluationCache', current.strategyModuleEvaluationCache),
      mapSnapshot('guardrailWhenCache', current.guardrailWhenCache),
      mapSnapshot('turnShapeEvaluationCache', current.turnShapeEvaluationCache),
      mapSnapshot('strategicConditionCache', current.strategicConditionCache),
      mapSnapshot('relationshipCache', current.relationshipCache),
      weakMapSnapshot('fallbackPolicyBytecodeCache', current.fallbackPolicyBytecodeCache),
      mapSnapshot('resolvedPreviewRefValues', current.resolvedPreviewRefValues),
      arraySnapshot('schedulePartialsDuringValue', current.schedulePartialsDuringValue),
    ],
  };
}

function mapSnapshot(name: string, value: Map<string, unknown> | undefined): OuterSnapshot['semanticCaches'][number] {
  return value === undefined ? { name, identity: value } : { name, identity: value, size: value.size };
}

function weakMapSnapshot(name: string, value: WeakMap<object, unknown> | undefined): OuterSnapshot['semanticCaches'][number] {
  return { name, identity: value };
}

function arraySnapshot(name: string, value: readonly unknown[] | undefined): OuterSnapshot['semanticCaches'][number] {
  return value === undefined ? { name, identity: value } : { name, identity: value, length: value.length };
}

function assertOuterSnapshotUnchanged(context: PolicyEvaluationContext, snapshot: OuterSnapshot): void {
  const current = snapshotOuter(context);
  assert.equal(current.encodedState, snapshot.encodedState);
  assert.equal(current.encodedStateLayout, snapshot.encodedStateLayout);
  assert.equal(current.encodedZoneIndexById, snapshot.encodedZoneIndexById);
  assert.equal(current.runtime, snapshot.runtime);
  assert.equal(current.cacheBinding, snapshot.cacheBinding);
  assert.deepEqual(current.runtimeProviders, snapshot.runtimeProviders);
  for (let index = 0; index < snapshot.semanticCaches.length; index += 1) {
    const expected = snapshot.semanticCaches[index]!;
    const actual = current.semanticCaches[index]!;
    assert.equal(actual.name, expected.name);
    assert.equal(actual.identity, expected.identity, `${expected.name} identity changed`);
    assert.equal(actual.size, expected.size, `${expected.name} size changed`);
    assert.equal(actual.length, expected.length, `${expected.name} length changed`);
  }
}

describe('PolicyEvaluationContext outer-state isolation invariant', () => {
  it('keeps outer shared infrastructure and semantic caches unchanged across inner wrapper evaluation and disposal', () => {
    const def = createDef();
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 195002, 2).state;
    const outer = createContext(def, runtime, state);
    materializeOuterSemanticCaches(outer);
    const before = snapshotOuter(outer);

    const inner = internals(outer).withInnerMicroturnOption(innerOption, 'inner-item');
    const innerSnapshot = snapshotOuter(inner);
    assert.equal(innerSnapshot.encodedState, before.encodedState);
    assert.equal(innerSnapshot.encodedStateLayout, before.encodedStateLayout);
    assert.equal(innerSnapshot.encodedZoneIndexById, before.encodedZoneIndexById);
    assert.equal(innerSnapshot.runtime, before.runtime);
    assert.equal(innerSnapshot.cacheBinding, before.cacheBinding);
    assert.deepEqual(innerSnapshot.runtimeProviders, before.runtimeProviders);
    assert.notEqual(internals(inner).runtimeProviders.completion, internals(outer).runtimeProviders.completion);
    assert.equal(inner.evaluateCompiledExpr(innerExpr, undefined), true);
    assertOuterSnapshotUnchanged(outer, before);

    inner.dispose();
    assertOuterSnapshotUnchanged(outer, before);
  });

  it('routes different microturn options through an isolated inner context', () => {
    const def = createDef();
    const runtime = createGameDefRuntime(def);
    const state = initialState(def, 195002, 2).state;
    const outer = createContext(def, runtime, state);
    materializeOuterSemanticCaches(outer);
    const before = snapshotOuter(outer);

    assert.equal(
      internals(outer).evaluateSelectorItemExpr(innerExpr, undefined, innerOption, 'inner-item'),
      true,
    );
    assertOuterSnapshotUnchanged(outer, before);
  });
});
