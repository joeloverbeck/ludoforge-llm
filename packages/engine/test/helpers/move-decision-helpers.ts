import {
  pickDeterministicChoiceValue,
  resolveMoveDecisionSequence,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamValue,
} from '../../src/kernel/index.js';

export const pickDeterministicDecisionValue = (request: ChoicePendingRequest): MoveParamValue | undefined => {
  return pickDeterministicChoiceValue(request);
};

export const completeMoveDecisionSequenceOrThrow = (
  baseMove: Move,
  def: GameDef,
  state: GameState,
  choose: (request: ChoicePendingRequest) => MoveParamValue | undefined,
  errorPrefix?: string,
): Move => {
  const result = resolveMoveDecisionSequence(def, state, baseMove, { choose });
  if (result.complete) {
    return result.move;
  }

  const nextDecision = result.nextDecision;
  const min = nextDecision?.min ?? 0;
  const optionsCount = nextDecision?.options.length ?? 0;
  const detail =
    nextDecision === undefined
      ? `illegal=${result.illegal?.reason ?? 'unknown'}`
      : `choice="${nextDecision.name}" options=${optionsCount} min=${min}`;

  throw new Error(`${errorPrefix ?? `Scripted move could not be completed for actionId=${String(baseMove.actionId)}`}: ${detail}`);
};
