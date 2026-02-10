import { applyMove, createRng, initialState, legalMoves, terminalResult } from '../kernel/index.js';
import type { Agent, GameDef, GameTrace, MoveLog, Rng, SimulationStopReason, TerminalResult } from '../kernel/index.js';
import { computeDeltas } from './delta.js';

const AGENT_RNG_MIX = 0x9e3779b97f4a7c15n;

const validateSeed = (seed: number): void => {
  if (!Number.isSafeInteger(seed)) {
    throw new RangeError(`seed must be a safe integer, received ${String(seed)}`);
  }
};

const validateMaxTurns = (maxTurns: number): void => {
  if (!Number.isSafeInteger(maxTurns)) {
    throw new RangeError(`maxTurns must be a safe integer, received ${String(maxTurns)}`);
  }
  if (maxTurns < 0) {
    throw new RangeError(`maxTurns must be a non-negative safe integer, received ${String(maxTurns)}`);
  }
};

const createAgentRngByPlayer = (seed: number, playerCount: number): readonly Rng[] =>
  Array.from(
    { length: playerCount },
    (_, playerIndex) => createRng(BigInt(seed) ^ (BigInt(playerIndex + 1) * AGENT_RNG_MIX)),
  );

export const runGame = (
  def: GameDef,
  seed: number,
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
): GameTrace => {
  validateSeed(seed);
  validateMaxTurns(maxTurns);

  let state = initialState(def, seed, playerCount);
  if (agents.length !== state.playerCount) {
    throw new RangeError(
      `agents length must equal resolved player count ${state.playerCount}, received ${agents.length}`,
    );
  }

  const moveLogs: MoveLog[] = [];
  const agentRngByPlayer = [...createAgentRngByPlayer(seed, state.playerCount)];
  let result: TerminalResult | null = null;
  let stopReason: SimulationStopReason = 'maxTurns';

  while (true) {
    const terminal = terminalResult(def, state);
    if (terminal !== null) {
      result = terminal;
      stopReason = 'terminal';
      break;
    }

    if (moveLogs.length >= maxTurns) {
      stopReason = 'maxTurns';
      break;
    }

    const legal = legalMoves(def, state);
    if (legal.length === 0) {
      stopReason = 'noLegalMoves';
      break;
    }

    const player = state.activePlayer;
    const agent = agents[player];
    const agentRng = agentRngByPlayer[player];
    if (agent === undefined || agentRng === undefined) {
      throw new Error(`missing agent or agent RNG for player ${String(player)}`);
    }

    const selected = agent.chooseMove({
      def,
      state,
      playerId: player,
      legalMoves: legal,
      rng: agentRng,
    });
    agentRngByPlayer[player] = selected.rng;

    const preState = state;
    const applied = applyMove(def, state, selected.move);
    state = applied.state;

    moveLogs.push({
      stateHash: state.stateHash,
      player,
      move: selected.move,
      legalMoveCount: legal.length,
      deltas: computeDeltas(preState, state),
      triggerFirings: applied.triggerFirings,
    });
  }

  return {
    gameDefId: def.metadata.id,
    seed,
    moves: moveLogs,
    finalState: state,
    result,
    turnsCount: state.turnCount,
    stopReason,
  };
};

export const runGames = (
  def: GameDef,
  seeds: readonly number[],
  agents: readonly Agent[],
  maxTurns: number,
  playerCount?: number,
): readonly GameTrace[] => seeds.map((seed) => runGame(def, seed, agents, maxTurns, playerCount));
