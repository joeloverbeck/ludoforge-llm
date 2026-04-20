import { enumerateLegalMoves } from '../kernel/legal-moves.js';
import { toMoveIdentityKey } from '../kernel/move-identity.js';
import type { Decision, MicroturnState } from '../kernel/microturn/types.js';
import type { GameDefRuntime } from '../kernel/gamedef-runtime.js';
import { asPlayerId } from '../kernel/branded.js';
import type { Agent, AgentDecisionTrace, ClassifiedMove, GameState, Rng } from '../kernel/types.js';
import type { ValidatedGameDef } from '../kernel/validate-gamedef.js';

const scalarKey = (value: string | number | boolean): string => JSON.stringify([typeof value, value]);

const toDecisionMove = (move: ClassifiedMove['move']): ClassifiedMove['move'] => {
  const maybeTrusted = move as ClassifiedMove['move'] & { readonly move?: ClassifiedMove['move'] };
  return maybeTrusted.move ?? move;
};

type ChooseNStepMicroturn = MicroturnState & {
  readonly kind: 'chooseNStep';
  readonly decisionContext: Extract<MicroturnState['decisionContext'], { readonly kind: 'chooseNStep' }>;
};

const isChooseNStepMicroturn = (microturn: MicroturnState): microturn is ChooseNStepMicroturn =>
  microturn.kind === 'chooseNStep';

type ChooseOneMicroturn = MicroturnState & {
  readonly kind: 'chooseOne';
  readonly decisionContext: Extract<MicroturnState['decisionContext'], { readonly kind: 'chooseOne' }>;
};

const isChooseOneMicroturn = (microturn: MicroturnState): microturn is ChooseOneMicroturn =>
  microturn.kind === 'chooseOne';

const resolvePlayerIndexForSeat = (
  def: ValidatedGameDef,
  seatId: string,
): number => {
  const explicitIndex = (def.seats ?? []).findIndex((seat) => seat.id === seatId);
  if (explicitIndex >= 0) {
    return explicitIndex;
  }

  const parsed = Number(seatId);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
};

const deriveChooseNStepDecision = (
  microturn: ChooseNStepMicroturn,
  move: ClassifiedMove['move'],
): Extract<Decision, { readonly kind: 'chooseNStep' }> | null => {
  const target = move.params[microturn.decisionContext.decisionKey];
  if (!Array.isArray(target)) {
    return null;
  }
  const selectedSoFar = microturn.decisionContext.selectedSoFar;
  const selectedKeys = new Set(selectedSoFar.map((value) => scalarKey(value)));
  const targetScalars = target.filter(
    (value): value is string | number | boolean =>
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
  );
  const targetKeys = new Set(targetScalars.map((value) => scalarKey(value)));

  const addition = microturn.decisionContext.options
    .map((option) => option.value)
    .find(
      (value): value is string | number | boolean =>
        (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        && targetKeys.has(scalarKey(value))
        && !selectedKeys.has(scalarKey(value)),
    );
  if (addition !== undefined) {
    return {
      kind: 'chooseNStep',
      decisionKey: microturn.decisionContext.decisionKey,
      command: 'add',
      value: addition,
    };
  }

  const removal = selectedSoFar.find((value) => !targetKeys.has(scalarKey(value)));
  if (removal !== undefined) {
    return {
      kind: 'chooseNStep',
      decisionKey: microturn.decisionContext.decisionKey,
      command: 'remove',
      value: removal,
    };
  }

  return {
    kind: 'chooseNStep',
    decisionKey: microturn.decisionContext.decisionKey,
    command: 'confirm',
  };
};

const deriveDecisionForMove = (
  def: ValidatedGameDef,
  microturn: MicroturnState,
  move: ClassifiedMove['move'],
): Decision | null => {
  const resolvedMove = toDecisionMove(move);
  if (microturn.kind === 'actionSelection') {
    const key = toMoveIdentityKey(def, resolvedMove);
    const exact = microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> =>
        decision.kind === 'actionSelection'
        && decision.move !== undefined
        && toMoveIdentityKey(def, decision.move) === key,
    );
    if (exact !== undefined) {
      return exact;
    }

    const template = microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'actionSelection' }> =>
        decision.kind === 'actionSelection'
        && decision.actionId === resolvedMove.actionId
        && decision.move?.freeOperation === resolvedMove.freeOperation
        && decision.move?.actionClass === resolvedMove.actionClass,
    );
    return template === undefined ? null : { ...template, move: resolvedMove };
  }

  if (isChooseOneMicroturn(microturn)) {
    const value = resolvedMove.params[microturn.decisionContext.decisionKey];
    return microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'chooseOne' }> =>
        decision.kind === 'chooseOne' && decision.value === value,
    ) ?? null;
  }

  if (isChooseNStepMicroturn(microturn)) {
    const nextDecision = deriveChooseNStepDecision(microturn, resolvedMove);
    if (nextDecision === null) {
      return null;
    }
    return microturn.legalActions.find(
      (decision): decision is Extract<Decision, { readonly kind: 'chooseNStep' }> =>
        decision.kind === 'chooseNStep'
        && decision.command === nextDecision.command
        && decision.decisionKey === nextDecision.decisionKey
        && decision.value === nextDecision.value,
    ) ?? null;
  }

  return null;
};

export const adaptLegacyAgentChooseMove = (
  agent: Agent,
  input: {
    readonly def: ValidatedGameDef;
    readonly state: GameState;
    readonly microturn: MicroturnState;
    readonly rng: Rng;
    readonly runtime?: GameDefRuntime;
  },
): { readonly decision: Decision; readonly rng: Rng; readonly agentDecision?: AgentDecisionTrace } => {
  // DELETES IN TICKET 007
  if (input.microturn.seatId === '__chance' || input.microturn.seatId === '__kernel') {
    throw new Error(`adaptLegacyAgentChooseMove cannot target non-player seat ${input.microturn.seatId}`);
  }

  const enumerated = enumerateLegalMoves(input.def, input.state, undefined, input.runtime);
  const candidates = enumerated.moves
    .map((classifiedMove) => ({
      classifiedMove,
      decision: deriveDecisionForMove(input.def, input.microturn, classifiedMove.move),
    }))
    .filter(
      (entry): entry is { readonly classifiedMove: ClassifiedMove; readonly decision: Decision } =>
        entry.decision !== null,
    );

  if (candidates.length === 0) {
    throw new Error(`MICROTURN_LEGACY_AGENT_ADAPTER_EMPTY_FRONTIER:${input.microturn.kind}`);
  }

  const playerId = resolvePlayerIndexForSeat(input.def, input.microturn.seatId);
  if (playerId < 0) {
    throw new Error(`MICROTURN_LEGACY_AGENT_ADAPTER_UNKNOWN_SEAT:${input.microturn.seatId}`);
  }

  const selected = agent.chooseMove({
    def: input.def,
    state: input.state,
    playerId: asPlayerId(playerId),
    legalMoves: candidates.map((entry) => entry.classifiedMove),
    ...(enumerated.certificateIndex === undefined ? {} : { certificateIndex: enumerated.certificateIndex }),
    rng: input.rng,
    ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
  });

  const selectedDecision = deriveDecisionForMove(input.def, input.microturn, selected.move);
  if (selectedDecision === null) {
    throw new Error(`MICROTURN_LEGACY_AGENT_ADAPTER_SELECTED_OUT_OF_FRONTIER:${selected.move.actionId}`);
  }

  return {
    decision: selectedDecision,
    rng: selected.rng,
    ...(selected.agentDecision === undefined ? {} : { agentDecision: selected.agentDecision }),
  };
};
