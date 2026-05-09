import {
  applyDecision,
  asActionId,
  asPhaseId,
  assertValidatedGameDef,
  createRng,
  initialState,
  publishMicroturn,
  type ActionDef,
  type ActionPipelineDef,
  type AgentMicroturnDecisionInput,
  type AgentPolicyCatalog,
  type AgentPolicyExpr,
  type AgentPolicyLiteral,
  type CompiledAgentPolicyRef,
  type CompiledAgentProfile,
  type GameDef,
  type GameState,
} from '../../../src/kernel/index.js';
import type { ChooseNStepContext, MicroturnState } from '../../../src/kernel/microturn/types.js';
import { eff } from '../../helpers/effect-tag-helper.js';
import {
  withCompiledPolicyCatalog,
  type AgentPolicyCatalogFixtureLibrary,
} from '../../helpers/policy-catalog-fixtures.js';

export const choosenStepPreviewWitnessId = 'spec-161-choosenstep-differentiation';
export const previewDeltaRef: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }> = {
  kind: 'previewOptionRef',
  refKind: 'deltaVictoryCurrentMarginSelf',
};

const phaseId = asPhaseId('main');

export type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: ChooseNStepContext;
};

export type ChooseNStepAddDecision = ChooseNStepMicroturn['legalActions'][number] & {
  readonly kind: 'chooseNStep';
  readonly command: 'add';
};

const literal = (value: AgentPolicyLiteral): AgentPolicyExpr => ({ kind: 'literal', value });
const refExpr = (ref: CompiledAgentPolicyRef): AgentPolicyExpr => ({ kind: 'ref', ref });

function microturnConsiderations(
  definitions: Record<string, Omit<AgentPolicyCatalogFixtureLibrary['considerations'][string], 'scopes'>>,
): AgentPolicyCatalogFixtureLibrary['considerations'] {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [id, { scopes: ['microturn'], ...definition }]),
  );
}

export type ChoosenStepPreviewFlag = boolean | 'omitted';

function createProfile(chooseNStep: ChoosenStepPreviewFlag): CompiledAgentProfile {
  const considerations = ['preferProjectedMargin'];
  const flagLabel = chooseNStep === 'omitted' ? 'omitted' : chooseNStep ? 'enabled' : 'disabled';
  return {
    fingerprint: `${choosenStepPreviewWitnessId}-${flagLabel}`,
    params: {},
    preview: {
      mode: 'exactWorld',
      completion: 'policyGuided',
      ...(chooseNStep === 'omitted'
        ? {}
        : {
            inner: {
              chooseOne: false,
              chooseNStep,
              maxOptions: 4,
              chooseNBeamWidth: 2,
              depthCap: 3,
            },
          }),
    },
    selection: { mode: 'argmax' },
    use: {
      pruningRules: [],
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

export function createChoosenStepPreviewCatalog(chooseNStep: ChoosenStepPreviewFlag = true): AgentPolicyCatalog {
  const profile = createProfile(chooseNStep);
  const flagLabel = chooseNStep === 'omitted' ? 'omitted' : chooseNStep ? 'enabled' : 'disabled';
  return withCompiledPolicyCatalog({
    schemaVersion: 2,
    catalogFingerprint: `${choosenStepPreviewWitnessId}-${flagLabel}`,
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
      pruningRules: {},
      considerations: microturnConsiderations({
        preferProjectedMargin: {
          costClass: 'preview',
          when: literal(true),
          weight: literal(1),
          value: refExpr(previewDeltaRef),
          previewFallback: { onUnavailable: 'noContribution' },
          dependencies: { parameters: [], stateFeatures: [], candidateFeatures: [], aggregates: [], strategicConditions: [] },
        },
      }),
      tieBreakers: {},
      strategicConditions: {},
    },
    profiles: {
      baseline: profile,
    },
    bindingsBySeat: {
      us: 'baseline',
      arvn: 'baseline',
    },
  });
}

export function createChoosenStepPreviewDef(catalog: AgentPolicyCatalog): GameDef {
  return assertValidatedGameDef({
    metadata: { id: choosenStepPreviewWitnessId, players: { min: 2, max: 2 } },
    seats: [{ id: 'us' }, { id: 'arvn' }],
    constants: {},
    globalVars: [{ name: 'score', type: 'int', init: 0, min: 0, max: 20 }],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: phaseId }] },
    agents: catalog,
    actions: [
      {
        id: asActionId('draft-options'),
        actor: 'active',
        executor: 'actor',
        phase: [phaseId],
        params: [],
        pre: null,
        cost: [],
        effects: [],
        limits: [],
      },
    ] satisfies ActionDef[],
    actionPipelines: [{
      id: 'draft-options-pipeline',
      actionId: asActionId('draft-options'),
      legality: null,
      costValidation: null,
      costEffects: [],
      targeting: {},
      stages: [{
        effects: [
          eff({
            chooseN: {
              internalDecisionId: 'decision:$picks',
              bind: '$picks',
              options: { query: 'enums', values: ['low', 'high', 'spare'] },
              n: 1,
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
          eff({
            if: {
              when: { op: 'in', item: 'high', set: { _t: 2 as const, ref: 'binding', name: '$picks' } },
              then: [eff({ addVar: { scope: 'global', var: 'score', delta: 5 } })],
              else: [eff({ addVar: { scope: 'global', var: 'score', delta: 1 } })],
            },
          }) as ActionPipelineDef['stages'][number]['effects'][number],
        ],
      }],
      atomicity: 'partial',
    }],
    triggers: [],
    terminal: {
      conditions: [],
      margins: [
        { seat: 'us', value: { _t: 2 as const, ref: 'gvar', var: 'score' } },
        { seat: 'arvn', value: 0 },
      ],
    },
  });
}

export function createChoosenStepPreviewFixture(chooseNStep: ChoosenStepPreviewFlag = true): {
  readonly catalog: AgentPolicyCatalog;
  readonly def: GameDef;
  readonly state: GameState;
  readonly microturn: ChooseNStepMicroturn;
  readonly input: AgentMicroturnDecisionInput;
} {
  const catalog = createChoosenStepPreviewCatalog(chooseNStep);
  const def = createChoosenStepPreviewDef(catalog);
  const state = initialState(def, 161, 2).state;
  const actionSelection = publishMicroturn(def, state);
  const firstAction = actionSelection.legalActions[0];
  if (firstAction === undefined) {
    throw new Error('Expected fixture action selection to publish at least one legal action');
  }
  const afterAction = applyDecision(def, state, firstAction).state;
  const microturn = publishMicroturn(def, afterAction);
  if (microturn.kind !== 'chooseNStep') {
    throw new Error(`Expected chooseNStep fixture microturn, got ${microturn.kind}`);
  }
  return {
    catalog,
    def,
    state: afterAction,
    microturn: microturn as ChooseNStepMicroturn,
    input: {
      def,
      state: afterAction,
      microturn,
      rng: createRng(161n),
    },
  };
}

export const legalAddStableKeys = (microturn: ChooseNStepMicroturn): readonly string[] =>
  microturn.legalActions
    .filter((decision): decision is ChooseNStepAddDecision =>
      decision.kind === 'chooseNStep' && decision.command === 'add')
    .map((decision) => `chooseNStep:${String(decision.decisionKey)}:add:${JSON.stringify(decision.value ?? null)}`)
    .sort((left, right) => left.localeCompare(right));
