import {
  computeAllVictoryStandings,
  type GameDef,
  type GameState,
} from '@ludoforge/engine/runtime';

import type { RunnerVictoryStandingEntry } from './runner-frame.js';

/**
 * Derive victory standing entries from the current game state.
 * Returns `null` when the GameDef does not define victory standings.
 */
export function deriveVictoryStandings(
  def: GameDef,
  state: GameState,
): readonly RunnerVictoryStandingEntry[] | null {
  const standings = def.victoryStandings;
  if (standings === undefined) {
    return null;
  }

  const results = computeAllVictoryStandings(def, state, standings);

  return results.map((result, index) => ({
    seat: result.seat,
    score: result.score,
    threshold: result.threshold,
    rank: index + 1,
    components: result.components.breakdowns.map((breakdown) => ({
      aggregate: breakdown.aggregate,
      spaces: breakdown.spaces.map((space) => ({
        spaceId: space.spaceId,
        contribution: space.contribution,
        factors: space.factors,
      })),
    })),
  }));
}
