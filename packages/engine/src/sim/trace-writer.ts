import { writeFileSync } from 'node:fs';
import { serializeGameState } from '../kernel/serde.js';
import type { EnrichedGameTrace } from './enriched-trace-types.js';

/**
 * Write an enriched trace to a JSON file.
 * Serializes bigint state hashes to hex strings for JSON compatibility.
 */
export const writeEnrichedTrace = (trace: EnrichedGameTrace, outputPath: string): void => {
  const serializable = {
    ...trace,
    moves: trace.moves.map((move) => ({
      ...move,
      stateHash: `0x${move.stateHash.toString(16)}`,
    })),
    finalState: serializeGameState(trace.finalState),
  };

  writeFileSync(outputPath, JSON.stringify(serializable, null, 2), 'utf-8');
};
