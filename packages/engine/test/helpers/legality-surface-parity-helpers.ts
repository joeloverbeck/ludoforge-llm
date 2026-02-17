import * as assert from 'node:assert/strict';

import {
  applyMove,
  legalChoices,
  legalMoves,
  type ChoicePendingRequest,
  type GameDef,
  type GameState,
  type Move,
  type MoveParamScalar,
  type MoveParamValue,
} from '../../src/kernel/index.js';

const DEFAULT_MAX_STEPS = 32;

export interface LegalityParityStep {
  readonly step: number;
  readonly actionId: string;
  readonly requestKind: 'pending' | 'complete' | 'illegal';
  readonly decisionId?: string;
  readonly decisionName?: string;
}

export interface LegalitySurfaceParityOptions {
  readonly maxSteps?: number;
  readonly choose?: (request: ChoicePendingRequest, step: number) => MoveParamValue | undefined;
  readonly probeActionPresence?: (context: {
    readonly def: GameDef;
    readonly state: GameState;
    readonly move: Move;
    readonly step: number;
  }) => boolean;
}

const defaultChoose = (request: ChoicePendingRequest): MoveParamValue => {
  const nonIllegalOptions = request.options
    .filter((option) => option.legality !== 'illegal')
    .map((option) => option.value);
  const options = nonIllegalOptions.length > 0
    ? nonIllegalOptions
    : request.options.map((option) => option.value);
  if (request.type === 'chooseOne') {
    return (options[0] ?? null) as MoveParamScalar;
  }

  const min = request.min ?? 0;
  return options.slice(0, min) as MoveParamScalar[];
};

const defaultActionPresenceProbe = ({ def, state, move }: { readonly def: GameDef; readonly state: GameState; readonly move: Move }): boolean =>
  legalMoves(def, state).some((candidate) => String(candidate.actionId) === String(move.actionId));

const parityContext = (surface: 'legalMoves' | 'legalChoices' | 'applyMove', step: number, move: Move, detail: string): string =>
  `Legality surface parity divergence surface=${surface} step=${step} actionId=${String(move.actionId)}: ${detail}`;

const assertIllegalMove = (def: GameDef, state: GameState, move: Move, step: number): void => {
  assert.throws(
    () => applyMove(def, state, move),
    (error: unknown) => {
      if (!(error instanceof Error)) {
        return false;
      }
      const details = error as Error & { code?: unknown };
      if (details.code !== 'ILLEGAL_MOVE') {
        throw new Error(parityContext('applyMove', step, move, `expected ILLEGAL_MOVE code, got ${String(details.code)}`));
      }
      return true;
    },
    parityContext('applyMove', step, move, 'expected illegal move rejection'),
  );
};

export const assertLegalitySurfaceParityForMove = (
  def: GameDef,
  state: GameState,
  baseMove: Move,
  options?: LegalitySurfaceParityOptions,
): readonly LegalityParityStep[] => {
  const maxSteps = options?.maxSteps ?? DEFAULT_MAX_STEPS;
  const choose = options?.choose ?? defaultChoose;
  const probeActionPresence = options?.probeActionPresence ?? defaultActionPresenceProbe;

  let move = baseMove;
  const trace: LegalityParityStep[] = [];

  for (let step = 0; step < maxSteps; step += 1) {
    const request = legalChoices(def, state, move);
    const actionPresent = probeActionPresence({ def, state, move, step });

    if (request.kind === 'illegal') {
      trace.push({ step, actionId: String(move.actionId), requestKind: 'illegal' });
      assert.equal(
        actionPresent,
        false,
        parityContext('legalMoves', step, move, 'action should not appear in legalMoves when legalChoices is illegal'),
      );
      assertIllegalMove(def, state, move, step);
      return trace;
    }

    if (request.kind === 'complete') {
      trace.push({ step, actionId: String(move.actionId), requestKind: 'complete' });
      assert.equal(
        actionPresent,
        true,
        parityContext('legalMoves', step, move, 'action should appear in legalMoves when legalChoices is complete'),
      );
      assert.doesNotThrow(
        () => applyMove(def, state, move),
        parityContext('applyMove', step, move, 'move should apply successfully when legalChoices is complete'),
      );
      return trace;
    }

    trace.push({
      step,
      actionId: String(move.actionId),
      requestKind: 'pending',
      decisionId: request.decisionId,
      decisionName: request.name,
    });

    assert.equal(
      actionPresent,
      true,
      parityContext('legalMoves', step, move, `action should appear in legalMoves while pending decision ${request.decisionId}`),
    );

    const selected = choose(request, step);
    if (selected === undefined) {
      throw new Error(parityContext('legalChoices', step, move, `no value selected for pending decision ${request.decisionId}`));
    }

    move = {
      ...move,
      params: {
        ...move.params,
        [request.decisionId]: selected,
      },
    };
  }

  throw new Error(parityContext('legalChoices', maxSteps, move, `exceeded maxSteps=${maxSteps}`));
};
