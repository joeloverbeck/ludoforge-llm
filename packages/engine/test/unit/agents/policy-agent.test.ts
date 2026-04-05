import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NoPlayableMovesAfterPreparationError } from '../../../src/agents/no-playable-move.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { completeClassifiedMove, completeClassifiedMoves, pendingClassifiedMove } from '../../helpers/classified-move-fixtures.js';
import { createTemplateChooseOneAction, createTemplateChooseOneProfile } from '../../helpers/agent-template-fixtures.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  type ActionPipelineDef,
  asActionId,
  asPhaseId,
  asPlayerId,
  createRng,
  initialState,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type CompiledAgentPolicyRef,
  type GameDef,
  type Move,
} from '../../../src/kernel/index.js';

const phaseId = asPhaseId('main');

const literal = (value: string | number | boolean): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });
const opExpr = (op: Extract<AgentPolicyExpr, { readonly kind: 'op' }>['op'], ...args: AgentPolicyExpr[]): AgentPolicyExpr => ({
  kind: 'op',
  op,
  args,
});

function moveConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalog['library']['considerations'][string], 'scopes'>>,
): AgentPolicyCatalog['library']['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['move'], ...definition }]),
  );
}

function completionConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalog['library']['considerations'][string], 'scopes'>>,
): AgentPolicyCatalog['library']['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['completion'], ...definition }]),
  );
}

function createCatalog(): AgentPolicyCatalog {
  return {
    schemaVersion: 2,
    catalogFingerprint: 'catalog',
    surfaceVisibility: {
      globalVars: {},
      perPlayerVars: {},
      derivedMetrics: {},
      victory: {
        currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
        currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
      candidateFeatures: {
        isEvent: {
          type: 'boolean',
          costClass: 'candidate',
          expr: opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('event')),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      candidateAggregates: {},
      pruningRules: {},
      considerations: moveConsiderations({
        preferPass: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'candidateTag', tagName: 'pass' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
        preferEvent: {
          costClass: 'candidate',
          weight: literal(10),
          value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'isEvent' })),
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['isEvent'], aggregates: [], strategicConditions: [] },
        },
      }),
      tieBreakers: {
        stableMoveKey: {
          kind: 'stableMoveKey',
          costClass: 'state',
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      },
      strategicConditions: {},
    },
    profiles: {
      passive: {
        fingerprint: 'passive-fingerprint',
        params: {},
        preview: { mode: 'exactWorld' },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
          considerations: ['preferPass'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: [],
          candidateAggregates: [],
          considerations: ['preferPass'],
        },
      },
      aggressive: {
        fingerprint: 'aggressive-fingerprint',
        params: {},
        preview: { mode: 'exactWorld' },
        selection: { mode: 'argmax' },
        use: {
          pruningRules: [],
          considerations: ['preferEvent'],
          tieBreakers: ['stableMoveKey'],
        },
        plan: {
          stateFeatures: [],
          candidateFeatures: ['isEvent'],
          candidateAggregates: [],
          considerations: ['preferEvent'],
        },
      },
    },
    bindingsBySeat: {
      us: 'passive',
    },
  };
}

function createDef(overrides: Partial<GameDef> = {}): GameDef {
  return {
    metadata: { id: 'policy-agent', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
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
      {
        id: asActionId('event'),
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
    actionTagIndex: {
      byAction: { pass: ['pass'], event: ['event'] },
      byTag: { pass: ['pass'], event: ['event'] },
    },
    triggers: [],
    terminal: { conditions: [] },
    ...overrides,
  };
}

function createTemplateDef(): GameDef {
  const actionId = asActionId('op1');
  const templateAction = createTemplateChooseOneAction(actionId, phaseId);
  const templateProfile = createTemplateChooseOneProfile(actionId);

  return createDef({
    metadata: { id: 'policy-agent-template', players: { min: 2, max: 2 } },
    actions: [templateAction],
    actionPipelines: [templateProfile] as readonly ActionPipelineDef[],
    agents: {
      ...createCatalog(),
      library: {
        ...createCatalog().library,
        candidateFeatures: {
          prefersGamma: {
            type: 'boolean',
            costClass: 'candidate',
            expr: opExpr('eq', refExpr({ kind: 'candidateParam', id: '$target' }), literal('gamma')),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
        },
        considerations: moveConsiderations({
          preferGamma: {
            costClass: 'candidate',
            weight: literal(10),
            value: opExpr('boolToNumber', refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'prefersGamma' })),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['prefersGamma'], aggregates: [], strategicConditions: [] },
          },
        }),
      },
      profiles: {
        passive: {
          fingerprint: 'passive-fingerprint',
          params: {},
          preview: { mode: 'exactWorld' },
          selection: { mode: 'argmax' },
          use: {
            pruningRules: [],
            considerations: ['preferGamma'],
            tieBreakers: ['stableMoveKey'],
          },
          plan: {
            stateFeatures: [],
            candidateFeatures: ['prefersGamma'],
            candidateAggregates: [],
            considerations: ['preferGamma'],
          },
        },
      },
      candidateParamDefs: {
        '$target': { type: 'id' },
      },
    },
  });
}

function createGuidedTemplateDef(
  fallback: 'random' | 'first' = 'random',
): GameDef {
  const actionId = asActionId('op1');
  const templateAction = createTemplateChooseOneAction(actionId, phaseId);
  const templateProfile = createTemplateChooseOneProfile(actionId);
  const catalog = createCatalog();

  return createDef({
    metadata: { id: `policy-agent-guided-template-${fallback}`, players: { min: 2, max: 2 } },
    actions: [templateAction],
    actionPipelines: [templateProfile] as readonly ActionPipelineDef[],
    agents: {
      ...catalog,
      library: {
        ...catalog.library,
        considerations: completionConsiderations({
          preferGamma: {
            costClass: 'state',
            when: literal(true),
            weight: literal(10),
            value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('gamma'))),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
          noMatch: {
            costClass: 'state',
            when: literal(false),
            weight: literal(1),
            value: literal(100),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
        }),
      },
      profiles: {
        passive: {
          fingerprint: 'guided-template-profile',
          params: {},
          preview: { mode: 'exactWorld' },
          selection: { mode: 'argmax' },
          use: {
            pruningRules: [],
            considerations: ['preferGamma'],
            tieBreakers: ['stableMoveKey'],
          },
          plan: {
            stateFeatures: [],
            candidateFeatures: [],
            candidateAggregates: [],
            considerations: ['preferGamma'],
          },
        },
      },
      candidateParamDefs: {
        '$target': { type: 'id' },
      },
    },
  });
}

function createTemplatePreviewDef(): GameDef {
  const actionId = asActionId('chooseTarget');
  const templateProfile: ActionPipelineDef = {
    id: `profile-${actionId}`,
    actionId,
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [
      {
        stage: 'resolve',
        effects: [
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: ['gamma'] },
            },
          }),
        ],
      },
    ],
    atomicity: 'atomic',
  };

  return {
    metadata: { id: 'policy-agent-template-preview', players: { min: 2, max: 2 } },
    constants: {},
    globalVars: [{ name: 'usMargin', type: 'int', init: 1, min: -10, max: 10 }],
    perPlayerVars: [],
    zones: [],
    derivedMetrics: [],
    seats: [{ id: 'us' }, { id: 'arvn' }],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: {
      schemaVersion: 2,
      catalogFingerprint: 'template-preview-catalog',
      surfaceVisibility: {
        globalVars: {
          usMargin: {
            current: 'public',
            preview: { visibility: 'public', allowWhenHiddenSampling: true },
          },
        },
        perPlayerVars: {},
        derivedMetrics: {},
        victory: {
          currentMargin: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
          currentRank: { current: 'public', preview: { visibility: 'public', allowWhenHiddenSampling: true } },
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
      candidateParamDefs: {
        '$target': { type: 'id' },
      },
      library: {
        stateFeatures: {},
        candidateFeatures: {
          projectedMargin: {
            type: 'number',
            costClass: 'preview',
            expr: refExpr({ kind: 'previewSurface', family: 'globalVar', id: 'usMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
        },
        candidateAggregates: {},
        pruningRules: {},
        considerations: moveConsiderations({
          preferProjectedMargin: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedMargin'], aggregates: [], strategicConditions: [] },
          },
        }),
        tieBreakers: {
          stableMoveKey: {
            kind: 'stableMoveKey',
            costClass: 'state',
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
        },
        strategicConditions: {},
      },
      profiles: {
        passive: {
          fingerprint: 'template-preview-profile',
          params: {},
          preview: { mode: 'exactWorld' },
          selection: { mode: 'argmax' },
          use: {
            pruningRules: [],
            considerations: ['preferProjectedMargin'],
            tieBreakers: ['stableMoveKey'],
          },
          plan: {
            stateFeatures: [],
            candidateFeatures: ['projectedMargin'],
            candidateAggregates: [],
            considerations: ['preferProjectedMargin'],
          },
        },
      },
      bindingsBySeat: {
        us: 'passive',
      },
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
      {
        id: actionId,
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [
          eff({ setVar: { scope: 'global', var: 'usMargin', value: 8 } }),
        ],
        limits: [],
      },
    ],
    actionPipelines: [templateProfile] as readonly ActionPipelineDef[],
    triggers: [],
    terminal: { conditions: [] },
  };
}

function createEmptyOptionsProfile(actionId: string): ActionPipelineDef {
  return {
    id: `profile-${actionId}`,
    actionId: asActionId(actionId),
    legality: null,
    costValidation: null,
    costEffects: [],
    targeting: {},
    stages: [
      {
        stage: 'resolve',
        effects: [
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$target',
              bind: '$target',
              options: { query: 'enums', values: [] },
            },
          }),
        ],
      },
    ],
    atomicity: 'atomic',
  };
}

function createInput(def: GameDef): Parameters<PolicyAgent['chooseMove']>[0] {
  const state = initialState(def, 7, 2).state;
  const legalMoves: readonly Move[] = [
    { actionId: asActionId('pass'), params: {} },
    { actionId: asActionId('event'), params: {} },
  ];
  return {
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves: completeClassifiedMoves(legalMoves),
    rng: createRng(7n),
  };
}

describe('PolicyAgent', () => {
  it('rejects invalid completionsPerTemplate config', () => {
    assert.throws(
      () => new PolicyAgent({ completionsPerTemplate: 0 }),
      /PolicyAgent completionsPerTemplate must be a positive safe integer/,
    );
  });

  it('resolves the bound seat profile and returns a legal move', () => {
    const def = createDef();
    const agent = new PolicyAgent();

    const result = agent.chooseMove(createInput(def));

    assert.deepEqual(result.move.move, { actionId: asActionId('pass'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.seatId, 'us');
    assert.equal(result.agentDecision.resolvedProfileId, 'passive');
    assert.equal(result.agentDecision.profileFingerprint, 'passive-fingerprint');
    assert.equal(result.agentDecision.emergencyFallback, false);
  });

  it('supports an explicit profile override without changing authored bindings', () => {
    const def = createDef();
    const agent = new PolicyAgent({ profileId: 'aggressive' });

    const result = agent.chooseMove(createInput(def));

    assert.deepEqual(result.move.move, { actionId: asActionId('event'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.requestedProfileId, 'aggressive');
    assert.equal(result.agentDecision.resolvedProfileId, 'aggressive');
    assert.equal(result.agentDecision.emergencyFallback, false);
  });

  it('reuses a single canonical seat binding for symmetric games', () => {
    const def = createDef({
      seats: [{ id: 'neutral' }],
      agents: {
        ...createCatalog(),
        bindingsBySeat: {
          neutral: 'passive',
        },
      },
    });
    const agent = new PolicyAgent();
    const state = initialState(def, 7, 2).state;

    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(1),
      legalMoves: completeClassifiedMoves([
        { actionId: asActionId('pass'), params: {} },
        { actionId: asActionId('event'), params: {} },
      ]),
      rng: createRng(7n),
    });

    assert.deepEqual(result.move.move, { actionId: asActionId('pass'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.seatId, 'neutral');
    assert.equal(result.agentDecision.resolvedProfileId, 'passive');
    assert.equal(result.agentDecision.emergencyFallback, false);
  });

  it('emits emergency fallback metadata when the requested profile is missing', () => {
    const def = createDef();
    const agent = new PolicyAgent({ profileId: 'missing-profile' });

    const result = agent.chooseMove(createInput(def));

    assert.equal(
      result.move.actionId === asActionId('pass') || result.move.actionId === asActionId('event'),
      true,
    );
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.emergencyFallback, true);
    assert.equal(result.agentDecision.failure?.code, 'PROFILE_MISSING');
    assert.equal(result.agentDecision.selectedStableMoveKey !== null, true);
  });

  it('completes template moves before policy evaluation', () => {
    const def = createTemplateDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent();

    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [pendingClassifiedMove({ actionId: asActionId('op1'), params: {} })],
      rng: createRng(42n),
    });

    assert.equal(result.move.actionId, asActionId('op1'));
    const target = result.move.params['$target'];
    assert.ok(
      target === 'alpha' || target === 'beta' || target === 'gamma',
      `selected target "${String(target)}" should be one of the enum options`,
    );
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy decision trace');
    }
    assert.equal(result.agentDecision.emergencyFallback, false);
  });

  it('uses completion guidance to prefer the highest-scoring template option', () => {
    const def = createGuidedTemplateDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent();

    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [pendingClassifiedMove({ actionId: asActionId('op1'), params: {} })],
      rng: createRng(42n),
    });

    assert.equal(result.move.actionId, asActionId('op1'));
    assert.equal(result.move.params['$target'], 'gamma');
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy decision trace');
    }
    assert.equal(result.agentDecision.emergencyFallback, false);
  });

  it('produces deterministic guided completions for the same seed and state', () => {
    const def = createGuidedTemplateDef();
    const state = initialState(def, 7, 2).state;
    const input = {
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [pendingClassifiedMove({ actionId: asActionId('op1'), params: {} })],
      rng: createRng(42n),
    } as const;

    const first = new PolicyAgent().chooseMove(input);
    const second = new PolicyAgent().chooseMove(input);

    assert.deepEqual(first.move.move, second.move.move);
    assert.equal(first.move.move.params['$target'], 'gamma');
  });

  it('evaluates preview surfaces for completed template moves in the production path', () => {
    const def = createTemplatePreviewDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const result = agent.chooseMove({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [
        completeClassifiedMove({ actionId: asActionId('pass'), params: {} }, state.stateHash),
        pendingClassifiedMove({ actionId: asActionId('chooseTarget'), params: {} }),
      ],
      rng: createRng(42n),
    });

    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy decision trace');
    }
    assert.equal(result.agentDecision.emergencyFallback, false);
    assert.equal(result.agentDecision.previewUsage.mode, 'exactWorld');
    assert.deepEqual(result.agentDecision.previewUsage.refIds, ['globalVar.usMargin']);
    assert.equal(result.agentDecision.previewUsage.evaluatedCandidateCount, 2);
    assert.deepEqual(result.agentDecision.previewUsage.outcomeBreakdown, {
      ready: 2,
      stochastic: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 0,
      unknownFailed: 0,
    });
    assert.deepEqual(result.agentDecision.completionStatistics, {
      totalClassifiedMoves: 2,
      completedCount: 1,
      stochasticCount: 0,
      rejectedNotViable: 0,
      templateCompletionAttempts: 3,
      templateCompletionSuccesses: 3,
      templateCompletionUnsatisfiable: 0,
    });
    assert.equal(result.agentDecision.movePreparations?.length, 2);
    const directPreparation = result.agentDecision.movePreparations?.find((entry) => entry.actionId === 'pass');
    assert.ok(directPreparation);
    assert.equal(directPreparation?.initialClassification, 'complete');
    assert.equal(directPreparation?.finalClassification, 'complete');
    assert.equal(directPreparation?.enteredTrustedMoveIndex, true);
    assert.match(directPreparation?.stableMoveKey ?? '', /^pass\|/);
    const completedPreparation = result.agentDecision.movePreparations?.find((entry) => entry.actionId === 'chooseTarget');
    assert.ok(completedPreparation);
    assert.equal(completedPreparation?.initialClassification, 'pending');
    assert.equal(completedPreparation?.finalClassification, 'complete');
    assert.equal(completedPreparation?.enteredTrustedMoveIndex, true);
    assert.equal(completedPreparation?.templateCompletionAttempts, 3);
    assert.equal(completedPreparation?.templateCompletionOutcome, 'complete');
    if (result.agentDecision.candidates === undefined) {
      assert.fail('expected verbose policy candidates');
    }

    const completedTemplateCandidate = result.agentDecision.candidates.find(
      (candidate) => candidate.actionId === 'chooseTarget' && candidate.previewRefIds?.length === 1,
    );
    assert.ok(completedTemplateCandidate);
    assert.deepEqual(completedTemplateCandidate.previewRefIds, ['globalVar.usMargin']);
    assert.deepEqual(completedTemplateCandidate.unknownPreviewRefs, []);
    assert.equal(completedTemplateCandidate.previewOutcome, 'ready');
  });

  it('throws a typed no-playable-move error when every classified move is unsatisfiable', () => {
    const actionId = asActionId('unplayable');
    const def = createDef({
      metadata: { id: 'policy-agent-unplayable-template', players: { min: 2, max: 2 } },
      actions: [createTemplateChooseOneAction(actionId, phaseId)],
      actionPipelines: [createEmptyOptionsProfile('unplayable')],
    });
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent();

    assert.throws(
      () => agent.chooseMove({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: [pendingClassifiedMove({ actionId, params: {} })],
        rng: createRng(42n),
      }),
      (error: unknown) => (
        error instanceof NoPlayableMovesAfterPreparationError
        && error.agentId === 'policy'
        && error.legalMoveCount === 1
      ),
    );
  });
});
