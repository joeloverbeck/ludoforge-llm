import type { GameDef, GameTrace } from '../kernel/index.js';
import type { EnrichedDecisionLog, EnrichedGameTrace } from './enriched-trace-types.js';

/**
 * Pure function that enriches a raw GameTrace with human-readable context:
 * - Maps player indices to seat IDs (e.g., 0 → "VC", 1 → "US")
 * - Preserves all existing trace data unchanged
 */
export const enrichTrace = (trace: GameTrace, def: GameDef): EnrichedGameTrace => {
  const seatNames = (def.seats ?? []).map((seat) => seat.id);

  const enrichedDecisions: EnrichedDecisionLog[] = trace.decisions.map((decisionLog) => ({
    ...decisionLog,
  }));

  return {
    gameDefId: trace.gameDefId,
    seed: trace.seed,
    seatNames,
    decisions: enrichedDecisions,
    compoundTurns: trace.compoundTurns,
    finalState: trace.finalState,
    result: trace.result,
    turnsCount: trace.turnsCount,
    stopReason: trace.stopReason,
    traceProtocolVersion: trace.traceProtocolVersion,
  };
};
