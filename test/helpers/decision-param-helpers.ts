import {
  applyMove,
  resolveMoveDecisionSequence,
  type ApplyMoveResult,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamScalar,
  type MoveParamValue,
} from '../../src/kernel/index.js';

const MAX_DECISION_STEPS = 256;

export interface DecisionOverrideRule {
  readonly match: string | RegExp;
  readonly target?: 'decisionId' | 'name' | 'either';
  readonly value: MoveParamValue | ((request: ChoicePendingRequest) => MoveParamValue | undefined);
}

export interface ResolveDecisionParamsOptions {
  readonly overrides?: readonly DecisionOverrideRule[];
  readonly maxDecisionProbeSteps?: number;
}

const matchesRule = (rule: DecisionOverrideRule, request: ChoicePendingRequest): boolean => {
  const target = rule.target ?? 'either';
  const matchText = (value: string): boolean =>
    typeof rule.match === 'string' ? value.includes(rule.match) : rule.match.test(value);

  if (target === 'decisionId') {
    return matchText(request.decisionId);
  }
  if (target === 'name') {
    return matchText(request.name);
  }
  return matchText(request.decisionId) || matchText(request.name);
};

const deterministicDefault = (request: ChoicePendingRequest): MoveParamValue => {
  if (request.type === 'chooseOne') {
    return (request.options?.[0] ?? null) as MoveParamScalar;
  }
  const min = request.min ?? 0;
  const options = request.options ?? [];
  return options.slice(0, min) as MoveParamScalar[];
};

const resolveDecisionValue = (
  request: ChoicePendingRequest,
  move: Move,
  options?: ResolveDecisionParamsOptions,
): MoveParamValue | undefined => {
  if (Object.prototype.hasOwnProperty.call(move.params, request.decisionId)) {
    return move.params[request.decisionId];
  }

  if (Object.prototype.hasOwnProperty.call(move.params, request.name)) {
    return move.params[request.name];
  }

  for (const rule of options?.overrides ?? []) {
    if (!matchesRule(rule, request)) {
      continue;
    }
    const overridden = typeof rule.value === 'function' ? rule.value(request) : rule.value;
    if (overridden !== undefined) {
      return overridden;
    }
  }

  return deterministicDefault(request);
};

export const normalizeDecisionParamsForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ResolveDecisionParamsOptions,
): Move => {
  try {
    const result = resolveMoveDecisionSequence(def, state, move, {
      budgets: {
        maxDecisionProbeSteps: options?.maxDecisionProbeSteps ?? MAX_DECISION_STEPS,
      },
      choose: (request) => resolveDecisionValue(request, move, options),
    });
    return result.complete ? result.move : move;
  } catch {
    // Preserve input move when scripted params are invalid; applyMove should surface the canonical illegal-move error.
    return move;
  }
};

export const applyMoveWithResolvedDecisionIds = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ResolveDecisionParamsOptions,
): ApplyMoveResult => {
  const normalized = normalizeDecisionParamsForMove(def, state, move, options);
  const withCompound = normalized.compound === undefined
    ? normalized
    : {
      ...normalized,
      compound: {
        ...normalized.compound,
        specialActivity: normalizeDecisionParamsForMove(def, state, normalized.compound.specialActivity, options),
      },
    };
  return applyMove(def, state, withCompound);
};
