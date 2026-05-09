import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentParameterValue,
  AgentPolicyCatalog,
  ChoicePendingRequest,
  GameDef,
  GameState,
  MoveParamValue,
  TrustedExecutableMove,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { PolicyEvaluationContext } from './policy-evaluation-core.js';
import type { PolicyPreviewUnavailabilityReason } from './policy-preview.js';
import type { PreviewOptionRefStatus } from './policy-preview-inner.js';

const EMPTY_TRUSTED_MOVE_INDEX: ReadonlyMap<string, TrustedExecutableMove> = new Map();

export interface CompletionScoreContribution {
  readonly termId: string;
  readonly contribution: number;
}

export interface CompletionOptionScore {
  readonly score: number;
  readonly scoreContributions: readonly CompletionScoreContribution[];
  readonly unknownPreviewRefs: ReadonlyMap<string, PolicyPreviewUnavailabilityReason>;
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
): CompletionOptionScore {
  if (considerationIds.length === 0) {
    return { score: 0, scoreContributions: [], unknownPreviewRefs: new Map() };
  }
  const considerations = catalog.compiled.considerations;
  const scoreContributions: CompletionScoreContribution[] = [];
  const unknownPreviewRefs = new Map<string, PolicyPreviewUnavailabilityReason>();

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
      ? {}
      : { previewOption: { resolvedRefs: previewOptionResolvedRefs, unknownPreviewRefs } }),
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
    return { score, scoreContributions, unknownPreviewRefs };
  } finally {
    evaluation.dispose();
  }
}
