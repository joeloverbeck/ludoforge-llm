import type { GameDef, GameTrace } from '../kernel/index.js';
import type { EnrichedGameTrace, EnrichedMoveLog } from './enriched-trace-types.js';

/**
 * Pure function that enriches a raw GameTrace with human-readable context:
 * - Maps player indices to seat IDs (e.g., 0 → "VC", 1 → "US")
 * - Preserves all existing trace data unchanged
 */
export const enrichTrace = (trace: GameTrace, def: GameDef): EnrichedGameTrace => {
  const seatNames = (def.seats ?? []).map((seat) => seat.id);

  const resolveSeatId = (playerIndex: number): string =>
    seatNames[playerIndex] ?? `Player ${String(playerIndex)}`;

  const enrichedMoves: EnrichedMoveLog[] = trace.moves.map((moveLog) => ({
    ...moveLog,
    seatId: resolveSeatId(moveLog.player),
  }));

  return {
    gameDefId: trace.gameDefId,
    seed: trace.seed,
    seatNames,
    moves: enrichedMoves,
    finalState: trace.finalState,
    result: trace.result,
    turnsCount: trace.turnsCount,
    stopReason: trace.stopReason,
  };
};
