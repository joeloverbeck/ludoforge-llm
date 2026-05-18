import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentParameterValue,
  AgentPolicyCatalog,
  CandidateParamUnavailabilityReason,
  ChoicePendingRequest,
  GameDef,
  GameState,
  LookupUnavailabilityReason,
  MoveParamValue,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  selectChoiceOptionsByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
} from '../kernel/choice-option-policy.js';
import {
  PolicyEvaluationContext,
  type PolicyCandidateParamFallbackFired,
  type PolicyLookupFallbackFired,
  type PolicyPreviewFallbackFired,
  type PolicyScheduleFallbackFired,
  type PolicyScheduleInputRefTrace,
} from './policy-evaluation-core.js';
import type { SelectorEvalMicroturnOption } from './policy-selector-eval.js';
import type { PolicyPreviewUnavailabilityReason } from './policy-preview.js';
import type { PreviewOptionRefStatus } from './policy-preview-inner.js';
import type { PreviewOptionProjectedState } from './policy-runtime.js';

const EMPTY_TRUSTED_MOVE_INDEX: ReadonlyMap<string, TrustedExecutableMove> = new Map();

export interface CompletionScoreContribution {
  readonly termId: string;
  readonly contribution: number;
}

export interface CompletionOptionScore {
  readonly score: number;
  readonly scoreContributions: readonly CompletionScoreContribution[];
  readonly unknownPreviewRefs: ReadonlyMap<string, PolicyPreviewUnavailabilityReason>;
  readonly unknownLookupRefs: ReadonlyMap<string, LookupUnavailabilityReason>;
  readonly unknownCandidateParamRefs: ReadonlyMap<string, CandidateParamUnavailabilityReason>;
  readonly previewFallbackFired?: PolicyPreviewFallbackFired;
  readonly lookupFallbackFired?: PolicyLookupFallbackFired;
  readonly scheduleFallbackFired?: PolicyScheduleFallbackFired;
  readonly inputRefs?: Readonly<Record<string, PolicyScheduleInputRefTrace>>;
  readonly candidateParamFallbackFired?: PolicyCandidateParamFallbackFired;
}

export function scoreMicroturnOption(
  state: GameState,
  def: GameDef,
  catalog: AgentPolicyCatalog,
  playerId: PlayerId,
  seatId: string,
  parameterValues: Readonly<Record<string, AgentParameterValue>>,
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
  optionIndex: number,
  considerationIds: readonly string[],
  runtime?: GameDefRuntime,
  previewOptionResolvedRefs?: ReadonlyMap<string, PreviewOptionRefStatus>,
  previewOptionProjectedState?: PreviewOptionProjectedState,
): number {
  return scoreMicroturnOptionWithContributions(
    state,
    def,
    catalog,
    playerId,
    seatId,
    parameterValues,
    request,
    optionValue,
    optionIndex,
    considerationIds,
    runtime,
    previewOptionResolvedRefs,
    previewOptionProjectedState,
  ).score;
}

export function scoreMicroturnOptionWithContributions(
  state: GameState,
  def: GameDef,
  catalog: AgentPolicyCatalog,
  playerId: PlayerId,
  seatId: string,
  parameterValues: Readonly<Record<string, AgentParameterValue>>,
  request: ChoicePendingRequest,
  optionValue: MoveParamValue,
  optionIndex: number,
  considerationIds: readonly string[],
  runtime?: GameDefRuntime,
  previewOptionResolvedRefs?: ReadonlyMap<string, PreviewOptionRefStatus>,
  previewOptionProjectedState?: PreviewOptionProjectedState,
): CompletionOptionScore {
  if (considerationIds.length === 0) {
    return {
      score: 0,
      scoreContributions: [],
      unknownPreviewRefs: new Map(),
      unknownLookupRefs: new Map(),
      unknownCandidateParamRefs: new Map(),
    };
  }
  const considerations = catalog.compiled.considerations;
  const scoreContributions: CompletionScoreContribution[] = [];
  const unknownPreviewRefs = new Map<string, PolicyPreviewUnavailabilityReason>();
  const unknownLookupRefs = new Map<string, LookupUnavailabilityReason>();
  const unknownCandidateParamRefs = new Map<string, CandidateParamUnavailabilityReason>();
  const previewFallbackFired: { current?: PolicyPreviewFallbackFired } = {};
  const lookupFallbackFired: { current?: PolicyLookupFallbackFired } = {};
  const scheduleFallbackFired: { current?: PolicyScheduleFallbackFired } = {};
  const scheduleInputRefs: { current?: Map<string, PolicyScheduleInputRefTrace> } = {};
  const candidateParamFallbackFired: { current?: Map<string, number> } = {};

  const evaluation = new PolicyEvaluationContext({
    def,
    state,
    playerId,
    seatId,
    catalog,
    parameterValues,
    trustedMoveIndex: EMPTY_TRUSTED_MOVE_INDEX,
    completion: {
      request,
      optionValue,
      optionIndex,
    },
    ...(previewOptionResolvedRefs === undefined
      ? previewOptionProjectedState === undefined
        ? {}
        : { previewOption: { resolvedRefs: new Map(), unknownPreviewRefs, previewFallbackFired, projectedState: previewOptionProjectedState } }
      : { previewOption: { resolvedRefs: previewOptionResolvedRefs, unknownPreviewRefs, previewFallbackFired, ...(previewOptionProjectedState === undefined ? {} : { projectedState: previewOptionProjectedState }) } }),
    lookupOption: { unknownLookupRefs, lookupFallbackFired },
    scheduleOption: { scheduleFallbackFired, scheduleInputRefs },
    candidateParamOption: { unknownCandidateParamRefs, candidateParamFallbackFired },
    selectorMicroturnOptions: selectorOptionsForRequest(request),
    ...(runtime === undefined ? {} : { runtime }),
  }, []);

  try {
    const score = considerationIds.reduce(
      (total, considerationId) => (
        total + evaluation.evaluateConsideration(
          considerations,
          considerationId,
          undefined,
          (contribution) => {
            scoreContributions.push({ termId: considerationId, contribution });
          },
        )
      ),
      0,
    );
    return {
      score,
      scoreContributions,
      unknownPreviewRefs,
      unknownLookupRefs: sortUnknownLookupRefs(unknownLookupRefs),
      unknownCandidateParamRefs: sortUnknownCandidateParamRefs(unknownCandidateParamRefs),
      ...(previewFallbackFired.current === undefined ? {} : { previewFallbackFired: previewFallbackFired.current }),
      ...(lookupFallbackFired.current === undefined ? {} : { lookupFallbackFired: lookupFallbackFired.current }),
      ...(scheduleFallbackFired.current === undefined ? {} : { scheduleFallbackFired: scheduleFallbackFired.current }),
      ...(scheduleInputRefs.current === undefined ? {} : { inputRefs: serializeScheduleInputRefs(scheduleInputRefs.current) }),
      ...(candidateParamFallbackFired.current === undefined ? {} : { candidateParamFallbackFired: sortCandidateParamFallbackFired(candidateParamFallbackFired.current) }),
    };
  } finally {
    evaluation.dispose();
  }
}

function selectorOptionsForRequest(request: ChoicePendingRequest): readonly SelectorEvalMicroturnOption[] {
  if (request.type === 'chooseN') {
    const selectableOptions = selectChoiceOptionsByLegalityPrecedence(request);
    return selectUniqueChoiceOptionValuesByLegalityPrecedence(request).map((value) => ({
      key: JSON.stringify(value),
      value,
      index: selectableOptions.findIndex((option) => Object.is(option.value, value)),
    }));
  }
  return selectChoiceOptionsByLegalityPrecedence(request).map((option, index) => ({
    key: JSON.stringify(option.value),
    value: option.value,
    index,
  }));
}

function serializeScheduleInputRefs(
  inputRefs: ReadonlyMap<string, PolicyScheduleInputRefTrace>,
): Readonly<Record<string, PolicyScheduleInputRefTrace>> {
  return Object.fromEntries([...inputRefs.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sortUnknownLookupRefs(
  unknownLookupRefs: ReadonlyMap<string, LookupUnavailabilityReason>,
): ReadonlyMap<string, LookupUnavailabilityReason> {
  return new Map([...unknownLookupRefs.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sortUnknownCandidateParamRefs(
  unknownCandidateParamRefs: ReadonlyMap<string, CandidateParamUnavailabilityReason>,
): ReadonlyMap<string, CandidateParamUnavailabilityReason> {
  return new Map([...unknownCandidateParamRefs.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function sortCandidateParamFallbackFired(
  candidateParamFallbackFired: ReadonlyMap<string, number>,
): PolicyCandidateParamFallbackFired {
  return new Map([...candidateParamFallbackFired.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
