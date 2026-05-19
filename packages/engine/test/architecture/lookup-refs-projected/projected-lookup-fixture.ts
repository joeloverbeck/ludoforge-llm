import * as assert from 'node:assert/strict';

import { createPolicyAgentChooseNStepInnerPreview } from '../../../src/agents/policy-agent-inner-preview.js';
import { PolicyAgent } from '../../../src/agents/policy-agent.js';
import { scoreMicroturnOptionWithContributions } from '../../../src/agents/microturn-option-eval.js';
import type { PreviewOptionProjectedState } from '../../../src/agents/policy-runtime.js';
import {
  applyDecision,
  asActionId,
  asPhaseId,
  asPlayerId,
  asTokenId,
  asZoneId,
  assertValidatedGameDef,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type ChoicePendingChooseNRequest,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type CompiledPolicyExpr,
  type GameDef,
  type MoveParamValue,
  type PolicyAgentDecisionTrace,
} from '../../../src/kernel/index.js';
import type { ChooseNStepContext, MicroturnState } from '../../../src/kernel/microturn/types.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from '../../helpers/policy-catalog-fixtures.js';
import { lookupSurfaceVisibility, microturnOptionValueExpr } from '../lookup-refs/lookup-refs-fixture.js';

type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: ChooseNStepContext;
};

type FixtureProfileKind = 'projected' | 'scalar' | 'deepening';

const phaseId = asPhaseId('main');
const troopCountPath = ['variables', 'troopCount'] as const;

export const projectedTroopCountRefId = 'lookup.previewOptionState.zones.ZoneId.1212757921.variables.troopCount';
export const scalarDriveDepthRefId = 'preview.option.driveDepth';

const publicVisibility = {
  current: 'public',
  preview: { visibility: 'public', allowWhenHiddenSampling: true },
} as const;

const projectedLookupSurfaceVisibility = {
  ...lookupSurfaceVisibility,
  globalVars: {
    ...lookupSurfaceVisibility.globalVars,
    pressure: publicVisibility,
  },
} as const;

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const compiledLiteral = (value: AgentPolicyLiteral): CompiledPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

const previewDriveDepthRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }> = {
  kind: 'previewOptionRef',
  refKind: 'driveDepth',
};

export const projectedZoneTroopCountRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }> = {
  kind: 'lookup',
  surface: 'previewOptionState',
  collection: 'zones',
  keyType: 'ZoneId',
  key: microturnOptionValueExpr,
  path: troopCountPath,
  onMissing: 'unavailable',
  onHidden: 'unavailable',
};

const projectedLookupRef = (
  collection: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['collection'],
  keyType: Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>['keyType'],
  key: CompiledPolicyExpr,
  path: readonly string[],
): Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }> => ({
  kind: 'lookup',
  surface: 'previewOptionState',
  collection,
  keyType,
  key,
  path,
  onMissing: 'unavailable',
  onHidden: 'unavailable',
});

const projectedCollectionRefs = [
  projectedZoneTroopCountRef,
  projectedLookupRef('tokens', 'TokenId', compiledLiteral('unit-zone-a'), ['properties', 'strength']),
  projectedLookupRef('players', 'PlayerId', compiledLiteral(0), ['variables', 'influence']),
  projectedLookupRef('globals', 'string', compiledLiteral('pressure'), ['properties', 'value']),
] as const;

function microturnConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );
}

function createProfile(kind: FixtureProfileKind): CompiledAgentProfile {
  const considerations = kind === 'scalar' ? ['scalarPressure'] : ['projectedTroopCount'];
  const strategy = kind === 'deepening' ? 'continuedDeepening' : 'singlePass';
  return {
    fingerprint: `projected-lookup-fixture-${kind}`,
    observerName: 'currentPlayer',
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'greedy',
      inner: {
        chooseOne: false,
        chooseNStep: true,
        maxOptions: 4,
        chooseNBeamWidth: 1,
        depthCap: kind === 'deepening' ? 1 : 3,
        strategy,
        capClass: kind === 'deepening' ? 'deep1024' : 'standard256',
        ...(kind === 'deepening'
          ? {
              continuedDeepening: {
                broad: { depthCap: 1 },
                deep: {
                  depthCap: 3,
                  trigger: ['allRequestedRefsDepthCapped'],
                  rootPolicy: 'allRootsWithinCap',
                },
              },
            }
          : {}),
      },
    },
    selection: { mode: 'argmax' },
    use: {
      guardrails: [],
      considerations,
      tieBreakers: [],
    },
    plan: {
      stateFeatures: [],
      candidateFeatures: [],
      candidateAggregates: [],
      considerations,
    },
  };
}

export function createProjectedLookupCatalog(kind: FixtureProfileKind = 'projected'): AgentPolicyCatalog {
  const profile = createProfile(kind);
  const catalog = withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `projected-lookup-fixture-${kind}`,
    surfaceVisibility: projectedLookupSurfaceVisibility,
    parameterDefs: {},
    candidateParamDefs: {},
    library: {
      stateFeatures: {},
      candidateFeatures: {},
      candidateAggregates: {},
      guardrails: {},
      considerations: microturnConsiderations({
        projectedTroopCount: {
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: refExpr(projectedZoneTroopCountRef),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: [],
            aggregates: [],
            strategicConditions: [],
          },
        },
        scalarPressure: {
          costClass: 'preview',
          when: literal(true),
          weight: literal(10),
          value: refExpr(previewDriveDepthRef),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: {
            parameters: [],
            stateFeatures: [],
            candidateFeatures: [],
            aggregates: [],
            strategicConditions: [],
          },
        },
      }),
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: { [kind]: profile },
    bindingsBySeat: { seatA: kind, seatB: kind },
  });
  return {
    ...catalog,
    compiled: {
      ...catalog.compiled,
      considerations: {
        ...catalog.compiled.considerations,
        projectedTroopCount: {
          ...catalog.compiled.considerations.projectedTroopCount!,
          hasPreviewRef: true,
          hasLookupRef: true,
        },
        scalarPressure: {
          ...catalog.compiled.considerations.scalarPressure!,
          hasPreviewRef: true,
        },
      },
    },
  };
}

export function createProjectedLookupDef(catalog: AgentPolicyCatalog): GameDef {
  return assertValidatedGameDef({
    metadata: { id: 'projected-lookup-fixture', players: { min: 2, max: 2 } },
    seats: [{ id: 'seatA' }, { id: 'seatB' }],
    constants: {},
    globalVars: [{ name: 'pressure', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [{ name: 'influence', type: 'int', init: 4, min: 0, max: 20 }],
    zoneVars: [{ name: 'troopCount', type: 'int', init: 0, min: 0, max: 20 }],
    zones: [
      {
        id: asZoneId('zone-a:none'),
        owner: 'none',
        visibility: 'public',
        ordering: 'set',
        category: 'region',
        attributes: { population: 1 },
      },
      {
        id: asZoneId('zone-b:0'),
        owner: 'player',
        ownerPlayerIndex: 0,
        visibility: 'owner',
        ordering: 'set',
        category: 'region',
        attributes: { population: 2 },
      },
    ],
    tokenTypes: [{ id: 'unit', props: { strength: 'int' } }],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    observers: {
      schemaVersion: 1,
      catalogFingerprint: 'projected-lookup-fixture',
      defaultObserverName: 'currentPlayer',
      observers: {
        currentPlayer: {
          fingerprint: 'projected-lookup-fixture-current-player',
          surfaces: projectedLookupSurfaceVisibility,
          zones: {
            entries: {
              'zone-a': { tokens: 'public', order: 'public' },
            },
            defaultEntry: { tokens: 'owner', order: 'owner' },
          },
        },
      },
    },
    agents: catalog,
    actions: [{
      id: asActionId('reinforce-zone'),
      actor: 'active',
      executor: 'actor',
      phase: [phaseId],
      params: [],
      pre: null,
      cost: [],
      effects: [],
      limits: [],
    }] satisfies ActionDef[],
    actionPipelines: [{
      id: 'reinforce-zone-pipeline',
      actionId: asActionId('reinforce-zone'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$targetZone',
              bind: '$targetZone',
              options: { query: 'enums', values: ['zone-a:none', 'zone-b:0'] },
              n: 1,
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({
            addVar: {
              scope: 'zoneVar',
              zone: { zoneExpr: { _t: 2 as const, ref: 'binding', name: '$targetZone' } },
              var: 'troopCount',
              delta: 2,
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({ addVar: { scope: 'global', var: 'pressure', delta: 1 } }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'seatA', value: { _t: 2 as const, ref: 'gvar', var: 'pressure' } },
        { seat: 'seatB', value: 0 },
      ],
    },
  });
}

function createInput(
  def: GameDef,
  state: ReturnType<typeof initialState>['state'],
  microturn: MicroturnState,
): AgentMicroturnDecisionInput {
  return {
    def,
    state,
    microturn,
    rng: { state: state.rng },
  };
}

export function createProjectedLookupFixture(kind: FixtureProfileKind = 'projected'): {
  readonly catalog: AgentPolicyCatalog;
  readonly def: GameDef;
  readonly chooseNStepInput: AgentMicroturnDecisionInput & { readonly microturn: ChooseNStepMicroturn };
} {
  const catalog = createProjectedLookupCatalog(kind);
  const def = createProjectedLookupDef(catalog);
  const initial = initialState(def, 165, 2);
  const state = {
    ...initial.state,
      zoneVars: {
        ...initial.state.zoneVars,
        'zone-a:none': { troopCount: 3 },
        'zone-b:0': { troopCount: 5 },
      },
    zones: {
      ...initial.state.zones,
      'zone-a:none': [{ id: asTokenId('unit-zone-a'), type: 'unit', props: { strength: 11 } }],
    },
    perPlayerVars: {
      0: { influence: 7 },
      1: { influence: 1 },
    },
  };
  const actionSelection = publishMicroturn(def, state);
  const firstAction = actionSelection.legalActions[0];
  assert.ok(firstAction !== undefined);
  const afterAction = applyDecision(def, state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  assert.equal(microturn.kind, 'chooseNStep');
  return {
    catalog,
    def,
    chooseNStepInput: createInput(def, afterAction, microturn) as AgentMicroturnDecisionInput & {
      readonly microturn: ChooseNStepMicroturn;
    },
  };
}

export function captureProjectedLookupFixturePreview(kind: FixtureProfileKind = 'projected') {
  const fixture = createProjectedLookupFixture(kind);
  const profile = fixture.catalog.profiles[kind];
  assert.ok(profile !== undefined);
  const preview = createPolicyAgentChooseNStepInnerPreview(fixture.chooseNStepInput, {
    catalog: fixture.catalog,
    seatId: 'seatA',
    profileId: kind,
    profile,
  });
  assert.ok(preview !== undefined);
  return preview;
}

export function runProjectedLookupFixtureTrace(kind: FixtureProfileKind = 'projected'): PolicyAgentDecisionTrace {
  const fixture = createProjectedLookupFixture(kind);
  const agent = new PolicyAgent({
    profileId: kind,
    traceLevel: 'verbose',
  });
  const result = agent.chooseDecision(fixture.chooseNStepInput);
  assert.ok(result.agentDecision !== undefined);
  return result.agentDecision;
}

export function projectedCollectionProfileRefs(): readonly Extract<CompiledAgentPolicyRef, { readonly kind: 'lookup' }>[] {
  return projectedCollectionRefs;
}

export function scoreProjectedCollectionRefs(optionValue: MoveParamValue = 'zone-a:none') {
  const fixture = createProjectedLookupFixture('projected');
  const considerations = Object.fromEntries(
    projectedCollectionRefs.map((ref, index) => [`projectedCollection${index}`, {
      scopes: ['microturn'] as const,
      costClass: 'preview' as const,
      weight: { kind: 'literal' as const, value: 1 },
      value: { kind: 'ref' as const, ref },
      hasPreviewRef: true,
      hasLookupRef: true,
      previewFallback: { onUnavailable: 'noContribution' as const },
      dependencies: {
        parameters: [],
        stateFeatures: [],
        candidateFeatures: [],
        aggregates: [],
        strategicConditions: [],
      },
    }]),
  );
  const previewState: PreviewOptionProjectedState = {
    state: {
      ...fixture.chooseNStepInput.state,
      zoneVars: {
        ...fixture.chooseNStepInput.state.zoneVars,
        'zone-a:none': { troopCount: 5 },
        'zone-b:0': { troopCount: 5 },
      },
      globalVars: {
        ...fixture.chooseNStepInput.state.globalVars,
        pressure: 1,
      },
    },
    outcome: 'ready',
    driveDepth: 2,
    completionPolicy: 'greedy',
    capClass: 'standard256',
  };
  const request: ChoicePendingChooseNRequest = {
    kind: 'pending',
    complete: false,
    decisionKey: fixture.chooseNStepInput.microturn.decisionContext.decisionKey,
    name: String(fixture.chooseNStepInput.microturn.decisionContext.decisionKey),
    options: fixture.chooseNStepInput.microturn.decisionContext.options,
    targetKinds: ['zone'],
    type: 'chooseN',
    min: fixture.chooseNStepInput.microturn.decisionContext.cardinality.min,
    max: fixture.chooseNStepInput.microturn.decisionContext.cardinality.max,
    selected: fixture.chooseNStepInput.microturn.decisionContext.selectedSoFar,
    canConfirm: fixture.chooseNStepInput.microturn.decisionContext.stepCommands.includes('confirm'),
  };
  return scoreMicroturnOptionWithContributions(
    fixture.chooseNStepInput.state,
    fixture.def,
    {
      ...fixture.catalog,
      compiled: {
        ...fixture.catalog.compiled,
        considerations,
      },
    },
    asPlayerId(0),
    'seatA',
    {},
    request,
    optionValue,
    0,
    Object.keys(considerations),
    undefined,
    new Map(),
    previewState,
  );
}
