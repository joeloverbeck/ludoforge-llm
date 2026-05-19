// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { scoreMicroturnOptionWithContributions } from '../../../src/agents/microturn-option-eval.js';
import {
  asPhaseId,
  asSeatId,
  assertValidatedGameDef,
  initialState,
  type PlayerId,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type ChoicePendingRequest,
  type CompiledAgentPolicyRef,
  type CompiledPolicySelector,
  type GameDef,
  type MoveParamValue,
} from '../../../src/kernel/index.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';
import { withCompiledPolicyCatalog } from '../../helpers/policy-catalog-fixtures.js';

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

const boolToScore = (expr: AgentPolicyExpr): AgentPolicyExpr => opExpr('boolToNumber', expr);
const eqRef = (ref: CompiledAgentPolicyRef, value: AgentPolicyLiteral): AgentPolicyExpr =>
  boolToScore(opExpr('eq', refExpr(ref), literal(value)));
const gtRef = (ref: CompiledAgentPolicyRef, value: number): AgentPolicyExpr =>
  boolToScore(opExpr('gt', refExpr(ref), literal(value)));
const inTags = (value: string): AgentPolicyExpr =>
  boolToScore(opExpr('in', literal(value), refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'tags' })));
const selectorRef = (
  selectorId: string,
  field: Extract<CompiledAgentPolicyRef, { readonly kind: 'selector' }>['field'],
): AgentPolicyExpr => refExpr({ kind: 'selector', selectorId, field });

const def: GameDef = assertValidatedGameDef({
  metadata: { id: 'microturn-option-evaluator-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [{ id: asPhaseId('main') }] },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

const considerationIds = [
  'kind',
  'decisionKey',
  'actorSeat',
  'optionValue',
  'optionIndex',
  'optionStableKey',
  'optionTags',
  'optionTargetKind',
  'remainingRequiredCount',
  'remainingMaxCount',
] as const;

const catalog: AgentPolicyCatalog = withCompiledPolicyCatalog({
  schemaVersion: 2,
  catalogFingerprint: 'microturn-option-evaluator-test',
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
    considerations: {
      kind: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(2),
        value: eqRef({ kind: 'microturnIntrinsic', intrinsic: 'kind' }, 'chooseOne'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      decisionKey: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(3),
        value: eqRef({ kind: 'microturnIntrinsic', intrinsic: 'decisionKey' }, '$pick'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      actorSeat: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(5),
        value: eqRef({ kind: 'microturnIntrinsic', intrinsic: 'actorSeat' }, 0),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      optionValue: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(7),
        value: eqRef({ kind: 'microturnOptionIntrinsic', intrinsic: 'value' }, 'right'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      optionIndex: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(11),
        value: eqRef({ kind: 'microturnOptionIntrinsic', intrinsic: 'index' }, 1),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      optionStableKey: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(13),
        value: eqRef({ kind: 'microturnOptionIntrinsic', intrinsic: 'stableKey' }, '"right"'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      optionTags: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(17),
        value: inTags('priority'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      optionTargetKind: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(19),
        value: eqRef({ kind: 'microturnOptionIntrinsic', intrinsic: 'targetKind' }, 'zone'),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      remainingRequiredCount: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(23),
        value: gtRef({ kind: 'microturnIntrinsic', intrinsic: 'remainingRequiredCount' }, 0),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
      remainingMaxCount: {
        scopes: ['microturn'],
        costClass: 'state',
        weight: literal(29),
        value: gtRef({ kind: 'microturnIntrinsic', intrinsic: 'remainingMaxCount' }, 0),
        dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
      },
    },
    tieBreakers: {},
    strategicConditions: {},
  },
  profiles: {},
  bindingsBySeat: {},
});

const createChooseOneRequest = (): ChoicePendingRequest => ({
  kind: 'pending',
  complete: false,
  decisionPlayer: 0 as PlayerId,
  decisionKey: '$pick' as DecisionKey,
  name: '$pick',
  type: 'chooseOne',
  options: [
    { value: 'left', legality: 'legal', illegalReason: null },
    { value: 'right', legality: 'legal', illegalReason: null },
  ],
  targetKinds: ['zone'],
});

const createChooseNRequest = (): ChoicePendingRequest => ({
  ...createChooseOneRequest(),
  type: 'chooseN',
  min: 2,
  max: 3,
  selected: ['left'],
  canConfirm: false,
});

const score = (request: ChoicePendingRequest, optionValue: MoveParamValue, optionIndex: number) => {
  const state = initialState(def, 1, 2).state;
  return scoreMicroturnOptionWithContributions(
    state,
    def,
    catalog,
    state.activePlayer,
    asSeatId('us'),
    {},
    request,
    optionValue,
    optionIndex,
    considerationIds,
  );
};

describe('microturn option evaluator', () => {
  it('scores every microturn ref kind once per chooseOne option', () => {
    const result = score(createChooseOneRequest(), 'right', 1);

    assert.equal(result.score, 2 + 3 + 5 + 7 + 11 + 13 + 0 + 19 + 23 + 29);
    assert.deepEqual(result.scoreContributions, [
      { termId: 'kind', contribution: 2 },
      { termId: 'decisionKey', contribution: 3 },
      { termId: 'actorSeat', contribution: 5 },
      { termId: 'optionValue', contribution: 7 },
      { termId: 'optionIndex', contribution: 11 },
      { termId: 'optionStableKey', contribution: 13 },
      { termId: 'optionTags', contribution: 0 },
      { termId: 'optionTargetKind', contribution: 19 },
      { termId: 'remainingRequiredCount', contribution: 23 },
      { termId: 'remainingMaxCount', contribution: 29 },
    ]);
  });

  it('scores the same microturn refs against chooseNStep remaining counts', () => {
    const result = score(createChooseNRequest(), 'right', 1);

    assert.equal(result.score, 0 + 3 + 5 + 7 + 11 + 13 + 0 + 19 + 23 + 29);
    assert.deepEqual(result.scoreContributions.map((entry) => entry.termId), [...considerationIds]);
    assert.equal(result.scoreContributions.find((entry) => entry.termId === 'kind')?.contribution, 0);
    assert.equal(result.scoreContributions.find((entry) => entry.termId === 'remainingRequiredCount')?.contribution, 23);
    assert.equal(result.scoreContributions.find((entry) => entry.termId === 'remainingMaxCount')?.contribution, 29);
  });

  it('scores the current option through a microturnOptions selector', () => {
    const state = initialState(def, 1, 2).state;
    const optionRanker: CompiledPolicySelector = {
      id: 'optionRanker' as CompiledPolicySelector['id'],
      scopes: ['microturn'],
      source: { kind: 'microturnOptions' },
      quality: {
        components: [{
          id: 'optionIndex' as any,
          value: refExpr({ kind: 'microturnOptionIntrinsic', intrinsic: 'index' }),
          weight: 10,
        }],
        order: 'qualityDesc',
      },
      result: { maxItems: 2, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
      costClass: 'microturn',
      dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
    };
    const selectorCatalog: AgentPolicyCatalog = {
      ...catalog,
      compiled: {
        ...catalog.compiled,
        selectors: { optionRanker },
        considerations: {
          preferCurrentSelectorQuality: {
            scopes: ['microturn'],
            costClass: 'candidate',
            weight: literal(1),
            value: selectorRef('optionRanker', 'current.quality'),
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: [],
              aggregates: [],
              selectors: ['optionRanker'],
              strategicConditions: [],
            },
          },
          preferCurrentSelectorRank: {
            scopes: ['microturn'],
            costClass: 'candidate',
            weight: literal(1),
            value: selectorRef('optionRanker', 'current.rank'),
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: [],
              aggregates: [],
              selectors: ['optionRanker'],
              strategicConditions: [],
            },
          },
        },
      },
    };

    const left = scoreMicroturnOptionWithContributions(
      state,
      def,
      selectorCatalog,
      state.activePlayer,
      asSeatId('us'),
      {},
      createChooseOneRequest(),
      'left',
      0,
      ['preferCurrentSelectorQuality', 'preferCurrentSelectorRank'],
    );
    const right = scoreMicroturnOptionWithContributions(
      state,
      def,
      selectorCatalog,
      state.activePlayer,
      asSeatId('us'),
      {},
      createChooseOneRequest(),
      'right',
      1,
      ['preferCurrentSelectorQuality', 'preferCurrentSelectorRank'],
    );

    assert.deepEqual(left.scoreContributions, [
      { termId: 'preferCurrentSelectorQuality', contribution: 0 },
      { termId: 'preferCurrentSelectorRank', contribution: 2 },
    ]);
    assert.deepEqual(right.scoreContributions, [
      { termId: 'preferCurrentSelectorQuality', contribution: 10 },
      { termId: 'preferCurrentSelectorRank', contribution: 1 },
    ]);
    assert.equal(right.score > left.score, true);
  });

  it('records unavailable preview-option refs while preserving numeric fallback scoring', () => {
    const state = initialState(def, 1, 2).state;
    const previewCatalog: AgentPolicyCatalog = {
      ...catalog,
      compiled: {
        ...catalog.compiled,
        considerations: {
          previewProjectedMargin: {
            scopes: ['microturn'],
            costClass: 'preview',
            weight: literal(31),
            value: refExpr({
              kind: 'previewOptionRef',
              refKind: 'deltaVictoryCurrentMarginSelf',
            }),
            unknownAs: 0,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
        },
      },
    };

    const result = scoreMicroturnOptionWithContributions(
      state,
      def,
      previewCatalog,
      state.activePlayer,
      asSeatId('us'),
      {},
      createChooseNRequest(),
      'right',
      1,
      ['previewProjectedMargin'],
      undefined,
      new Map([
        [
          'preview.option.delta.victory.currentMargin.self',
          { kind: 'unavailable', reason: 'depthCap' },
        ],
      ]),
    );

    assert.equal(result.score, 0);
    assert.deepEqual(result.scoreContributions, [{ termId: 'previewProjectedMargin', contribution: 0 }]);
    assert.deepEqual([...result.unknownPreviewRefs.entries()], [
      ['preview.option.delta.victory.currentMargin.self', 'depthCap'],
    ]);
  });

  it('records selector component preview fallback for the current microturn option', () => {
    const state = initialState(def, 1, 2).state;
    const optionRanker: CompiledPolicySelector = {
      id: 'optionRanker' as CompiledPolicySelector['id'],
      scopes: ['microturn'],
      source: { kind: 'microturnOptions' },
      quality: {
        components: [{
          id: 'projectedMargin' as any,
          value: refExpr({
            kind: 'previewOptionRef',
            refKind: 'deltaVictoryCurrentMarginSelf',
          }),
          weight: 1,
          previewFallback: { onUnavailable: 'noContribution' },
        }],
        order: 'qualityDesc',
      },
      result: { maxItems: 2, order: ['qualityDesc', 'stableKeyAsc'], onEmpty: 'noContribution' },
      costClass: 'preview',
      dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
    };
    const selectorCatalog: AgentPolicyCatalog = {
      ...catalog,
      compiled: {
        ...catalog.compiled,
        selectors: { optionRanker },
        considerations: {
          preferCurrentSelectorQuality: {
            scopes: ['microturn'],
            costClass: 'preview',
            weight: literal(1),
            value: selectorRef('optionRanker', 'current.quality'),
            dependencies: {
              parameters: [],
              stateFeatures: [],
              candidateFeatures: [],
              aggregates: [],
              selectors: ['optionRanker'],
              strategicConditions: [],
            },
          },
        },
      },
    };

    const result = scoreMicroturnOptionWithContributions(
      state,
      def,
      selectorCatalog,
      state.activePlayer,
      asSeatId('us'),
      {},
      createChooseOneRequest(),
      'right',
      1,
      ['preferCurrentSelectorQuality'],
      undefined,
      new Map([
        [
          'preview.option.delta.victory.currentMargin.self',
          { kind: 'unavailable', reason: 'depthCap' },
        ],
      ]),
    );

    assert.deepEqual(result.previewFallbackFired, {
      termId: 'selector.optionRanker.projectedMargin',
      kind: 'noContribution',
    });
  });
});
