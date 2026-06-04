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
      eligibleTemplate: 'us.sweepAirStrike',
      selectedRootStableMoveKey: 'sweep|{}|false|operation',
      compoundAvailability: { kind: 'provisional', reason: 'partial-grant' },
      roleBinding: [
        { role: 'sweepSpace', status: 'ready', selectedId: 'available-VC:none' },
        { role: 'airStrikeSpace', status: 'ready', selectedId: '__scenario_deck_fitl_scenario_full_fitl_events_initial_card_pack_coups_pool:none' },
      ],
      microturnMatch: [
        {
          expectedStep: 'sweep-expose-space',
          matchedRole: 'sweepSpace',
          match: 'fallback',
          fallbackReasonKind: 'stableFrontierTieBreakFallback',
        },
        {
          expectedStep: 'air-strike-space',
          matchedRole: 'airStrikeSpace',
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
        delta: { exact: 1 },
      },
      {
        label: 'arvn preview rank remains stable',
        query: { kind: 'victoryStandingRank', seat: 'arvn' },
        delta: { exact: 0 },
      },
    ],
    previewRefs: [
      {
        refId: PREVIEW_MARGIN_REF,
        stableMoveKey: 'chooseOne:decision:doc.actions.10.effects.0.forEach.effects.0.chooseOne::$destination[0]:"pleiku-darlac:none"',
        status: 'ready',
      },
      {
        refId: PREVIEW_MARGIN_REF,
        stableMoveKey: 'chooseOne:decision:doc.actions.10.effects.0.forEach.effects.0.chooseOne::$destination[0]:"an-loc:none"',
        status: 'ready',
      },
    ],
    previewCandidates: [
      {
        stableMoveKey: 'chooseOne:decision:doc.actions.10.effects.0.forEach.effects.0.chooseOne::$destination[0]:"pleiku-darlac:none"',
        previewOutcome: 'ready',
        selectionReason: 'scored',
      },
      {
        stableMoveKey: 'chooseOne:decision:doc.actions.10.effects.0.forEach.effects.0.chooseOne::$destination[0]:"an-loc:none"',
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
