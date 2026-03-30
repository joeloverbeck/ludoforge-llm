import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentPolicyCatalog,
  ChoicePendingRequest,
  CompiledAgentProfile,
  GameDef,
  GameState,
  MoveParamValue,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { selectChoiceOptionsByLegalityPrecedence } from '../kernel/choice-option-policy.js';
import { scoreCompletionOption } from './completion-guidance-eval.js';

export interface BuildCompletionChooseCallbackInput {
  readonly state: GameState;
  readonly def: GameDef;
  readonly catalog: AgentPolicyCatalog;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly profile: CompiledAgentProfile;
  readonly runtime?: GameDefRuntime;
}

export function buildCompletionChooseCallback(
  input: BuildCompletionChooseCallbackInput,
): ((request: ChoicePendingRequest) => MoveParamValue | undefined) | undefined {
  const { profile } = input;
  if (profile.completionGuidance?.enabled !== true) {
    return undefined;
  }

  const scoreTermIds = profile.use.completionScoreTerms;
  if (scoreTermIds.length === 0) {
    return undefined;
  }

  return (request: ChoicePendingRequest): MoveParamValue | undefined => {
    const selectableOptions = selectChoiceOptionsByLegalityPrecedence(request);
    if (selectableOptions.length <= 1) {
      return undefined;
    }

    let bestScore = Number.NEGATIVE_INFINITY;
    let bestValue: MoveParamValue | undefined;
    for (const option of selectableOptions) {
      const score = scoreCompletionOption(
        input.state,
        input.def,
        input.catalog,
        input.playerId,
        input.seatId,
        profile.params,
        request,
        option.value,
        scoreTermIds,
        input.runtime,
      );
      if (score > bestScore) {
        bestScore = score;
        bestValue = option.value;
      }
    }

    if (bestScore > 0) {
      return bestValue;
    }
    return profile.completionGuidance?.fallback === 'first'
      ? selectableOptions[0]?.value
      : undefined;
  };
}
