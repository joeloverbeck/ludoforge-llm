import type { PlayerId } from '../kernel/branded.js';
import type {
  AgentPolicyCatalog,
  ChoiceOption,
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
import { scoreMicroturnOptionWithContributions, type CompletionScoreContribution } from './microturn-option-eval.js';

export interface BuildMicroturnChooseCallbackInput {
  readonly state: GameState;
  readonly def: GameDef;
  readonly catalog: AgentPolicyCatalog;
  readonly playerId: PlayerId;
  readonly seatId: string;
  readonly profile: CompiledAgentProfile;
  readonly runtime?: GameDefRuntime;
}

export interface MicroturnChoiceSelection {
  readonly value: MoveParamValue;
  readonly score: number;
  readonly scoreContributionsByOption: ReadonlyMap<string, readonly CompletionScoreContribution[]>;
}

const scoreContributionsKeyForChooseOne = (
  request: ChoicePendingRequest,
  value: MoveParamValue,
): string => `${request.type}:${request.decisionKey}:${JSON.stringify(value)}`;

const scoreContributionsKeyForChooseNStepAdd = (
  request: ChoicePendingRequest,
  value: MoveParamValue,
): string => `chooseNStep:${request.decisionKey}:add:${JSON.stringify(value)}`;

const sumContributions = (contributions: readonly CompletionScoreContribution[]): number =>
  contributions.reduce((total, contribution) => total + contribution.contribution, 0);

const microturnConsiderationIdsForProfile = (
  catalog: AgentPolicyCatalog,
  profile: CompiledAgentProfile,
): readonly string[] => {
  const considerations = catalog.compiled.considerations;
  return (profile.use.considerations ?? []).filter(
    (considerationId) => considerations[considerationId]?.scopes?.includes('microturn') === true,
  );
};

const selectableIndexForValue = (
  selectableOptions: readonly ChoiceOption[],
  value: MoveParamValue,
): number => selectableOptions.findIndex((option) => Object.is(option.value, value));

export function selectBestMicroturnChooseOneValue(
  input: BuildMicroturnChooseCallbackInput,
  request: ChoicePendingRequest,
  options: { readonly requirePositiveScore?: boolean } = {},
): MicroturnChoiceSelection | undefined {
  const microturnConsiderationIds = microturnConsiderationIdsForProfile(input.catalog, input.profile);
  if (microturnConsiderationIds.length === 0) {
    return undefined;
  }

  const selectableOptions = selectChoiceOptionsByLegalityPrecedence(request);
  if (selectableOptions.length <= 1) {
    return undefined;
  }

  let bestSelection: Omit<MicroturnChoiceSelection, 'scoreContributionsByOption'> | undefined;
  const scoreContributionsByOption = new Map<string, readonly CompletionScoreContribution[]>();
  for (const [optionIndex, option] of selectableOptions.entries()) {
    const scored = scoreMicroturnOptionWithContributions(
      input.state,
      input.def,
      input.catalog,
      input.playerId,
      input.seatId,
      input.profile.params,
      request,
      option.value,
      optionIndex,
      microturnConsiderationIds,
      input.runtime,
    );
    scoreContributionsByOption.set(scoreContributionsKeyForChooseOne(request, option.value), scored.scoreContributions);
    const score = scored.score;
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
  return { ...bestSelection, scoreContributionsByOption };
}

export function buildMicroturnChooseCallback(
  input: BuildMicroturnChooseCallbackInput,
): ((request: ChoicePendingRequest) => MicroturnChoiceSelection | undefined) | undefined {
  const { profile } = input;
  const microturnConsiderationIds = microturnConsiderationIdsForProfile(input.catalog, profile);
  if (microturnConsiderationIds.length === 0) {
    return undefined;
  }

  return (request: ChoicePendingRequest): MicroturnChoiceSelection | undefined => {
    if (request.type === 'chooseN') {
      const selectableOptions = selectChoiceOptionsByLegalityPrecedence(request);
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

      const scoreContributionsByOption = new Map<string, readonly CompletionScoreContribution[]>();
      const scoredValues = selectableValues.map((value, index) => ({
        value,
        index,
        scored: scoreMicroturnOptionWithContributions(
          input.state,
          input.def,
          input.catalog,
          input.playerId,
          input.seatId,
          profile.params,
          request,
          value,
          selectableIndexForValue(selectableOptions, value),
          microturnConsiderationIds,
          input.runtime,
        ),
      }));
      for (const entry of scoredValues) {
        scoreContributionsByOption.set(scoreContributionsKeyForChooseNStepAdd(request, entry.value), entry.scored.scoreContributions);
      }
      const rankedValues = [...scoredValues].sort((left, right) => {
        if (right.scored.score !== left.scored.score) {
          return right.scored.score - left.scored.score;
        }
        return left.index - right.index;
      });
      const positiveValues = rankedValues.filter((entry) => entry.scored.score > 0);
      if (positiveValues.length > 0) {
        const selected = positiveValues.slice(0, max).map((entry) => entry.value as MoveParamScalar);
        if (selected.length >= min) {
          let score = 0;
          for (const value of selected) {
            score += sumContributions(scoreContributionsByOption.get(scoreContributionsKeyForChooseNStepAdd(request, value)) ?? []);
          }
          return { value: selected, score, scoreContributionsByOption };
        }
        const supplement = rankedValues
          .filter((entry) => !selected.includes(entry.value as MoveParamScalar))
          .slice(0, min - selected.length)
          .map((entry) => entry.value as MoveParamScalar);
        const value = [...selected, ...supplement];
        let score = 0;
        for (const item of value) {
          score += sumContributions(scoreContributionsByOption.get(scoreContributionsKeyForChooseNStepAdd(request, item)) ?? []);
        }
        return { value, score, scoreContributionsByOption };
      }

      return undefined;
    }

    return selectBestMicroturnChooseOneValue(input, request, { requirePositiveScore: true });
  };
}
