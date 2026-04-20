import {
  selectChoiceOptionValuesByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
} from './choice-option-policy.js';
import type { DecisionKey } from './decision-scope.js';
import { isEffectRuntimeReason } from './effect-error.js';
import { completeMoveDecisionSequence } from './move-decision-completion.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import { resolveStochasticDistribution } from './microturn/apply.js';
import type { MoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { resolveMoveEnumerationBudgets } from './move-enumeration-budgets.js';
import { nextInt } from './prng.js';
import { EFFECT_RUNTIME_REASONS } from './runtime-reasons.js';
import type {
  ChoicePendingRequest,
  ChoiceStochasticPendingRequest,
  GameState,
  Move,
  MoveParamScalar,
  MoveParamValue,
  Rng,
  GameDef,
} from './types.js';

/**
 * Completion outcomes for `completeTemplateMove`; see
 * `specs/16-template-completion-contract.md` for the full contract.
 *
 * - `completed`: the move is fully bound and can be executed through the
 *   normal trusted apply path.
 * - `structurallyUnsatisfiable`: no valid completion exists under the current
 *   state and contract. This outcome is not retryable by callers.
 * - `drawDeadEnd`: the sampled path failed, but another valid path may still
 *   exist under a different RNG state. Carries the advanced RNG consumed by the
 *   failed sampled path so retries stay deterministic.
 * - `stochasticUnresolved`: all pre-stochastic decisions are bound, but
 *   stochastic branches remain unresolved. Carries the partially bound move and
 *   advanced RNG.
 */
export type TemplateCompletionResult =
  | { readonly kind: 'completed'; readonly move: Move; readonly rng: Rng; readonly firstOptionalChooseN?: DrawDeadEndOptionalChooseN | null }
  | { readonly kind: 'structurallyUnsatisfiable' }
  | { readonly kind: 'drawDeadEnd'; readonly rng: Rng; readonly optionalChooseN: DrawDeadEndOptionalChooseN | null }
  | { readonly kind: 'stochasticUnresolved'; readonly move: Move; readonly rng: Rng; readonly firstOptionalChooseN?: DrawDeadEndOptionalChooseN | null };

export interface DrawDeadEndOptionalChooseN {
  readonly decisionKey: DecisionKey;
  readonly sampledCount: number;
  readonly declaredMin: number;
  readonly declaredMax: number;
}

export interface TemplateMoveCompletionOptions {
  readonly budgets?: Partial<MoveEnumerationBudgets>;
  readonly choose?: (request: ChoicePendingRequest) => MoveParamValue | undefined;
  readonly retryBiasNonEmpty?: boolean;
}

interface InternalTemplateMoveCompletionOptions extends TemplateMoveCompletionOptions {
  readonly guidedMandatorySingleChoiceValues?: readonly MoveParamScalar[];
}

const selectFromChooseOne = (
  options: readonly MoveParamValue[],
  rng: Rng,
): { readonly selected: MoveParamValue; readonly rng: Rng } => {
  const [index, nextRng] = nextInt(rng, 0, options.length - 1);
  return { selected: options[index]!, rng: nextRng };
};

const selectFromChooseN = (
  options: readonly MoveParamValue[],
  min: number,
  max: number,
  rng: Rng,
): { readonly selected: MoveParamValue; readonly rng: Rng } => {
  const [count, rng1] = nextInt(rng, min, max);

  // Fisher-Yates partial shuffle to pick `count` items
  const pool = [...options];
  const picked: MoveParamScalar[] = [];
  let cursor: Rng = rng1;
  for (let i = 0; i < count; i += 1) {
    const [idx, nextRng] = nextInt(cursor, i, pool.length - 1);
    cursor = nextRng;
    const temp = pool[idx]!;
    pool[idx] = pool[i]!;
    pool[i] = temp;
    picked.push(temp as MoveParamScalar);
  }
  return { selected: picked, rng: cursor };
};

const collectMandatorySingleChoiceCandidates = (
  request: ChoicePendingRequest,
): readonly MoveParamScalar[] => {
  if (request.type === 'chooseOne') {
    return selectChoiceOptionValuesByLegalityPrecedence(request)
      .filter((value): value is MoveParamScalar => !Array.isArray(value));
  }

  const optionCount = request.options.length;
  const min = request.min ?? 0;
  if (min !== 1) {
    return [];
  }
  const declaredMax = request.max ?? optionCount;
  const max = Math.min(declaredMax, optionCount);
  if (max !== 1) {
    return [];
  }
  return selectUniqueChoiceOptionValuesByLegalityPrecedence(request)
    .filter((value): value is MoveParamScalar => !Array.isArray(value));
};

const discoverFirstUnguidedDecision = (
  def: GameDef,
  state: GameState,
  templateMove: Move,
  runtime: GameDefRuntime | undefined,
  options: InternalTemplateMoveCompletionOptions | undefined,
): ChoicePendingRequest | undefined => {
  const choose = buildGuidedChoiceResolver(options);
  try {
    const sequence = completeMoveDecisionSequence(def, state, templateMove, {
      choose,
      chooseStochastic: () => undefined,
    }, runtime);
    return sequence.nextDecision;
  } catch (error) {
    if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
      return undefined;
    }
    throw error;
  }
};

const buildGuidedChoiceResolver = (
  options: InternalTemplateMoveCompletionOptions | undefined,
): ((request: ChoicePendingRequest) => MoveParamValue | undefined) => {
  let guidedIndex = 0;
  return (request) => {
    const selected = options?.choose?.(request);
    if (selected !== undefined) {
      return selected;
    }
    const guidedValue = options?.guidedMandatorySingleChoiceValues?.[guidedIndex];
    if (guidedValue === undefined) {
      return undefined;
    }
    guidedIndex += 1;
    return request.type === 'chooseOne' ? guidedValue : [guidedValue];
  };
};

const completeWithMandatorySingleChoiceFallback = (
  def: GameDef,
  state: GameState,
  templateMove: Move,
  rng: Rng,
  runtime: GameDefRuntime | undefined,
  options: InternalTemplateMoveCompletionOptions | undefined,
): TemplateCompletionResult | undefined => {
  const request = discoverFirstUnguidedDecision(def, state, templateMove, runtime, options);
  if (request === undefined) {
    return undefined;
  }
  const candidates = collectMandatorySingleChoiceCandidates(request);
  if (candidates.length <= 1) {
    return undefined;
  }

  for (const candidate of candidates) {
    const fallback = completeTemplateMoveInternal(def, state, templateMove, rng, runtime, {
      ...(options?.choose === undefined ? {} : { choose: options.choose }),
      guidedMandatorySingleChoiceValues: [
        ...(options?.guidedMandatorySingleChoiceValues ?? []),
        candidate,
      ],
      ...(options?.budgets === undefined ? {} : { budgets: options.budgets }),
    });
    if (fallback.kind === 'completed' || fallback.kind === 'stochasticUnresolved') {
      return fallback;
    }
  }
  return undefined;
};

/**
 * Complete a template move using the shared engine-agnostic completion
 * contract consumed identically by the simulator, agents, and runner worker.
 * See `TemplateCompletionResult` and
 * `specs/16-template-completion-contract.md` for outcome semantics.
 */
export const completeTemplateMove = (
  def: GameDef,
  state: GameState,
  templateMove: Move,
  rng: Rng,
  runtime?: GameDefRuntime,
  options?: TemplateMoveCompletionOptions,
): TemplateCompletionResult => completeTemplateMoveInternal(def, state, templateMove, rng, runtime, options);

const completeTemplateMoveInternal = (
  def: GameDef,
  state: GameState,
  templateMove: Move,
  rng: Rng,
  runtime?: GameDefRuntime,
  options?: InternalTemplateMoveCompletionOptions,
): TemplateCompletionResult => {
  const resolved = resolveMoveEnumerationBudgets(options?.budgets);
  const maxDecisions = resolved.maxCompletionDecisions;
  const guidedMandatorySingleChoiceValues = options?.guidedMandatorySingleChoiceValues ?? [];
  let guidedMandatorySingleChoiceIndex = 0;
  let cursor = rng;
  let iterations = 0;
  let exceeded = false;
  let lastDecisionSource: 'guided' | 'random' | 'structural' | 'stochastic' | 'stochasticStructural' | undefined;
  let firstOptionalChooseN: DrawDeadEndOptionalChooseN | null = null;

  const chooseAtRandom = (request: ChoicePendingRequest): MoveParamValue | undefined => {
    const candidateOptions = request.type === 'chooseN'
      ? selectUniqueChoiceOptionValuesByLegalityPrecedence(request)
      : selectChoiceOptionValuesByLegalityPrecedence(request);
    const optionCount = candidateOptions.length;
    if (request.type === 'chooseOne') {
      if (optionCount === 0) {
        lastDecisionSource = 'structural';
        return undefined;
      }
      const selection = selectFromChooseOne(candidateOptions, cursor);
      cursor = selection.rng;
      lastDecisionSource = 'random';
      return selection.selected;
    }

    const min = request.min ?? 0;
    if (optionCount === 0) {
      if (min === 0) {
        lastDecisionSource = 'random';
        return [];
      }
      lastDecisionSource = 'structural';
      return undefined;
    }

    const declaredMax = request.max ?? optionCount;
    const max = Math.min(declaredMax, optionCount);
    if (optionCount < min || max < min) {
      lastDecisionSource = 'structural';
      return undefined;
    }

    const effectiveMin = options?.retryBiasNonEmpty === true && min === 0 && max > 0 && optionCount >= 1
      ? 1
      : min;
    const selection = selectFromChooseN(candidateOptions, effectiveMin, max, cursor);
    cursor = selection.rng;
    if (
      firstOptionalChooseN === null
      && min === 0
      && max > 0
      && optionCount >= 1
      && Array.isArray(selection.selected)
    ) {
      firstOptionalChooseN = {
        decisionKey: request.decisionKey,
        sampledCount: selection.selected.length,
        declaredMin: min,
        declaredMax,
      };
    }
    lastDecisionSource = 'random';
    return selection.selected;
  };

  const choose = (request: ChoicePendingRequest): MoveParamValue | undefined => {
    if (++iterations > maxDecisions) {
      exceeded = true;
      return undefined;
    }
    const guidedSelection = options?.choose?.(request);
    if (guidedSelection !== undefined) {
      lastDecisionSource = 'guided';
      return guidedSelection;
    }
    const guidedMandatorySingleChoice = guidedMandatorySingleChoiceValues[guidedMandatorySingleChoiceIndex];
    if (guidedMandatorySingleChoice !== undefined) {
      guidedMandatorySingleChoiceIndex += 1;
      lastDecisionSource = 'guided';
      return request.type === 'chooseOne' ? guidedMandatorySingleChoice : [guidedMandatorySingleChoice];
    }
    return chooseAtRandom(request);
  };

  const chooseStochastic = (
    request: ChoiceStochasticPendingRequest,
  ): Readonly<Record<string, MoveParamScalar>> | undefined => {
    if (++iterations > maxDecisions) {
      exceeded = true;
      return undefined;
    }
    if (request.outcomes.length === 0) {
      lastDecisionSource = 'stochasticStructural';
      return undefined;
    }
    const distribution = {
      outcomes: request.outcomes.map((outcome, index) => ({
        value: index,
        weight: 1,
      })),
    };
    const selection = resolveStochasticDistribution(cursor, distribution);
    cursor = selection.rng;
    lastDecisionSource = 'stochastic';
    return request.outcomes[selection.value as number]?.bindings;
  };

  let result: ReturnType<typeof completeMoveDecisionSequence>;
  try {
    result = completeMoveDecisionSequence(def, state, templateMove, {
      choose,
      chooseStochastic,
    }, runtime);
  } catch (error) {
    if (isEffectRuntimeReason(error, EFFECT_RUNTIME_REASONS.CHOICE_RUNTIME_VALIDATION_FAILED)) {
      if (
        lastDecisionSource === 'random'
        || lastDecisionSource === 'stochastic'
        || lastDecisionSource === 'guided'
      ) {
        if (options?.choose === undefined || (options?.guidedMandatorySingleChoiceValues?.length ?? 0) > 0) {
          const fallback = completeWithMandatorySingleChoiceFallback(
            def,
            state,
            templateMove,
            rng,
            runtime,
            options,
          );
          if (fallback !== undefined) {
            return fallback;
          }
        }
        return { kind: 'drawDeadEnd', rng: cursor, optionalChooseN: firstOptionalChooseN };
      }
      return { kind: 'structurallyUnsatisfiable' };
    }
    throw error;
  }

  if (exceeded) {
    return { kind: 'structurallyUnsatisfiable' };
  }
  if (result.complete) {
    return {
      kind: 'completed',
      move: result.move,
      rng: cursor,
      ...(firstOptionalChooseN === null ? {} : { firstOptionalChooseN }),
    };
  }
  if (result.illegal !== undefined || result.nextDecision !== undefined) {
    if (
      lastDecisionSource === 'random'
      || lastDecisionSource === 'stochastic'
      || lastDecisionSource === 'guided'
    ) {
      if (options?.choose === undefined || (options?.guidedMandatorySingleChoiceValues?.length ?? 0) > 0) {
        const fallback = completeWithMandatorySingleChoiceFallback(
          def,
          state,
          templateMove,
          rng,
          runtime,
          options,
        );
        if (fallback !== undefined) {
          return fallback;
        }
      }
      return { kind: 'drawDeadEnd', rng: cursor, optionalChooseN: firstOptionalChooseN };
    }
    return { kind: 'structurallyUnsatisfiable' };
  }
  if (result.stochasticDecision !== undefined) {
    return {
      kind: 'stochasticUnresolved',
      move: result.move,
      rng: cursor,
      ...(firstOptionalChooseN === null ? {} : { firstOptionalChooseN }),
    };
  }
  return { kind: 'structurallyUnsatisfiable' };
};
