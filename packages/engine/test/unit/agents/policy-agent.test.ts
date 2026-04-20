// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

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
      globalMarkers: {},
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
            expr: opExpr(
              'eq',
              opExpr('coalesce', refExpr({ kind: 'candidateParam', id: '$target' }), literal('')),
              literal('gamma'),
            ),
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

function createTwoPhaseIsolationDef(
  includeCompletionGuidance: boolean,
): GameDef {
  const governActionId = asActionId('govern');
  const sweepActionId = asActionId('sweep');
  const governProfile = createTemplateChooseOneProfile(governActionId);
  const sweepProfile = createTemplateChooseOneProfile(sweepActionId);
  const catalog = createCatalog();

  return createDef({
    metadata: { id: `policy-agent-two-phase-${includeCompletionGuidance ? 'guided' : 'unguided'}`, players: { min: 2, max: 2 } },
    actions: [
      createTemplateChooseOneAction(governActionId, phaseId),
      createTemplateChooseOneAction(sweepActionId, phaseId),
    ],
    actionPipelines: [governProfile, sweepProfile] as readonly ActionPipelineDef[],
    agents: {
      ...catalog,
      library: {
        ...catalog.library,
        considerations: {
          ...moveConsiderations({
            preferGovern: {
              costClass: 'candidate',
              weight: literal(10),
              value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('govern'))),
              dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
            },
          }),
          ...(includeCompletionGuidance
            ? completionConsiderations({
              preferGamma: {
                costClass: 'state',
                when: literal(true),
                weight: literal(10),
                value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'optionIntrinsic', intrinsic: 'value' }), literal('gamma'))),
                dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
              },
            })
            : {}),
        },
      },
      profiles: {
        passive: {
          fingerprint: includeCompletionGuidance ? 'two-phase-guided' : 'two-phase-unguided',
          params: {},
          preview: { mode: 'exactWorld' },
          selection: { mode: 'argmax' },
          use: {
            pruningRules: [],
            considerations: includeCompletionGuidance ? ['preferGovern', 'preferGamma'] : ['preferGovern'],
            tieBreakers: ['stableMoveKey'],
          },
          plan: {
            stateFeatures: [],
            candidateFeatures: [],
            candidateAggregates: [],
            considerations: includeCompletionGuidance ? ['preferGovern', 'preferGamma'] : ['preferGovern'],
          },
        },
      },
      candidateParamDefs: {
        '$target': { type: 'id' },
      },
    },
  });
}

function createTemplatePreviewDef(enablePhase1Preview = false): GameDef {
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
        globalMarkers: {},
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
          preferChooseTargetPhase1: {
            costClass: 'candidate',
            weight: literal(100),
            value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('chooseTarget'))),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
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
          preview: {
            mode: 'exactWorld',
            ...(enablePhase1Preview ? { phase1: true, phase1CompletionsPerAction: 1 } : {}),
          },
          selection: { mode: 'argmax' },
          use: {
            pruningRules: [],
            considerations: ['preferChooseTargetPhase1', 'preferProjectedMargin'],
            tieBreakers: ['stableMoveKey'],
          },
          plan: {
            stateFeatures: [],
            candidateFeatures: ['projectedMargin'],
            candidateAggregates: [],
            considerations: ['preferChooseTargetPhase1', 'preferProjectedMargin'],
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

function createVictoryMarginTemplatePreviewDef(options?: {
  readonly phase1CompletionsPerAction?: number;
  readonly tieOnHighLow?: boolean;
}): GameDef {
  const actionId = asActionId('chooseTarget');
  const phase1CompletionsPerAction = options?.phase1CompletionsPerAction ?? 1;
  const tieOnHighLow = options?.tieOnHighLow ?? false;
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
              internalDecisionId: 'decision:$targetMargin',
              bind: '$targetMargin',
              options: { query: 'enums', values: ['low', 'high'] },
            },
          }),
          eff({
            if: {
              when: { op: '==' as const, left: { _t: 2 as const, ref: 'binding' as const, name: '$targetMargin' }, right: 'high' },
              then: [eff({ setVar: { scope: 'global', var: 'usMargin', value: tieOnHighLow ? 2 : 8 } })],
              else: [eff({ setVar: { scope: 'global', var: 'usMargin', value: 2 } })],
            },
          }),
        ],
      },
    ],
    atomicity: 'atomic',
  };

  return {
    metadata: { id: `policy-agent-template-victory-${tieOnHighLow ? 'tie' : 'best'}`, players: { min: 2, max: 2 } },
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
      catalogFingerprint: `template-victory-${tieOnHighLow ? 'tie' : 'best'}-catalog`,
      surfaceVisibility: {
        globalVars: {
          usMargin: {
            current: 'public',
            preview: { visibility: 'public', allowWhenHiddenSampling: true },
          },
        },
        globalMarkers: {},
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
        '$targetMargin': { type: 'id' },
      },
      library: {
        stateFeatures: {},
        candidateFeatures: {
          projectedSelfMargin: {
            type: 'number',
            costClass: 'preview',
            expr: refExpr({
              kind: 'previewSurface',
              family: 'victoryCurrentMargin',
              id: 'currentMargin',
              selector: { kind: 'role', seatToken: 'self' },
            }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
        },
        candidateAggregates: {},
        pruningRules: {},
        considerations: moveConsiderations({
          preferChooseTargetPhase1: {
            costClass: 'candidate',
            weight: literal(100),
            value: opExpr('boolToNumber', opExpr('eq', refExpr({ kind: 'candidateIntrinsic', intrinsic: 'actionId' }), literal('chooseTarget'))),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
          },
          preferProjectedSelfMargin: {
            costClass: 'preview',
            weight: literal(1),
            value: refExpr({ kind: 'library', refKind: 'candidateFeature', id: 'projectedSelfMargin' }),
            dependencies: { parameters: [], stateFeatures: [], candidateFeatures: ['projectedSelfMargin'], aggregates: [], strategicConditions: [] },
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
          fingerprint: `template-victory-${tieOnHighLow ? 'tie' : 'best'}-profile`,
          params: {},
          preview: {
            mode: 'exactWorld',
            phase1: true,
            phase1CompletionsPerAction,
          },
          selection: { mode: 'argmax' },
          use: {
            pruningRules: [],
            considerations: ['preferChooseTargetPhase1', 'preferProjectedSelfMargin'],
            tieBreakers: ['stableMoveKey'],
          },
          plan: {
            stateFeatures: [],
            candidateFeatures: ['projectedSelfMargin'],
            candidateAggregates: [],
            considerations: ['preferChooseTargetPhase1', 'preferProjectedSelfMargin'],
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
          eff({
            chooseOne: {
              internalDecisionId: 'decision:$targetMargin',
              bind: '$targetMargin',
              options: { query: 'enums', values: ['low', 'high'] },
            },
          }),
          eff({
            if: {
              when: { op: '==' as const, left: { _t: 2 as const, ref: 'binding' as const, name: '$targetMargin' }, right: 'high' },
              then: [eff({ setVar: { scope: 'global', var: 'usMargin', value: tieOnHighLow ? 2 : 8 } })],
              else: [eff({ setVar: { scope: 'global', var: 'usMargin', value: 2 } })],
            },
          }),
        ],
        limits: [],
      },
    ],
    actionPipelines: [templateProfile] as readonly ActionPipelineDef[],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'usMargin' } },
        { seat: 'arvn', value: 0 },
      ],
    },
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

function createInput(def: GameDef): Parameters<PolicyAgent['chooseDecision']>[0] {
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

    const result = agent.chooseDecision(createInput(def));

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

    const result = agent.chooseDecision(createInput(def));

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

    const result = agent.chooseDecision({
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

    const result = agent.chooseDecision(createInput(def));

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

    const result = agent.chooseDecision({
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

  it('falls back to broader prepared moves when the chosen phase-2 action filter is empty', () => {
    const def = createDef({
      metadata: { id: 'policy-agent-empty-phase2-filter', players: { min: 2, max: 2 } },
      actionPipelines: [createEmptyOptionsProfile('event')],
      agents: {
        ...createCatalog(),
        bindingsBySeat: {
          us: 'aggressive',
        },
      },
    });
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent();

    const result = agent.chooseDecision({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [
        completeClassifiedMove({ actionId: asActionId('pass'), params: {} }),
        pendingClassifiedMove({ actionId: asActionId('event'), params: {} }),
      ],
      rng: createRng(42n),
    });

    assert.deepEqual(result.move.move, { actionId: asActionId('pass'), params: {} });
    assert.equal(result.agentDecision?.kind, 'policy');
    if (result.agentDecision?.kind !== 'policy') {
      assert.fail('expected policy agent decision');
    }
    assert.equal(result.agentDecision.emergencyFallback, true);
    assert.equal(result.agentDecision.failure?.code, 'PHASE1_ACTION_FILTER_EMPTY');
    assert.equal(result.agentDecision.selectedStableMoveKey !== null, true);
  });

  it('uses completion guidance to prefer the highest-scoring template option', () => {
    const def = createGuidedTemplateDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent();

    const result = agent.chooseDecision({
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

    const first = new PolicyAgent().chooseDecision(input);
    const second = new PolicyAgent().chooseDecision(input);

    assert.deepEqual(first.move.move, second.move.move);
    assert.equal(first.move.move.params['$target'], 'gamma');
  });

  it('preserves phase-1 preview diagnostics alongside phase-2 completion stats for template moves', () => {
    const def = createTemplatePreviewDef();
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const result = agent.chooseDecision({
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
      ready: 1,
      stochastic: 0,
      unknownRandom: 0,
      unknownHidden: 0,
      unknownUnresolved: 1,
      unknownFailed: 0,
    });
    assert.deepEqual(result.agentDecision.completionStatistics, {
      totalClassifiedMoves: 2,
      completedCount: 0,
      stochasticCount: 0,
      rejectedNotViable: 0,
      templateCompletionAttempts: 3,
      templateCompletionSuccesses: 3,
      templateCompletionStructuralFailures: 0,
      duplicatesRemoved: 2,
      completionsByActionId: {
        chooseTarget: 3,
      },
    });
    assert.equal(result.agentDecision.movePreparations?.length, 1);
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
    assert.deepEqual(completedTemplateCandidate.unknownPreviewRefs, [{ refId: 'globalVar.usMargin', reason: 'unresolved' }]);
    assert.equal(completedTemplateCandidate.previewOutcome, 'unresolved');
    assert.equal(completedTemplateCandidate.previewFailureReason, 'notDecisionComplete');
  });

  it('uses representative phase-1 previews when preview.phase1 is enabled', () => {
    const def = createTemplatePreviewDef(true);
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const result = agent.chooseDecision({
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
    if (result.agentDecision.candidates === undefined) {
      assert.fail('expected verbose policy candidates');
    }

    const chooseTargetCandidate = result.agentDecision.candidates.find((candidate) => candidate.actionId === 'chooseTarget');
    const passCandidate = result.agentDecision.candidates.find((candidate) => candidate.actionId === 'pass');
    assert.ok(chooseTargetCandidate);
    assert.ok(passCandidate);
    assert.equal(chooseTargetCandidate?.previewOutcome, 'ready');
    assert.equal(passCandidate?.previewOutcome, 'ready');
    assert.deepEqual(chooseTargetCandidate?.unknownPreviewRefs, []);
    assert.deepEqual(passCandidate?.unknownPreviewRefs, []);
    assert.equal((chooseTargetCandidate?.score ?? Number.NEGATIVE_INFINITY) > (passCandidate?.score ?? Number.POSITIVE_INFINITY), true);
  });

  it('keeps N=1 phase-1 representative selection deterministic for guided previews', () => {
    const def = createVictoryMarginTemplatePreviewDef({ phase1CompletionsPerAction: 1 });
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const result = agent.chooseDecision({
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
    const chooseTargetCandidate = result.agentDecision.candidates?.find((candidate) => candidate.actionId === 'chooseTarget');
    assert.ok(chooseTargetCandidate);
    assert.equal(chooseTargetCandidate?.previewOutcome, 'ready');
    assert.equal(chooseTargetCandidate?.score, 102);
  });

  it('selects the highest projected self-margin representative when phase1CompletionsPerAction > 1', () => {
    const def = createVictoryMarginTemplatePreviewDef({ phase1CompletionsPerAction: 2 });
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const result = agent.chooseDecision({
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
    const chooseTargetCandidate = result.agentDecision.candidates?.find((candidate) => candidate.actionId === 'chooseTarget');
    assert.ok(chooseTargetCandidate);
    assert.equal(chooseTargetCandidate?.previewOutcome, 'ready');
    assert.equal(chooseTargetCandidate?.score, 102);
  });

  it('keeps best-of-N representative selection deterministic for the same seed and state', () => {
    const def = createVictoryMarginTemplatePreviewDef({ phase1CompletionsPerAction: 2 });
    const state = initialState(def, 7, 2).state;
    const input = {
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves: [
        completeClassifiedMove({ actionId: asActionId('pass'), params: {} }, state.stateHash),
        pendingClassifiedMove({ actionId: asActionId('chooseTarget'), params: {} }),
      ],
      rng: createRng(42n),
    } as const;

    const first = new PolicyAgent({ traceLevel: 'verbose' }).chooseDecision(input);
    const second = new PolicyAgent({ traceLevel: 'verbose' }).chooseDecision(input);

    assert.deepEqual(first.move.move, second.move.move);
    assert.deepEqual(first.agentDecision, second.agentDecision);
  });

  it('keeps best-of-N representative ties deterministic when preview scores tie', () => {
    const def = createVictoryMarginTemplatePreviewDef({ phase1CompletionsPerAction: 2, tieOnHighLow: true });
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const result = agent.chooseDecision({
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
    const chooseTargetCandidate = result.agentDecision.candidates?.find((candidate) => candidate.actionId === 'chooseTarget');
    assert.ok(chooseTargetCandidate);
    assert.equal(chooseTargetCandidate?.previewOutcome, 'ready');
    assert.equal(chooseTargetCandidate?.score, 102);
  });

  it('throws an invariant error when every classified move is unsatisfiable', () => {
    const actionId = asActionId('unplayable');
    const def = createDef({
      metadata: { id: 'policy-agent-unplayable-template', players: { min: 2, max: 2 } },
      actions: [createTemplateChooseOneAction(actionId, phaseId)],
      actionPipelines: [createEmptyOptionsProfile('unplayable')],
    });
    const state = initialState(def, 7, 2).state;
    const agent = new PolicyAgent();

    assert.throws(
      () => agent.chooseDecision({
        def,
        state,
        playerId: asPlayerId(0),
        legalMoves: [pendingClassifiedMove({ actionId, params: {} })],
        rng: createRng(42n),
      }),
      /PolicyAgent invariant violation: no playable move remained after preparing 1 classified legal move\(s\)\./,
    );
  });

  it('keeps action selection isolated from completion guidance, preserves phase-1 ranking, and only completes the winning action type', () => {
    const guidedDef = createTwoPhaseIsolationDef(true);
    const unguidedDef = createTwoPhaseIsolationDef(false);
    const guidedState = initialState(guidedDef, 7, 2).state;
    const unguidedState = initialState(unguidedDef, 7, 2).state;
    const legalMoves = [
      pendingClassifiedMove({ actionId: asActionId('govern'), params: {} }),
      pendingClassifiedMove({ actionId: asActionId('sweep'), params: {} }),
    ];
    const syntheticSinglePassUpperBound = legalMoves.length * 3;
    const agent = new PolicyAgent({ traceLevel: 'verbose' });

    const guided = agent.chooseDecision({
      def: guidedDef,
      state: guidedState,
      playerId: asPlayerId(0),
      legalMoves,
      rng: createRng(42n),
    });
    const unguided = agent.chooseDecision({
      def: unguidedDef,
      state: unguidedState,
      playerId: asPlayerId(0),
      legalMoves,
      rng: createRng(42n),
    });

    assert.equal(guided.move.actionId, asActionId('govern'));
    assert.equal(unguided.move.actionId, asActionId('govern'));
    assert.equal(guided.move.params['$target'], 'gamma');
    assert.equal(guided.agentDecision?.kind, 'policy');
    assert.equal(unguided.agentDecision?.kind, 'policy');
    if (guided.agentDecision?.kind !== 'policy') {
      assert.fail('expected guided policy decision trace');
    }
    if (unguided.agentDecision?.kind !== 'policy') {
      assert.fail('expected unguided policy decision trace');
    }
    assert.deepEqual(guided.agentDecision.phase1ActionRanking, unguided.agentDecision.phase1ActionRanking);
    assert.deepEqual(guided.agentDecision.phase1ActionRanking, ['govern', 'sweep']);
    assert.deepEqual(guided.agentDecision.completionStatistics?.completionsByActionId, {
      govern: 3,
    });
    assert.equal(guided.agentDecision.completionStatistics?.templateCompletionAttempts, 3);
    assert.equal(
      guided.agentDecision.completionStatistics?.templateCompletionAttempts !== undefined
      && guided.agentDecision.completionStatistics.templateCompletionAttempts < syntheticSinglePassUpperBound,
      true,
    );
    assert.equal(
      unguided.agentDecision.completionStatistics?.templateCompletionAttempts !== undefined
      && unguided.agentDecision.completionStatistics.templateCompletionAttempts < syntheticSinglePassUpperBound,
      true,
    );
    assert.equal(guided.agentDecision.movePreparations?.length, 1);
    assert.equal(guided.agentDecision.movePreparations?.[0]?.actionId, 'govern');
  });
});
