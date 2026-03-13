/**
 * Belief sampling for MCTS with hidden information.
 *
 * Produces a plausible game state consistent with the acting player's
 * observation by shuffling hidden tokens within each zone's uncertainty
 * class, and replacing the state RNG so the search does not exploit
 * latent chance outcomes.
 */

import type { GameDef, GameState, Token } from '../../kernel/types-core.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { PlayerObservation } from '../../kernel/observation.js';
import type { Rng } from '../../kernel/types-core.js';
import { fork, nextInt } from '../../kernel/prng.js';

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates shuffle of a mutable array, consuming RNG steps.
 * Returns the updated RNG (array is mutated in place).
 */
const fisherYatesShuffle = (items: Token[], rng: Rng): Rng => {
  let currentRng = rng;
  for (let i = items.length - 1; i > 0; i--) {
    const [j, next] = nextInt(currentRng, 0, i);
    currentRng = next;
    const tmp = items[i]!;
    items[i] = items[j]!;
    items[j] = tmp;
  }
  return currentRng;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BeliefSample {
  readonly state: GameState;
  readonly rng: Rng;
}

/**
 * Sample a belief state consistent with the observer's observation.
 *
 * Conservative default strategy:
 * - Visible tokens stay in exactly the same zone and position.
 * - Hidden tokens are Fisher-Yates shuffled **within** each zone.
 * - Tokens are never redistributed across zones.
 * - Zone token counts and per-zone type distributions are preserved.
 * - The state's RNG is replaced with a freshly forked stream so search
 *   rollouts do not exploit latent chance.
 *
 * @param def       - Game definition (for zone metadata lookup).
 * @param rootState - The true root state to sample from.
 * @param observation - The observer's visibility projection.
 * @param _observer - The observing player (reserved for future use).
 * @param rng       - The search RNG; consumed and returned advanced.
 * @returns A belief sample containing the synthetic state and advanced RNG.
 */
export const sampleBeliefState = (
  def: GameDef,
  rootState: GameState,
  observation: PlayerObservation,
  _observer: PlayerId,
  rng: Rng,
): BeliefSample => {
  // Split: one branch drives shuffles, the other continues the search.
  const [shuffleRng, continuationRng] = fork(rng);

  if (!observation.requiresHiddenSampling) {
    // No hidden tokens — only replace the state RNG.
    const [stateRng] = fork(shuffleRng);
    return {
      state: { ...rootState, rng: stateRng.state, stateHash: 0n },
      rng: continuationRng,
    };
  }

  let currentRng = shuffleRng;
  const newZones: Record<string, readonly Token[]> = {};

  for (const zoneDef of def.zones) {
    const zoneId = zoneDef.id as string;
    const tokens = rootState.zones[zoneId] ?? [];

    const visibleIds = new Set<string>(
      observation.visibleTokenIdsByZone[zoneId] ?? [],
    );

    // Fast path: all tokens visible — keep zone unchanged.
    if (visibleIds.size >= tokens.length) {
      newZones[zoneId] = tokens;
      continue;
    }

    // Collect hidden tokens for shuffling.
    const hiddenTokens: Token[] = [];
    for (const token of tokens) {
      if (!visibleIds.has(token.id as string)) {
        hiddenTokens.push(token);
      }
    }

    // Fast path: nothing to shuffle.
    if (hiddenTokens.length <= 1) {
      newZones[zoneId] = tokens;
      continue;
    }

    // Fisher-Yates shuffle hidden tokens in place.
    currentRng = fisherYatesShuffle(hiddenTokens, currentRng);

    // Reconstruct zone: visible tokens stay in position, hidden slots
    // receive shuffled tokens in order.
    const result: Token[] = new Array(tokens.length);
    let hiddenIdx = 0;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (visibleIds.has(token.id as string)) {
        result[i] = token;
      } else {
        result[i] = hiddenTokens[hiddenIdx++]!;
      }
    }

    newZones[zoneId] = result;
  }

  // Replace state RNG with a freshly forked stream.
  const [stateRng] = fork(currentRng);

  return {
    state: {
      ...rootState,
      zones: newZones,
      rng: stateRng.state,
      stateHash: 0n, // Search-only marker.
    },
    rng: continuationRng,
  };
};
