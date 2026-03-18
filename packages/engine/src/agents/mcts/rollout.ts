/**
 * Rollout (simulation) policy for MCTS search.
 *
 * Supports two modes:
 * - `epsilonGreedy`: samples candidate moves, evaluates one-step successors,
 *   picks the best with probability `1 - epsilon`, else picks random.
 * - `random`: picks a uniformly random candidate (for benchmarking).
 *
 * The rollout stops at terminal states, when no legal moves exist,
 * or when `maxSimulationDepth` plies have been simulated.
 *
 * `simulateToCutoff` provides a shallow hybrid cutoff variant used by
 * the `hybrid` rollout mode (ticket 63MCTSPERROLLFRESEA-002).
 */

import type { GameDef, GameState, Rng, TerminalResult } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { MutableDiagnosticsAccumulator } from './diagnostics.js';
import { legalMoves } from '../../kernel/legal-moves.js';
import { applyMove } from '../../kernel/apply-move.js';
import { terminalResult } from '../../kernel/terminal.js';
import { evaluateState } from '../evaluate-state.js';
import { materializeMovesForRollout } from './materialization.js';
import { nextInt, fork } from '../../kernel/prng.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { MastStats } from './mast.js';
import { mastSelectMove } from './mast.js';
import type { StateInfoCache } from './state-cache.js';
import { getOrComputeTerminal, getOrComputeLegalMoves } from './state-cache.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SimulationResult {
  readonly state: GameState;
  readonly terminal: TerminalResult | null;
  readonly rng: Rng;
  readonly depth: number;
  readonly traversedMoveKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// Re-export decision boundary from its dedicated module.
// ---------------------------------------------------------------------------

export { resolveDecisionBoundary } from './decision-boundary.js';
export type { DecisionBoundaryResult } from './decision-boundary.js';

// ---------------------------------------------------------------------------
// Rollout config subsets — standalone interfaces matching LeafEvaluator rollout fields
// ---------------------------------------------------------------------------

/** Config subset consumed by the full rollout simulation. */
export interface RolloutConfigSlice {
  readonly rolloutPolicy: 'random' | 'epsilonGreedy' | 'mast';
  readonly rolloutEpsilon: number;
  readonly rolloutCandidateSample: number;
  readonly maxSimulationDepth: number;
  readonly templateCompletionsPerVisit: number;
}

/** Config subset consumed by the hybrid cutoff simulation. */
export interface CutoffConfigSlice {
  readonly rolloutPolicy: 'random' | 'epsilonGreedy' | 'mast';
  readonly rolloutEpsilon: number;
  readonly rolloutCandidateSample: number;
  readonly hybridCutoffDepth: number;
  readonly templateCompletionsPerVisit: number;
  readonly mastWarmUpThreshold: number;
  readonly compressForcedSequences?: boolean;
}

// ---------------------------------------------------------------------------
// rollout (legacy full simulation)
// ---------------------------------------------------------------------------

/**
 * Simulate play from a given state using an epsilon-greedy or random policy.
 *
 * Returns the final state reached, whether it is terminal, the consumed RNG,
 * how many plies were simulated, and the move keys traversed.
 */
export function rollout(
  def: GameDef,
  state: GameState,
  rng: Rng,
  config: RolloutConfigSlice,
  runtime?: GameDefRuntime,
  acc?: MutableDiagnosticsAccumulator,
  stateCache?: StateInfoCache,
  maxCacheEntries?: number,
): SimulationResult {
  let currentState = state;
  let currentRng = rng;
  let depth = 0;
  const traversedMoveKeys: string[] = [];

  while (depth < config.maxSimulationDepth) {
    // 1. Check terminal
    const terminal = stateCache !== undefined && maxCacheEntries !== undefined
      ? getOrComputeTerminal(stateCache, def, currentState, runtime, maxCacheEntries, acc)
      : (() => {
          const tStart = acc !== undefined ? performance.now() : 0;
          const result = terminalResult(def, currentState, runtime);
          if (acc !== undefined) {
            acc.terminalCalls += 1;
            acc.terminalTimeMs += performance.now() - tStart;
          }
          return result;
        })();
    if (terminal !== null) {
      return { state: currentState, terminal, rng: currentRng, depth, traversedMoveKeys };
    }

    // 2. Enumerate legal moves
    const moves = stateCache !== undefined && maxCacheEntries !== undefined
      ? getOrComputeLegalMoves(stateCache, def, currentState, runtime, maxCacheEntries, acc)
      : (() => {
          const tStart = acc !== undefined ? performance.now() : 0;
          const result = legalMoves(def, currentState, undefined, runtime);
          if (acc !== undefined) {
            acc.legalMovesCalls += 1;
            acc.legalMovesTimeMs += performance.now() - tStart;
          }
          return result;
        })();
    if (moves.length === 0) {
      return { state: currentState, terminal: null, rng: currentRng, depth, traversedMoveKeys };
    }

    // Gap 6: Record branching factor at this rollout depth.
    if (acc !== undefined) {
      acc.branchingFactorSamples.push({ depth, count: moves.length });
    }

    // 3. Sample up to rolloutCandidateSample candidates
    const { candidates, rng: postMaterializeRng } = materializeMovesForRollout(
      def,
      currentState,
      moves,
      currentRng,
      config.templateCompletionsPerVisit,
      runtime,
      undefined,
      acc,
    );
    currentRng = postMaterializeRng;
    if (acc !== undefined) {
      acc.materializeCalls += 1;
    }

    if (candidates.length === 0) {
      return { state: currentState, terminal: null, rng: currentRng, depth, traversedMoveKeys };
    }

    // Sub-sample if we have more candidates than rolloutCandidateSample
    let sampled = candidates;
    if (candidates.length > config.rolloutCandidateSample) {
      sampled = sampleCandidates(candidates, config.rolloutCandidateSample, currentRng);
      // Advance RNG deterministically for the sampling
      const [, advancedRng] = fork(currentRng);
      currentRng = advancedRng;
    }

    // 4. Pick a move according to the policy
    const { chosenIndex, rng: postChoiceRng } = pickMove(
      sampled, currentState, def, currentRng, config, runtime, acc,
    );
    currentRng = postChoiceRng;

    // 5. Apply chosen move
    const chosen = sampled[chosenIndex]!;
    try {
      const amStart = acc !== undefined ? performance.now() : 0;
      const applied = applyMove(def, currentState, chosen.move, undefined, runtime);
      if (acc !== undefined) {
        acc.applyMoveCalls += 1;
        acc.applyMoveTimeMs += performance.now() - amStart;
        const tc = applied.triggerFirings.length;
        acc.totalTriggerFirings += tc;
        if (tc > acc.maxTriggerFiringsPerMove) acc.maxTriggerFiringsPerMove = tc;
      }
      currentState = applied.state;
      traversedMoveKeys.push(chosen.moveKey);
    } catch {
      // If the chosen move fails to apply, end the rollout
      return { state: currentState, terminal: null, rng: currentRng, depth, traversedMoveKeys };
    }

    depth += 1;
  }

  // Reached maxSimulationDepth — check terminal one more time
  const finalTerminal = stateCache !== undefined && maxCacheEntries !== undefined
    ? getOrComputeTerminal(stateCache, def, currentState, runtime, maxCacheEntries, acc)
    : (() => {
        const tStart = acc !== undefined ? performance.now() : 0;
        const result = terminalResult(def, currentState, runtime);
        if (acc !== undefined) {
          acc.terminalCalls += 1;
          acc.terminalTimeMs += performance.now() - tStart;
        }
        return result;
      })();
  return { state: currentState, terminal: finalTerminal, rng: currentRng, depth, traversedMoveKeys };
}

// ---------------------------------------------------------------------------
// simulateToCutoff (hybrid shallow simulation)
// ---------------------------------------------------------------------------

/**
 * Simulate play from a given state up to `hybridCutoffDepth` plies.
 *
 * Uses the configured rollout policy for move selection. Stops at terminal
 * states or no-move states. Collects traversed move keys for MAST updates.
 */
export function simulateToCutoff(
  def: GameDef,
  state: GameState,
  rng: Rng,
  config: CutoffConfigSlice,
  runtime?: GameDefRuntime,
  acc?: MutableDiagnosticsAccumulator,
  mastStats?: MastStats,
  stateCache?: StateInfoCache,
  maxCacheEntries?: number,
): SimulationResult {
  let currentState = state;
  let currentRng = rng;
  let depth = 0;
  let totalPlies = 0;
  // Safety cap: forced plies are free but we must bound them to prevent
  // infinite loops in games where every state has exactly one legal move.
  const maxTotalPlies = config.hybridCutoffDepth * 8;
  const traversedMoveKeys: string[] = [];

  while (depth < config.hybridCutoffDepth && totalPlies < maxTotalPlies) {
    // 1. Check terminal
    const terminal = stateCache !== undefined && maxCacheEntries !== undefined
      ? getOrComputeTerminal(stateCache, def, currentState, runtime, maxCacheEntries, acc)
      : (() => {
          const tStart = acc !== undefined ? performance.now() : 0;
          const result = terminalResult(def, currentState, runtime);
          if (acc !== undefined) {
            acc.terminalCalls += 1;
            acc.terminalTimeMs += performance.now() - tStart;
          }
          return result;
        })();
    if (terminal !== null) {
      return { state: currentState, terminal, rng: currentRng, depth, traversedMoveKeys };
    }

    // 2. Enumerate legal moves
    const moves = stateCache !== undefined && maxCacheEntries !== undefined
      ? getOrComputeLegalMoves(stateCache, def, currentState, runtime, maxCacheEntries, acc)
      : (() => {
          const tStart = acc !== undefined ? performance.now() : 0;
          const result = legalMoves(def, currentState, undefined, runtime);
          if (acc !== undefined) {
            acc.legalMovesCalls += 1;
            acc.legalMovesTimeMs += performance.now() - tStart;
          }
          return result;
        })();
    if (moves.length === 0) {
      return { state: currentState, terminal: null, rng: currentRng, depth, traversedMoveKeys };
    }

    // Gap 6: Record branching factor at this cutoff depth.
    if (acc !== undefined) {
      acc.branchingFactorSamples.push({ depth, count: moves.length });
    }

    // 3. Materialize candidates
    const matResult = materializeMovesForRollout(
      def, currentState, moves, currentRng, config.templateCompletionsPerVisit, runtime,
      undefined, acc,
    );
    const { candidates } = matResult;
    currentRng = matResult.rng;
    if (acc !== undefined) {
      acc.materializeCalls += 1;
    }

    if (candidates.length === 0) {
      return { state: currentState, terminal: null, rng: currentRng, depth, traversedMoveKeys };
    }

    // ── Forced-sequence compression (simulation phase) ────────────
    // When exactly one candidate exists, advance without decrementing
    // the cutoff budget — forced moves don't consume simulation depth.
    if (
      config.compressForcedSequences !== false &&
      candidates.length === 1
    ) {
      const forced = candidates[0]!;
      try {
        const amStart = acc !== undefined ? performance.now() : 0;
        const applied = applyMove(def, currentState, forced.move, undefined, runtime);
        if (acc !== undefined) {
          acc.applyMoveCalls += 1;
          acc.applyMoveTimeMs += performance.now() - amStart;
          acc.forcedMovePlies += 1;
          const tc = applied.triggerFirings.length;
          acc.totalTriggerFirings += tc;
          if (tc > acc.maxTriggerFiringsPerMove) acc.maxTriggerFiringsPerMove = tc;
        }
        currentState = applied.state;
        traversedMoveKeys.push(forced.moveKey);
      } catch {
        return { state: currentState, terminal: null, rng: currentRng, depth, traversedMoveKeys };
      }
      // Do NOT increment depth — forced moves don't consume cutoff budget.
      totalPlies += 1;
      continue;
    }

    // 4. Pick move — MAST path avoids expensive per-candidate evaluation.
    let chosenCandidate: { readonly move: import('../../kernel/types.js').Move; readonly moveKey: string };
    let postChoiceRng: Rng;

    if (config.rolloutPolicy === 'mast' && mastStats !== undefined) {
      const actingPlayer = currentState.activePlayer as PlayerId;
      const { candidate: mastChosen, rng: mastRng } = mastSelectMove(
        mastStats,
        candidates,
        actingPlayer as number,
        config.rolloutEpsilon,
        config.mastWarmUpThreshold,
        currentRng,
      );
      chosenCandidate = mastChosen;
      postChoiceRng = mastRng;
    } else {
      // Non-MAST path: sub-sample then pick via policy.
      let sampled = candidates;
      if (candidates.length > config.rolloutCandidateSample) {
        sampled = sampleCandidates(candidates, config.rolloutCandidateSample, currentRng);
        const [, advancedRng] = fork(currentRng);
        currentRng = advancedRng;
      }
      const { chosenIndex, rng: pickRng } = pickMove(
        sampled, currentState, def, currentRng, config, runtime, acc,
      );
      chosenCandidate = sampled[chosenIndex]!;
      postChoiceRng = pickRng;
    }

    currentRng = postChoiceRng;

    // 5. Apply
    try {
      const amStart = acc !== undefined ? performance.now() : 0;
      const applied = applyMove(def, currentState, chosenCandidate.move, undefined, runtime);
      if (acc !== undefined) {
        acc.applyMoveCalls += 1;
        acc.applyMoveTimeMs += performance.now() - amStart;
        acc.hybridRolloutPlies += 1;
        const tc = applied.triggerFirings.length;
        acc.totalTriggerFirings += tc;
        if (tc > acc.maxTriggerFiringsPerMove) acc.maxTriggerFiringsPerMove = tc;
      }
      currentState = applied.state;
      traversedMoveKeys.push(chosenCandidate.moveKey);
    } catch {
      return { state: currentState, terminal: null, rng: currentRng, depth, traversedMoveKeys };
    }

    depth += 1;
    totalPlies += 1;
  }

  // Reached cutoff — check terminal
  const finalTerminal = stateCache !== undefined && maxCacheEntries !== undefined
    ? getOrComputeTerminal(stateCache, def, currentState, runtime, maxCacheEntries, acc)
    : (() => {
        const tStart = acc !== undefined ? performance.now() : 0;
        const result = terminalResult(def, currentState, runtime);
        if (acc !== undefined) {
          acc.terminalCalls += 1;
          acc.terminalTimeMs += performance.now() - tStart;
        }
        return result;
      })();
  return { state: currentState, terminal: finalTerminal, rng: currentRng, depth, traversedMoveKeys };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Policy config subset shared by pickMove. */
interface PolicyConfigSlice {
  readonly rolloutPolicy: 'random' | 'epsilonGreedy' | 'mast';
  readonly rolloutEpsilon: number;
}

/**
 * Pick a move index according to the rollout policy (random or epsilon-greedy).
 * Returns the chosen index and the consumed RNG.
 */
function pickMove(
  sampled: readonly { readonly move: import('../../kernel/types.js').Move; readonly moveKey: string }[],
  currentState: GameState,
  def: GameDef,
  rng: Rng,
  config: PolicyConfigSlice,
  runtime?: GameDefRuntime,
  acc?: MutableDiagnosticsAccumulator,
): { readonly chosenIndex: number; readonly rng: Rng } {
  if (config.rolloutPolicy === 'random' || config.rolloutPolicy === 'mast' || sampled.length === 1) {
    const [idx, rngAfter] = nextInt(rng, 0, sampled.length - 1);
    return { chosenIndex: idx, rng: rngAfter };
  }

  // Epsilon-greedy
  const [epsilonRoll, rngAfterEpsilon] = nextInt(rng, 0, 999);
  let currentRng = rngAfterEpsilon;
  const useRandom = epsilonRoll < Math.round(config.rolloutEpsilon * 1000);

  if (useRandom) {
    const [idx, rngAfterIdx] = nextInt(currentRng, 0, sampled.length - 1);
    return { chosenIndex: idx, rng: rngAfterIdx };
  }

  // Greedy: evaluate each candidate's successor for the acting player
  const actingPlayer = currentState.activePlayer as PlayerId;
  let bestScore = -Infinity;
  let bestIdx = 0;

  for (let i = 0; i < sampled.length; i += 1) {
    const candidate = sampled[i]!;
    try {
      const amStart = acc !== undefined ? performance.now() : 0;
      const applied = applyMove(def, currentState, candidate.move, undefined, runtime);
      if (acc !== undefined) {
        acc.applyMoveCalls += 1;
        acc.applyMoveTimeMs += performance.now() - amStart;
        const tc = applied.triggerFirings.length;
        acc.totalTriggerFirings += tc;
        if (tc > acc.maxTriggerFiringsPerMove) acc.maxTriggerFiringsPerMove = tc;
      }
      const score = evaluateState(def, applied.state, actingPlayer, runtime);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    } catch {
      continue;
    }
  }

  return { chosenIndex: bestIdx, rng: currentRng };
}

/**
 * Deterministically sample `count` candidates from the full list using
 * a Fisher-Yates partial shuffle seeded by the given RNG.
 */
function sampleCandidates<T>(
  candidates: readonly T[],
  count: number,
  rng: Rng,
): readonly T[] {
  const arr = [...candidates];
  let cursor = rng;
  const n = Math.min(count, arr.length);

  for (let i = 0; i < n; i += 1) {
    const [j, nextRng] = nextInt(cursor, i, arr.length - 1);
    cursor = nextRng;
    // Swap
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }

  return arr.slice(0, n);
}
