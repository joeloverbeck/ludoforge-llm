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
import { PolicyEvaluationContext, type PolicyLookupFallbackFired, type PolicyPreviewFallbackFired } from './policy-evaluation-core.js';
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
  const previewFallbackFired: { current?: PolicyPreviewFallbackFired } = {};
  const lookupFallbackFired: { current?: PolicyLookupFallbackFired } = {};

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
      unknownCandidateParamRefs: new Map(),
      ...(previewFallbackFired.current === undefined ? {} : { previewFallbackFired: previewFallbackFired.current }),
      ...(lookupFallbackFired.current === undefined ? {} : { lookupFallbackFired: lookupFallbackFired.current }),
    };
  } finally {
    evaluation.dispose();
  }
}

function sortUnknownLookupRefs(
  unknownLookupRefs: ReadonlyMap<string, LookupUnavailabilityReason>,
): ReadonlyMap<string, LookupUnavailabilityReason> {
  return new Map([...unknownLookupRefs.entries()].sort(([left], [right]) => left.localeCompare(right)));
}
