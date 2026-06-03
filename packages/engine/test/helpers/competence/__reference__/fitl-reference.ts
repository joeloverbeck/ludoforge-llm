import { PolicyAgent } from '../../../../src/agents/index.js';
import {
  assertValidatedGameDef,
  type Agent,
  type ValidatedGameDef,
} from '../../../../src/kernel/index.js';
import { assertNoErrors } from '../../diagnostic-helpers.js';
import { compileProductionSpec } from '../../production-spec-helpers.js';
import type {
  OutcomeDeltaAssertion,
  PlanTraceChainExpectation,
  PreviewCandidateExpectation,
  PreviewRefExpectation,
} from '../index.js';
import { runToCompetenceDecision, type CompetenceRunResult } from '../index.js';

const FITL_PROFILES = ['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline'] as const;
const PREVIEW_MARGIN_REF = 'preview.option.delta.victory.currentMargin.self';

export interface FitlCompetenceReference {
  readonly def: ValidatedGameDef;
  readonly actionRun: () => CompetenceRunResult;
  readonly previewRun: () => CompetenceRunResult;
  readonly planExpectation: PlanTraceChainExpectation;
  readonly actionTrapStableMoveKeys: readonly string[];
  readonly previewDeltaAssertions: readonly OutcomeDeltaAssertion[];
  readonly previewRefs: readonly PreviewRefExpectation[];
  readonly previewCandidates: readonly PreviewCandidateExpectation[];
}

export const createFitlCompetenceReference = (): FitlCompetenceReference => {
  const def = compileFitl();
  return {
    def,
    actionRun: () => runFitlActionSelection(def),
    previewRun: () => runFitlPreviewMicroturn(def),
    planExpectation: {
      activeDoctrine: 'us.buildSupport',
      eligibleTemplate: 'us.trainAdvise',
      selectedRootStableMoveKey: 'train|{}|false|operation',
      compoundAvailability: { kind: 'provisional', reason: 'partial-grant' },
      roleBinding: [
        { role: 'trainSpace', status: 'ready', selectedId: 'saigon:none' },
        { role: 'adviseSpace', status: 'ready', selectedId: 'an-loc:none' },
      ],
      microturnMatch: [
        {
          expectedStep: 'train-support-space',
          matchedRole: 'trainSpace',
          match: 'fallback',
          fallbackReasonKind: 'stableFrontierTieBreakFallback',
        },
        {
          expectedStep: 'advise-force-multiplier',
          matchedRole: 'adviseSpace',
          match: 'fallback',
          fallbackReasonKind: 'stableFrontierTieBreakFallback',
        },
      ],
    },
    actionTrapStableMoveKeys: ['pass|{}|false|pass'],
    previewDeltaAssertions: [
      {
        label: 'arvn preview margin improves',
        query: { kind: 'victoryStandingMargin', seat: 'arvn' },
        delta: { exact: 2 },
      },
      {
        label: 'arvn preview rank improves',
        query: { kind: 'victoryStandingRank', seat: 'arvn' },
        delta: { exact: -1 },
      },
    ],
    previewRefs: [
      {
        refId: PREVIEW_MARGIN_REF,
        stableMoveKey: 'chooseOne:decision:doc.actionPipelines.1.stages[1].effects.0.forEach.effects.0.chooseOne::$trainChoice[0]:"rangers"',
        status: 'ready',
      },
      {
        refId: PREVIEW_MARGIN_REF,
        stableMoveKey: 'chooseOne:decision:doc.actionPipelines.1.stages[1].effects.0.forEach.effects.0.chooseOne::$trainChoice[0]:"arvn-cubes"',
        status: 'ready',
      },
    ],
    previewCandidates: [
      {
        stableMoveKey: 'chooseOne:decision:doc.actionPipelines.1.stages[1].effects.0.forEach.effects.0.chooseOne::$trainChoice[0]:"rangers"',
        previewOutcome: 'ready',
        selectionReason: 'scored',
      },
      {
        stableMoveKey: 'chooseOne:decision:doc.actionPipelines.1.stages[1].effects.0.forEach.effects.0.chooseOne::$trainChoice[0]:"arvn-cubes"',
        previewOutcome: 'ready',
        selectionReason: 'gated',
      },
    ],
  };
};

const compileFitl = (): ValidatedGameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assertNoErrors(compiled);
  return assertValidatedGameDef(compiled.gameDef);
};

const createFitlAgents = (): readonly Agent[] =>
  FITL_PROFILES.map((profileId) => new PolicyAgent({ profileId, traceLevel: 'verbose' }));

const runFitlActionSelection = (def: ValidatedGameDef): CompetenceRunResult =>
  runToCompetenceDecision({
    def,
    seed: 209,
    agents: createFitlAgents(),
    playerCount: FITL_PROFILES.length,
    maxTurns: 5,
    microturnBound: 80,
    advanceUntil: ({ microturn }) =>
      microturn.kind === 'actionSelection' && microturn.legalActions.length > 1,
  });

const runFitlPreviewMicroturn = (def: ValidatedGameDef): CompetenceRunResult =>
  runToCompetenceDecision({
    def,
    seed: 1,
    agents: createFitlAgents(),
    playerCount: FITL_PROFILES.length,
    maxTurns: 8,
    microturnBound: 200,
    advanceUntil: ({ microturn }) =>
      microturn.kind === 'chooseOne'
      && String(microturn.seatId) === 'arvn'
      && microturn.legalActions.length > 1,
  });
