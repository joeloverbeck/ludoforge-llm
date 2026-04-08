import { legalChoicesEvaluateWithTransientChooseNSelections } from './legal-choices.js';
import { kernelRuntimeError } from './runtime-error.js';
import type { DecisionKey } from './decision-scope.js';
import type { GameDefRuntime } from './gamedef-runtime.js';
import type {
  ChoicePendingChooseNRequest,
  GameDef,
  GameState,
  Move,
  MoveParamScalar,
} from './types.js';

export type ChooseNCommand =
  | { type: 'add'; value: MoveParamScalar }
  | { type: 'remove'; value: MoveParamScalar }
  | { type: 'confirm' };

export type AdvanceChooseNResult =
  | { done: false; pending: ChoicePendingChooseNRequest }
  | { done: true; value: readonly MoveParamScalar[] };

const scalarKey = (value: MoveParamScalar): string => JSON.stringify([typeof value, value]);

const findPendingChooseN = (
  def: GameDef,
  state: GameState,
  partialMove: Move,
  decisionKey: DecisionKey,
  currentSelected: readonly MoveParamScalar[],
  runtime?: GameDefRuntime,
): ChoicePendingChooseNRequest => {
  const request = legalChoicesEvaluateWithTransientChooseNSelections(
    def,
    state,
    partialMove,
    { [decisionKey]: currentSelected },
    undefined,
    runtime,
  );

  if (request.kind === 'illegal') {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_VALIDATION_FAILED',
      request.reason === 'choiceValidationFailed'
        ? request.detail ?? `advanceChooseN: current selection is illegal for ${decisionKey}`
        : `advanceChooseN: current selection is illegal for ${decisionKey}`,
      {
        actionId: partialMove.actionId,
        param: String(decisionKey),
        value: {
          currentSelected,
          reason: request.reason,
          ...(request.detail === undefined ? {} : { detail: request.detail }),
        },
      },
    );
  }

  if (request.kind === 'complete') {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_VALIDATION_FAILED',
      `advanceChooseN: decision ${decisionKey} is not pending`,
      {
        actionId: partialMove.actionId,
        param: String(decisionKey),
        value: currentSelected,
      },
    );
  }

  if (request.kind === 'pendingStochastic') {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_VALIDATION_FAILED',
      `advanceChooseN: decision ${decisionKey} resolved to stochastic alternatives instead of a single chooseN request`,
      {
        actionId: partialMove.actionId,
        param: String(decisionKey),
        value: currentSelected,
      },
    );
  }

  if (request.type !== 'chooseN' || request.decisionKey !== decisionKey) {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_VALIDATION_FAILED',
      `advanceChooseN: expected pending chooseN request for ${decisionKey}`,
      {
        actionId: partialMove.actionId,
        param: String(decisionKey),
        value: {
          currentSelected,
          actualDecisionKey: request.decisionKey,
          actualType: request.type,
        },
      },
    );
  }

  return request;
};

const recomputePendingChooseN = (
  def: GameDef,
  state: GameState,
  partialMove: Move,
  decisionKey: DecisionKey,
  nextSelected: readonly MoveParamScalar[],
  runtime?: GameDefRuntime,
): AdvanceChooseNResult => ({
  done: false,
  pending: findPendingChooseN(def, state, partialMove, decisionKey, nextSelected, runtime),
});

export function advanceChooseN(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  decisionKey: DecisionKey,
  currentSelected: readonly MoveParamScalar[],
  command: ChooseNCommand,
  runtime?: GameDefRuntime,
): AdvanceChooseNResult {
  const pending = findPendingChooseN(def, state, partialMove, decisionKey, currentSelected, runtime);
  const selectedKeys = new Set(pending.selected.map((value) => scalarKey(value)));

  if (command.type === 'add') {
    const commandKey = scalarKey(command.value);
    if (selectedKeys.has(commandKey)) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseN: cannot add duplicate selection for ${decisionKey}`,
        {
          actionId: partialMove.actionId,
          param: String(decisionKey),
          value: { attempted: command.value, currentSelected: pending.selected },
        },
      );
    }

    const option = pending.options.find((entry) => scalarKey(entry.value as MoveParamScalar) === commandKey);
    if (option === undefined) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseN: value is outside the current chooseN domain for ${decisionKey}`,
        {
          actionId: partialMove.actionId,
          param: String(decisionKey),
          value: { attempted: command.value, currentSelected: pending.selected },
        },
      );
    }

    if (option.legality !== 'legal') {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseN: value is not currently legal for ${decisionKey}`,
        {
          actionId: partialMove.actionId,
          param: String(decisionKey),
          value: {
            attempted: command.value,
            legality: option.legality,
            illegalReason: option.illegalReason,
            currentSelected: pending.selected,
          },
        },
      );
    }

    return recomputePendingChooseN(
      def,
      state,
      partialMove,
      decisionKey,
      [...pending.selected, command.value],
      runtime,
    );
  }

  if (command.type === 'remove') {
    const commandKey = scalarKey(command.value);
    if (!selectedKeys.has(commandKey)) {
      throw kernelRuntimeError(
        'LEGAL_CHOICES_VALIDATION_FAILED',
        `advanceChooseN: value is not selected for ${decisionKey}`,
        {
          actionId: partialMove.actionId,
          param: String(decisionKey),
          value: { attempted: command.value, currentSelected: pending.selected },
        },
      );
    }

    return recomputePendingChooseN(
      def,
      state,
      partialMove,
      decisionKey,
      pending.selected.filter((value) => scalarKey(value) !== commandKey),
      runtime,
    );
  }

  if (!pending.canConfirm) {
    throw kernelRuntimeError(
      'LEGAL_CHOICES_VALIDATION_FAILED',
      `advanceChooseN: current selection cannot be confirmed for ${decisionKey}`,
      {
        actionId: partialMove.actionId,
        param: String(decisionKey),
        value: {
          currentSelected: pending.selected,
          min: pending.min ?? 0,
          max: pending.max ?? pending.options.length,
        },
      },
    );
  }

  return {
    done: true,
    value: [...pending.selected],
  };
}
