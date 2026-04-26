import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentPolicyCatalog,
  ChoicePendingRequest,
  CompiledAgentProfile,
  GameDef,
  GameState,
  MoveParamScalar,
  MoveParamValue,
} from '../kernel/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import {
  selectChoiceOptionsByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
} from '../kernel/choice-option-policy.js';
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

export interface CompletionChoiceSelection {
  readonly value: MoveParamValue;
  readonly score: number;
}

const completionConsiderationIdsForProfile = (
  catalog: AgentPolicyCatalog,
  profile: CompiledAgentProfile,
): readonly string[] => {
  const considerations = catalog.compiled.considerations;
  return (profile.use.considerations ?? []).filter(
    (considerationId) => considerations[considerationId]?.scopes?.includes('completion') === true,
  );
};

export function selectBestCompletionChooseOneValue(
  input: BuildCompletionChooseCallbackInput,
  request: ChoicePendingRequest,
  options: { readonly requirePositiveScore?: boolean } = {},
): CompletionChoiceSelection | undefined {
  const completionConsiderationIds = completionConsiderationIdsForProfile(input.catalog, input.profile);
  if (completionConsiderationIds.length === 0) {
    return undefined;
  }

  const selectableOptions = selectChoiceOptionsByLegalityPrecedence(request);
  if (selectableOptions.length <= 1) {
    return undefined;
  }

  let bestSelection: CompletionChoiceSelection | undefined;
  for (const option of selectableOptions) {
    const score = scoreCompletionOption(
      input.state,
      input.def,
      input.catalog,
      input.playerId,
      input.seatId,
      input.profile.params,
      request,
      option.value,
      completionConsiderationIds,
      input.runtime,
    );
    if (bestSelection === undefined || score > bestSelection.score) {
      bestSelection = { value: option.value, score };
    }
  }

  if (bestSelection === undefined) {
    return undefined;
  }
  if (options.requirePositiveScore === true && bestSelection.score <= 0) {
    return undefined;
  }
  return bestSelection;
}

export function buildCompletionChooseCallback(
  input: BuildCompletionChooseCallbackInput,
): ((request: ChoicePendingRequest) => MoveParamValue | undefined) | undefined {
  const { profile } = input;
  const completionConsiderationIds = completionConsiderationIdsForProfile(input.catalog, profile);
  if (completionConsiderationIds.length === 0) {
    return undefined;
  }

  return (request: ChoicePendingRequest): MoveParamValue | undefined => {
    if (request.type === 'chooseN') {
      const selectableValues = selectUniqueChoiceOptionValuesByLegalityPrecedence(request);
      const optionCount = selectableValues.length;
      if (optionCount === 0) {
        return undefined;
      }

      const min = request.min ?? 0;
      const declaredMax = request.max ?? optionCount;
      const max = Math.min(declaredMax, optionCount);
      if (optionCount < min || max < min) {
        return undefined;
      }

      const scoredValues = selectableValues.map((value, index) => ({
        value,
        index,
        score: scoreCompletionOption(
          input.state,
          input.def,
          input.catalog,
          input.playerId,
          input.seatId,
          profile.params,
          request,
          value,
          completionConsiderationIds,
          input.runtime,
        ),
      }));
      const rankedValues = [...scoredValues].sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return left.index - right.index;
      });
      const positiveValues = rankedValues.filter((entry) => entry.score > 0);
      if (positiveValues.length > 0) {
        const selected = positiveValues.slice(0, max).map((entry) => entry.value as MoveParamScalar);
        if (selected.length >= min) {
          return selected;
        }
        const supplement = rankedValues
          .filter((entry) => !selected.includes(entry.value as MoveParamScalar))
          .slice(0, min - selected.length)
          .map((entry) => entry.value as MoveParamScalar);
        return [...selected, ...supplement];
      }

      return undefined;
    }

    return selectBestCompletionChooseOneValue(input, request, { requirePositiveScore: true })?.value;
  };
}
