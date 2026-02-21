import { asPlayerId } from './branded.js';
import { evalCondition } from './eval-condition.js';
import { resolveSinglePlayerSel } from './resolve-selectors.js';
import { evalValue } from './eval-value.js';
import { kernelRuntimeError } from './runtime-error.js';
import type { EvalContext } from './eval-context.js';
import type { AdjacencyGraph } from './spatial.js';
import { buildAdjacencyGraph } from './spatial.js';
import { createCollector } from './execution-collector.js';
import { buildRuntimeTableIndex, type RuntimeTableIndex } from './runtime-table-index.js';
import type { GameDef, GameState, PlayerScore, TerminalResult, VictoryTerminalRankingEntry } from './types.js';

function buildEvalContext(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  state: GameState,
  actorPlayer = state.activePlayer,
): EvalContext {
  return {
    def,
    adjacencyGraph,
    state,
    activePlayer: state.activePlayer,
    actorPlayer,
    bindings: {},
    runtimeTableIndex,
    collector: createCollector(),
  };
}

function scoreRanking(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  state: GameState,
): readonly PlayerScore[] {
  const scoring = def.terminal.scoring;
  if (!scoring) {
    throw kernelRuntimeError(
      'TERMINAL_SCORING_CONFIG_MISSING',
      'End condition result.type "score" requires def.terminal.scoring',
    );
  }

  const ranking = Array.from({ length: state.playerCount }, (_, index) => {
    const player = asPlayerId(index);
    const ctx = buildEvalContext(def, adjacencyGraph, runtimeTableIndex, state, player);
    const score = evalValue(scoring.value, ctx);
    if (typeof score !== 'number') {
      throw kernelRuntimeError(
        'TERMINAL_SCORING_NON_NUMERIC',
        'Scoring value expression must evaluate to a number',
      );
    }

    return { player, score };
  });

  return ranking.sort((left, right) => {
    if (left.score === right.score) {
      return left.player - right.player;
    }

    return scoring.method === 'highest' ? right.score - left.score : left.score - right.score;
  });
}

function resolveSeatPlayer(state: GameState, seat: string): ReturnType<typeof asPlayerId> | null {
  const fromOrder = state.turnOrderState.type === 'cardDriven'
    ? state.turnOrderState.runtime.seatOrder.indexOf(seat)
    : -1;
  if (fromOrder >= 0 && fromOrder < state.playerCount) {
    return asPlayerId(fromOrder);
  }

  const numeric = Number(seat);
  if (Number.isInteger(numeric) && numeric >= 0 && numeric < state.playerCount) {
    return asPlayerId(numeric);
  }

  return null;
}

function finalVictoryRanking(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  state: GameState,
): readonly VictoryTerminalRankingEntry[] {
  const margins = def.terminal.margins ?? [];
  const order = def.terminal.ranking?.order ?? 'desc';
  const tieBreakOrder = def.terminal.ranking?.tieBreakOrder ?? [];
  const tieBreakIndex = new Map(tieBreakOrder.map((seat, index): readonly [string, number] => [seat, index]));
  const rows = margins.map((marginDef) => {
    const margin = evalValue(marginDef.value, buildEvalContext(def, adjacencyGraph, runtimeTableIndex, state));
    if (typeof margin !== 'number') {
      throw kernelRuntimeError(
        'TERMINAL_MARGIN_NON_NUMERIC',
        `Victory margin "${marginDef.seat}" must evaluate to a number`,
        { seat: marginDef.seat },
      );
    }

    return {
      seat: marginDef.seat,
      margin,
      tieBreakKey: marginDef.seat,
    };
  });

  rows.sort((left, right) => {
    if (left.margin !== right.margin) {
      return order === 'desc' ? right.margin - left.margin : left.margin - right.margin;
    }

    const leftOrder = tieBreakIndex.get(left.seat) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = tieBreakIndex.get(right.seat) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return left.tieBreakKey.localeCompare(right.tieBreakKey);
  });

  return rows.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function evaluateVictory(
  def: GameDef,
  adjacencyGraph: AdjacencyGraph,
  runtimeTableIndex: RuntimeTableIndex,
  state: GameState,
): TerminalResult | null {
  const checkpoints = def.terminal.checkpoints;
  if (checkpoints === undefined) {
    return null;
  }

  const baseCtx = buildEvalContext(def, adjacencyGraph, runtimeTableIndex, state);
  const duringCheckpoint = checkpoints.find(
    (checkpoint) => checkpoint.timing === 'duringCoup' && evalCondition(checkpoint.when, baseCtx),
  );
  if (duringCheckpoint !== undefined) {
    const player = resolveSeatPlayer(state, duringCheckpoint.seat);
    if (player === null) {
      throw kernelRuntimeError(
        'TERMINAL_CHECKPOINT_SEAT_UNMAPPED',
        `Victory checkpoint seat "${duringCheckpoint.seat}" cannot be mapped to a player`,
        { seat: duringCheckpoint.seat, checkpointId: duringCheckpoint.id },
      );
    }

    return {
      type: 'win',
      player,
      victory: {
        timing: 'duringCoup',
        checkpointId: duringCheckpoint.id,
        winnerSeat: duringCheckpoint.seat,
      },
    };
  }

  const finalCheckpoint = checkpoints.find(
    (checkpoint) => checkpoint.timing === 'finalCoup' && evalCondition(checkpoint.when, baseCtx),
  );
  if (finalCheckpoint === undefined) {
    return null;
  }

  const ranking = finalVictoryRanking(def, adjacencyGraph, runtimeTableIndex, state);
  const winnerSeat = ranking[0]?.seat ?? finalCheckpoint.seat;
  const player = resolveSeatPlayer(state, winnerSeat);
  if (player === null) {
    throw kernelRuntimeError(
      'TERMINAL_WINNER_SEAT_UNMAPPED',
      `Victory winner seat "${winnerSeat}" cannot be mapped to a player`,
      { winnerSeat, checkpointId: finalCheckpoint.id },
    );
  }

  return {
    type: 'win',
    player,
    victory: {
      timing: 'finalCoup',
      checkpointId: finalCheckpoint.id,
      winnerSeat,
      ...(ranking.length === 0 ? {} : { ranking }),
    },
  };
}

export const terminalResult = (def: GameDef, state: GameState): TerminalResult | null => {
  const adjacencyGraph = buildAdjacencyGraph(def.zones);
  const runtimeTableIndex = buildRuntimeTableIndex(def);
  const baseCtx = buildEvalContext(def, adjacencyGraph, runtimeTableIndex, state);
  const victory = evaluateVictory(def, adjacencyGraph, runtimeTableIndex, state);
  if (victory !== null) {
    return victory;
  }

  for (const endCondition of def.terminal.conditions) {
    if (!evalCondition(endCondition.when, baseCtx)) {
      continue;
    }

    switch (endCondition.result.type) {
      case 'win':
        return { type: 'win', player: resolveSinglePlayerSel(endCondition.result.player, baseCtx) };
      case 'lossAll':
        return { type: 'lossAll' };
      case 'draw':
        return { type: 'draw' };
      case 'score':
        return { type: 'score', ranking: scoreRanking(def, adjacencyGraph, runtimeTableIndex, state) };
      default: {
        const _exhaustive: never = endCondition.result;
        return _exhaustive;
      }
    }
  }

  return null;
};
