import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove, evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import { createPolicyCompletionProvider, createPolicyRuntimeProviders } from '../../../src/agents/policy-runtime.js';
import { toMoveIdentityKey } from '../../../src/kernel/move-identity.js';
import {
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  createTrustedExecutableMove,
  createRng,
  initialState,
  toOwnedZoneId,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type ChoicePendingRequest,
  type CompiledAgentPolicyCurrentSurfaceRef,
  type CompiledAgentPolicyPreviewSurfaceRef,
  type CompiledAgentPolicyRef,
  type GameDef,
  type Move,
  type MoveParamValue,
  type ActionDef,
} from '../../../src/kernel/index.js';
import { eff } from '../../helpers/effect-tag-helper.js';

const phaseId = asPhaseId('main');
const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({
  kind: 'literal',
  value,
});
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});
const paramExpr = (id: string): AgentPolicyExpr => ({ kind: 'param', id });

function createAction(id: string, params: ActionDef['params'] = []): ActionDef {
  return {
    id: asActionId(id),
    actor: 'active',
    executor: 'actor',
    phase: [phaseId],
    params,
    pre: null,
    cost: [],
    effects: id === 'advance'
      ? [eff({ addVar: { scope: 'global', var: 'usMargin', delta: 3 } })]
      : [],
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
    derivedMetrics: [
      {
        id: 'boardPressure',
        computation: 'markerTotal',
        requirements: [{ key: 'population', expectedType: 'number' }],
        runtime: {
          kind: 'markerTotal',
          markerId: 'pressure',
          markerConfig: { activeState: 'high', passiveState: 'medium' },
          defaultMarkerState: 'low',
        },
      },
    ],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents,
    actions: [
      createAction('pass'),
      createAction('event'),
      createAction('operation'),
      createAction('alpha'),
      createAction('beta'),
      createAction('advance'),
    ],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'usMargin' } },
        { seat: 'arvn', value: 0 },
      ],
      ranking: {
        order: 'desc',
        tieBreakOrder: ['us', 'arvn'],
      },
    },
  };
}

function createCatalog(
  overrides: Partial<AgentPolicyCatalog['library']> = {},
  profileOverrides?: Partial<AgentPolicyCatalog['profiles']['baseline']>,
  candidateParamDefs: AgentPolicyCatalog['candidateParamDefs'] = {},
): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'catalog',
    surfaceVisibility: {
      globalVars: {
        usMargin: {
          current: 'public',
          preview: { visibility: 'public', allowWhenHiddenSampling: true },
        },
      },
      perPlayerVars: {
        tempo: {
          current: 'seatVisible',
          preview: { visibility: 'seatVisible', allowWhenHiddenSampling: true },
        },
      },
      derivedMetrics: {
        boardPressure: {
          current: 'public',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
      },
      victory: {
        currentMargin: {
          current: 'public',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
        currentRank: {
          current: 'public',
          preview: { visibility: 'hidden', allowWhenHiddenSampling: false },
        },
      },
    },
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
    candidateParamDefs,
    library: {
      stateFeatures: {
        currentMargin: {
          type: 'number',
          costClass: 'state',
          expr: refExpr({
            kind: 'currentSurface',
            family: 'victoryCurrentMargin',
            id: 'currentMargin',
            selector: { kind: 'role', seatToken: 'us' },
          }),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        ...(overrides.stateFeatures ?? {}),
      },
      candidateFeatures: {
        isPass: {
          type: 'boolean',
          costClass: 'candidate',
          expr: refExpr({ kind: 'candidateIntrinsic', intrinsic: 'isPass' }),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        isEvent: {
          type: 'boolean',
          costClass: 'candidate',
          expr: opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('event')),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
        },
        ...(overrides.candidateFeatures ?? {}),
      },
      candidateAggregates: {
        bestNonPassMargin: {
          type: 'number',
          costClass: 'candidate',
          op: 'max',
          of: refExpr({ kind: 'library', refKind: 'stateFeature', id: 'currentMargin' }),
          where: opExpr('not', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' })),
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
            kind: 'op',
            op: 'and',
            args: [
              refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isPass' }),
              opExpr(
                'gt',
                refExpr({ kind: 'library', refKind: 'aggregate', id: 'bestNonPassMargin' }),
                paramExpr('passFloor'),
              ),
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
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isEvent' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['isEvent'], aggregates: [] },
        },
        ...(overrides.scoreTerms ?? {}),
      },
      completionScoreTerms: {},
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
          completionScoreTerms: [],
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
    trustedMoveIndex: new Map(),
    rng: createRng(seed),
  } as const;
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

describe('policy-eval', () => {
  it('routes intrinsic, candidate, current, preview, and completion reads through explicit runtime providers', () => {
    const input = createInput(
      createCatalog(
        {},
        undefined,
        {
          eventCardId: { type: 'id' },
        },
      ),
      [{ actionId: asActionId('advance'), params: { eventCardId: 'card-2' } }],
    );

    const providers = createPolicyRuntimeProviders({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog: input.def.agents!,
      completion: {
        request: createChoiceRequest(),
        optionValue: 'zone-b',
      },
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });
    const candidate = {
      move: input.legalMoves[0]!,
      stableMoveKey: 'advance|{"eventCardId":"card-2"}|false|unclassified',
      actionId: 'advance',
    };

    assert.equal(providers.intrinsics.resolveSeatIntrinsic('self'), 'us');
    assert.equal(providers.intrinsics.resolveTurnIntrinsic('phaseId'), 'main');
    assert.equal(providers.intrinsics.resolveTurnIntrinsic('round'), input.state.turnCount);
    assert.equal(providers.candidates.resolveCandidateIntrinsic(candidate, 'actionId'), 'advance');
    assert.equal(providers.candidates.resolveCandidateParam(candidate, 'eventCardId'), 'card-2');
    assert.equal(
      providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'globalVar',
        id: 'usMargin',
      } satisfies CompiledAgentPolicyCurrentSurfaceRef),
      1,
    );
    assert.deepEqual(
      providers.previewSurface.resolveSurface(candidate, {
        kind: 'previewSurface',
        family: 'globalVar',
        id: 'usMargin',
      } satisfies CompiledAgentPolicyPreviewSurfaceRef),
      { kind: 'value', value: 4 },
    );
    assert.equal(providers.completion?.resolveDecisionIntrinsic('type'), 'chooseOne');
    assert.equal(providers.completion?.resolveDecisionIntrinsic('targetKind'), 'zone');
    assert.equal(providers.completion?.resolveDecisionIntrinsic('optionCount'), 2);
    assert.equal(providers.completion?.resolveOptionIntrinsic('value'), 'zone-b');
  });

  it('maps completion intrinsics from request metadata and falls back targetKind to unknown', () => {
    const provider = createPolicyCompletionProvider(
      createChoiceRequest({
        type: 'chooseN',
        name: '$pickZones',
        options: [
          { value: 'zone-a', legality: 'legal', illegalReason: null },
          { value: 'zone-c', legality: 'legal', illegalReason: null },
          { value: 'zone-d', legality: 'illegal', illegalReason: 'pipelineAtomicCostValidationFailed' },
        ],
        targetKinds: [],
        selected: [],
        canConfirm: true,
      }),
      ['zone-a', 'zone-c'] satisfies MoveParamValue,
    );

    assert.equal(provider.resolveDecisionIntrinsic('type'), 'chooseN');
    assert.equal(provider.resolveDecisionIntrinsic('name'), '$pickZones');
    assert.equal(provider.resolveDecisionIntrinsic('targetKind'), 'unknown');
    assert.equal(provider.resolveDecisionIntrinsic('optionCount'), 3);
    assert.deepEqual(provider.resolveOptionIntrinsic('value'), ['zone-a', 'zone-c']);
  });

  it('omits completion providers when no completion context is supplied', () => {
    const input = createInput(createCatalog(), createMoves('event'));
    const providers = createPolicyRuntimeProviders({
      def: input.def,
      state: input.state,
      playerId: input.playerId,
      seatId: 'us',
      trustedMoveIndex: new Map(),
      catalog: input.def.agents!,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.equal(providers.completion, undefined);
  });

  it('resolves player-scoped per-player refs by runtime player identity in symmetric seats', () => {
    const def = createBaseDef(createCatalog());
    const baseState = initialState(def, 7, 2).state;
    const state = {
      ...baseState,
      perPlayerVars: [
        { tempo: 1 },
        { tempo: 6 },
      ],
    };
    const providers = createPolicyRuntimeProviders({
      def: {
        ...def,
        seats: [{ id: 'neutral' }, { id: 'neutral' }],
      },
      state,
      playerId: asPlayerId(1),
      seatId: 'neutral',
      trustedMoveIndex: new Map(),
      catalog: def.agents!,
      runtimeError: (code, message) => new Error(`${code}: ${message}`),
    });

    assert.equal(
      providers.currentSurface.resolveSurface({
        kind: 'currentSurface',
        family: 'perPlayerVar',
        id: 'tempo',
        selector: { kind: 'player', player: 'self' },
      } satisfies CompiledAgentPolicyCurrentSurfaceRef),
      6,
    );
  });

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
            when: literal(true),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
            onEmpty: 'skipRule',
          },
        },
      },
      {
        use: {
          pruningRules: ['pruneEverything'],
          scoreTerms: [],
          completionScoreTerms: [],
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
            when: literal(true),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
            onEmpty: 'error',
          },
        },
      },
      {
        use: {
          pruningRules: ['pruneEverything'],
          scoreTerms: [],
          completionScoreTerms: [],
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

  it('evaluates preview-backed score terms against one-ply applied state', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          projectedMargin: {
            type: 'number',
            costClass: 'preview',
            expr: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'usMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
          maskedProjectedStanding: {
            type: 'number',
            costClass: 'preview',
            expr: refExpr({
              kind: 'previewSurface',
              family: 'victoryCurrentMargin',
              id: 'currentMargin',
              selector: { kind: 'role', seatToken: 'us' },
            }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferProjectedMargin: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [] },
          },
          reinforceProjectedMargin: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [] },
          },
          ignoreMaskedStanding: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'maskedProjectedStanding' }),
            unknownAs: 0,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['maskedProjectedStanding'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferProjectedMargin', 'reinforceProjectedMargin', 'ignoreMaskedStanding'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['projectedMargin', 'maskedProjectedStanding'],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('alpha', 'advance'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('advance'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'advance')?.score,
      8,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      2,
    );
  });

  it('evaluates preview-backed score terms for trusted completed moves that are already indexed', () => {
    const chooseTargetAction = {
      id: asActionId('chooseTarget'),
      actor: 'active' as const,
      executor: 'actor' as const,
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [
        eff({
          chooseOne: {
            internalDecisionId: 'decision:$targetMargin',
            bind: '$targetMargin',
            options: { query: 'enums', values: ['low', 'high'] },
          },
        }),
        eff({
          if: {
            when: { op: '==', left: { _t: 2 as const, ref: 'binding', name: '$targetMargin' }, right: 'high' },
            then: [eff({ setVar: { scope: 'global', var: 'usMargin', value: 8 } })],
            else: [eff({ setVar: { scope: 'global', var: 'usMargin', value: 2 } })],
          },
        }),
      ],
      limits: [],
    };
    const agents = createCatalog(
      {
        candidateFeatures: {
          projectedMargin: {
            type: 'number',
            costClass: 'preview',
            expr: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'usMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferProjectedMargin: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferProjectedMargin'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['projectedMargin'],
          candidateAggregates: [],
        },
      },
    );
    const def = {
      ...createBaseDef(agents),
      actions: [chooseTargetAction],
    };
    const state = initialState(def, 7, 2).state;
    const lowMarginMove: Move = { actionId: asActionId('chooseTarget'), params: { '$targetMargin': 'low' } };
    const highMarginMove: Move = { actionId: asActionId('chooseTarget'), params: { '$targetMargin': 'high' } };

    const result = evaluatePolicyMove({
      def,
      state: {
        ...state,
        globalVars: {
          ...state.globalVars,
          usMargin: 1,
        },
      },
      playerId: asPlayerId(0),
      legalMoves: [lowMarginMove, highMarginMove],
      trustedMoveIndex: new Map([
        [toMoveIdentityKey(def, lowMarginMove), createTrustedExecutableMove(lowMarginMove, state.stateHash, 'templateCompletion')],
        [toMoveIdentityKey(def, highMarginMove), createTrustedExecutableMove(highMarginMove, state.stateHash, 'templateCompletion')],
      ]),
      rng: createRng(7n),
    });

    assert.deepEqual(result.move, highMarginMove);
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.stableMoveKey === toMoveIdentityKey(def, highMarginMove))?.score,
      8,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.stableMoveKey === toMoveIdentityKey(def, lowMarginMove))?.score,
      2,
    );
  });

  it('resolves metric refs through the shared runtime metric contract', () => {
    const agents = createCatalog(
      {
        stateFeatures: {
          unsupportedMetric: {
            type: 'number',
            costClass: 'state',
            expr: refExpr({ kind: 'currentSurface', family: 'derivedMetric', id: 'boardPressure' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferMetric: {
            costClass: 'state',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'stateFeature', id: 'unsupportedMetric' }),
            dependencies: { parameters: [], stateFeatures: ['unsupportedMetric'], candidateFeatures: [], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferMetric'],
          completionScoreTerms: [],
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
    assert.equal(result.metadata.usedFallback, false);
    assert.equal(result.metadata.failure, null);
  });

  it('reports unsupported current-surface refs as provider-owned runtime failures', () => {
    const agents = createCatalog(
      {
        stateFeatures: {
          unknownSurface: {
            type: 'number',
            costClass: 'state',
            expr: refExpr({ kind: 'currentSurface', family: 'globalVar', id: 'notExposed' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferUnknownSurface: {
            costClass: 'state',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'stateFeature', id: 'unknownSurface' }),
            dependencies: { parameters: [], stateFeatures: ['unknownSurface'], candidateFeatures: [], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferUnknownSurface'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: ['unknownSurface'],
          candidateFeatures: [],
          candidateAggregates: [],
        },
      },
    );

    const core = evaluatePolicyMoveCore(createInput(agents, createMoves('alpha', 'beta')));

    assert.equal(core.kind, 'failure');
    if (core.kind === 'failure') {
      assert.equal(core.failure.code, 'UNSUPPORTED_RUNTIME_REF');
      assert.match(core.failure.message, /unsupported by the non-preview evaluator runtime/);
    }
  });

  it('reads candidate params through compiled candidate-param defs and treats shape mismatches as unknown', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          cardMatch: {
            type: 'boolean',
            costClass: 'candidate',
            expr: opExpr('eq', refExpr({ kind: 'candidateParam', id: 'eventCardId' }), literal('card-2')),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
          targetCount: {
            type: 'number',
            costClass: 'candidate',
            expr: opExpr('coalesce', refExpr({ kind: 'candidateParam', id: 'targetCount' }), literal(0)),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferMatchingCard: {
            costClass: 'candidate',
            weight: literal(5),
            value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'cardMatch' })),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['cardMatch'], aggregates: [] },
          },
          preferHigherTargetCount: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'targetCount' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['targetCount'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferMatchingCard', 'preferHigherTargetCount'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['cardMatch', 'targetCount'],
          candidateAggregates: [],
        },
      },
      {
        eventCardId: { type: 'id' },
        targetCount: { type: 'number' },
      },
    );
    const input = createInput(agents, [
      { actionId: asActionId('alpha'), params: { eventCardId: 'card-2', targetCount: 2 } },
      { actionId: asActionId('beta'), params: { eventCardId: ['card-2'], targetCount: '2' } },
    ]);

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      7,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      0,
    );
  });

  it('preserves static zoneTokenAgg behavior for string zones', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          staticZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: 'frontier',
              owner: 'self',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferStaticZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'staticZoneLoad' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['staticZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferStaticZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['staticZoneLoad'],
          candidateAggregates: [],
        },
      },
    );
    const baseInput = createInput(agents, createMoves('alpha'));
    const input = {
      ...baseInput,
      state: {
        ...baseInput.state,
        zones: {
          ...baseInput.state.zones,
          'frontier:0': [
            { id: asTokenId('t0'), type: 'unit', props: { strength: 2 } },
            { id: asTokenId('t1'), type: 'unit', props: { strength: 3 } },
          ],
        },
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      5,
    );
  });

  it('evaluates dynamic zoneTokenAgg zones through existing runtime refs', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          zoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: refExpr({ kind: 'candidateParam', id: 'eventCardId' }),
              owner: 'self',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferLoadedZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'zoneLoad' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['zoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferLoadedZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['zoneLoad'],
          candidateAggregates: [],
        },
      },
      {
        eventCardId: { type: 'id' },
      },
    );
    const baseInput = createInput(agents, [
      { actionId: asActionId('alpha'), params: { eventCardId: 'frontier' } },
      { actionId: asActionId('beta'), params: { eventCardId: 'rear' } },
    ]);
    const input = {
      ...baseInput,
      state: {
        ...baseInput.state,
        zones: {
          ...baseInput.state.zones,
          'frontier:0': [
            { id: asTokenId('t0'), type: 'unit', props: { strength: 2 } },
            { id: asTokenId('t1'), type: 'unit', props: { strength: 3 } },
          ],
          'rear:0': [
            { id: asTokenId('t2'), type: 'unit', props: { strength: 1 } },
          ],
        },
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      5,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      1,
    );
  });

  it('resolves zoneTokenAgg active-owner zones through the shared runtime zone-address helper', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          activeZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: 'frontier',
              owner: 'active',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferActiveZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'activeZoneLoad' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['activeZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferActiveZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['activeZoneLoad'],
          candidateAggregates: [],
        },
      },
    );
    const baseInput = createInput(agents, createMoves('alpha'));
    const activeZoneId = toOwnedZoneId('frontier', baseInput.state.activePlayer);
    const input = {
      ...baseInput,
      state: {
        ...baseInput.state,
        zones: {
          ...baseInput.state.zones,
          [activeZoneId]: [
            { id: asTokenId('t0'), type: 'unit', props: { strength: 4 } },
            { id: asTokenId('t1'), type: 'unit', props: { strength: 1 } },
          ],
        },
      },
    } as const;

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      5,
    );
  });

  it('returns unknown for dynamic zoneTokenAgg zones that do not evaluate to strings', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          badZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: paramExpr('passFloor'),
              owner: 'self',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: ['passFloor'], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferKnownZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'badZoneLoad' }),
            unknownAs: 0,
            dependencies: { parameters: ['passFloor'], stateFeatures: [], candidateFeatures: ['badZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferKnownZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['badZoneLoad'],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('beta', 'alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      0,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      0,
    );
  });

  it('returns unknown for zoneTokenAgg owners that do not resolve to runtime zone-address owners', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          invalidOwnerZoneLoad: {
            type: 'number',
            costClass: 'candidate',
            expr: {
              kind: 'zoneTokenAgg',
              zone: 'frontier',
              owner: 'us',
              prop: 'strength',
              aggOp: 'sum',
            },
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferKnownZone: {
            costClass: 'candidate',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'invalidOwnerZoneLoad' }),
            unknownAs: 0,
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['invalidOwnerZoneLoad'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferKnownZone'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['invalidOwnerZoneLoad'],
          candidateAggregates: [],
        },
      },
    );
    const input = createInput(agents, createMoves('alpha'));

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      0,
    );
  });

  it('reads exact id-list candidate params through compiled candidate-param defs', () => {
    const agents = createCatalog(
      {
        candidateFeatures: {
          targetsZoneA: {
            type: 'boolean',
            costClass: 'candidate',
            expr: opExpr('in', literal('zone-a'), refExpr({ kind: 'candidateParam', id: '$targets' })),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [] },
          },
        },
        scoreTerms: {
          preferZoneA: {
            costClass: 'candidate',
            weight: literal(1),
            value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'targetsZoneA' })),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['targetsZoneA'], aggregates: [] },
          },
        },
      },
      {
        use: {
          pruningRules: [],
          scoreTerms: ['preferZoneA'],
          completionScoreTerms: [],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['targetsZoneA'],
          candidateAggregates: [],
        },
      },
      {
        '$targets': {
          type: 'idList',
          cardinality: {
            kind: 'exact',
            n: 2,
          },
        },
      },
    );
    const input = createInput(agents, [
      { actionId: asActionId('alpha'), params: { '$targets': ['zone-a', 'zone-b'] } },
      { actionId: asActionId('beta'), params: { '$targets': 'zone-a' } },
    ]);

    const result = evaluatePolicyMove(input);

    assert.equal(result.move.actionId, asActionId('alpha'));
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'alpha')?.score,
      1,
    );
    assert.equal(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'beta')?.score,
      0,
    );
  });
});
