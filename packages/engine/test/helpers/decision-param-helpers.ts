import {
  applyMove,
  pickDeterministicChoiceValue,
  resolveMoveDecisionSequence,
  type ApplyMoveResult,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
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

const deterministicDefault = (request: ChoicePendingRequest): MoveParamValue | undefined => {
  return pickDeterministicChoiceValue(request);
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

const formatResolutionFailure = (move: Move, result: ReturnType<typeof resolveMoveDecisionSequence>): string => {
  if (result.nextDecision !== undefined) {
    const decision = result.nextDecision;
    return `unresolved decisionId=${decision.decisionId} name=${decision.name} type=${decision.type} options=${decision.options.length} min=${decision.min ?? 0}`;
  }
  if (result.illegal !== undefined) {
    return `illegal=${result.illegal.reason}`;
  }
  return 'decision probing did not complete';
};

const normalizeDecisionParamsForMoveInternal = (
  def: GameDef,
  state: GameState,
  move: Move,
  preserveIncomplete: boolean,
  options?: ResolveDecisionParamsOptions,
): Move => {
  const result = resolveMoveDecisionSequence(def, state, move, {
    budgets: {
      maxDecisionProbeSteps: options?.maxDecisionProbeSteps ?? MAX_DECISION_STEPS,
    },
    choose: (request) => resolveDecisionValue(request, move, options),
  });
  if (result.complete) {
    return result.move;
  }
  if (result.illegal !== undefined) {
    // Keep canonical illegal-move behavior for callers that assert applyMove failures.
    return move;
  }
  if (preserveIncomplete) {
    return move;
  }
  throw new Error(
    `Could not normalize decision params for actionId=${String(move.actionId)}: ${formatResolutionFailure(move, result)}`,
  );
};

export const normalizeDecisionParamsForMove = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ResolveDecisionParamsOptions,
): Move => normalizeDecisionParamsForMoveInternal(def, state, move, false, options);

export const applyMoveWithResolvedDecisionIds = (
  def: GameDef,
  state: GameState,
  move: Move,
  options?: ResolveDecisionParamsOptions,
): ApplyMoveResult => {
  const normalized = normalizeDecisionParamsForMoveInternal(def, state, move, false, options);
  const withCompound = normalized.compound === undefined
    ? normalized
    : {
      ...normalized,
      compound: {
        ...normalized.compound,
        // Compound legality/constraint diagnostics belong to applyMove's compound-aware validation path.
        // Preserve unresolved SA decisions here to avoid masking canonical compound errors.
        specialActivity: normalizeDecisionParamsForMoveInternal(def, state, normalized.compound.specialActivity, true, options),
      },
    };
  return applyMove(def, state, withCompound);
};
