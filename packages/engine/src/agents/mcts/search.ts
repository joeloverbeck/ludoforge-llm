/**
 * Core MCTS search loop: backpropagation, one-iteration pipeline, main search
 * loop, and root decision selection.
 *
 * Mutable node statistics are updated in-place during search — same rationale
 * as node.ts.  The input GameState is never mutated.
 */

import type { GameDef, GameState, Move, Rng } from '../../kernel/types.js';
import type { GameDefRuntime } from '../../kernel/gamedef-runtime.js';
import type { PlayerId } from '../../kernel/branded.js';
import type { PlayerObservation } from '../../kernel/observation.js';
import type { MctsNode } from './node.js';
import type { MctsConfig } from './config.js';
import type { NodePool } from './node-pool.js';
import type { MoveKey } from './move-key.js';
import type { MutableDiagnosticsAccumulator, MctsSearchDiagnostics } from './diagnostics.js';
import { legalMoves } from '../../kernel/legal-moves.js';
import { applyMove } from '../../kernel/apply-move.js';
import { terminalResult } from '../../kernel/terminal.js';
import { fork } from '../../kernel/prng.js';
import { selectChild } from './isuct.js';
import { shouldExpand, selectExpansionCandidate } from './expansion.js';
import { materializeConcreteCandidates, filterAvailableCandidates } from './materialization.js';
import { rollout } from './rollout.js';
import { terminalToRewards, evaluateForAllPlayers } from './evaluate.js';
import { sampleBeliefState } from './belief.js';
import { canActivateSolver, updateSolverResult, selectSolverAwareChild } from './solver.js';
import { createAccumulator, collectDiagnostics } from './diagnostics.js';

// ---------------------------------------------------------------------------
// Backpropagation
// ---------------------------------------------------------------------------

/**
 * Walk the parent chain from `node` to the root, incrementing `visits` and
 * accumulating per-player `totalReward` at each ancestor.
 *
 * This mutates nodes in-place for search performance.
 */
export function backpropagate(node: MctsNode, rewards: readonly number[]): void {
  let current: MctsNode | null = node;
  while (current !== null) {
    current.visits += 1;
    for (let p = 0; p < rewards.length; p += 1) {
      current.totalReward[p]! += rewards[p]!;
    }
    current = current.parent;
  }
}

// ---------------------------------------------------------------------------
// One iteration
// ---------------------------------------------------------------------------

/**
 * Execute one MCTS iteration: selection → expansion → simulation →
 * evaluation → backpropagation.
 *
 * @returns The consumed RNG so the caller can continue deterministically.
 */
export function runOneIteration(
  root: MctsNode,
  sampledState: GameState,
  rng: Rng,
  def: GameDef,
  config: MctsConfig,
  rootLegalMoves: readonly Move[],
  runtime: GameDefRuntime,
  pool: NodePool,
  solverActive: boolean = false,
  acc?: MutableDiagnosticsAccumulator,
): { readonly rng: Rng } {
  let currentNode = root;
  let currentState = sampledState;
  let currentRng = rng;
  let selectionDepth = 0;
  let selectionRecorded = false;

  // ── Selection ────────────────────────────────────────────────────────
  const selStart = acc !== undefined ? performance.now() : 0;

  while (true) {
    // Determine legal moves at this node in the sampled state.
    const movesAtNode: readonly Move[] =
      currentNode === root
        ? rootLegalMoves
        : legalMoves(def, currentState, undefined, runtime);

    if (currentNode !== root && acc !== undefined) {
      acc.legalMovesCalls += 1;
    }

    if (movesAtNode.length === 0) {
      // Terminal or no-move position — evaluate and backprop.
      break;
    }

    // Materialize concrete candidates from possibly-template moves.
    const { candidates, rng: postMaterialize } = materializeConcreteCandidates(
      def,
      currentState,
      movesAtNode,
      currentRng,
      config.templateCompletionsPerVisit,
      runtime,
    );
    currentRng = postMaterialize;
    if (acc !== undefined) {
      acc.materializeCalls += 1;
    }

    if (candidates.length === 0) {
      break;
    }

    // Build a lookup of candidate moveKeys for availability matching.
    const candidateKeySet = new Set<string>();
    for (const c of candidates) {
      candidateKeySet.add(c.moveKey);
    }

    // Determine which existing children are available (legal in this world).
    const availableChildren: MctsNode[] = [];
    for (const child of currentNode.children) {
      if (child.moveKey !== null && candidateKeySet.has(child.moveKey)) {
        child.availability += 1;
        availableChildren.push(child);
      }
    }

    // ── Expansion check ──────────────────────────────────────────────
    if (
      shouldExpand(currentNode, config.progressiveWideningK, config.progressiveWideningAlpha) &&
      availableChildren.length < candidates.length
    ) {
      // There are unexpanded candidates — try to expand one.
      const unexpanded = filterAvailableCandidates(currentNode, candidates);

      if (unexpanded.length > 0) {
        if (acc !== undefined) {
          acc.selectionTimeMs += performance.now() - selStart;
          selectionRecorded = true;
        }

        const expStart = acc !== undefined ? performance.now() : 0;

        const actingPlayer = currentState.activePlayer as PlayerId;
        const { candidate: chosen, rng: postExpansion } = selectExpansionCandidate(
          unexpanded,
          def,
          currentState,
          actingPlayer,
          currentRng,
          runtime,
        );
        currentRng = postExpansion;

        // Allocate a child node from the pool.
        const childNode = pool.allocate();
        // Wire the child into the tree — we must set its fields manually
        // because pool.allocate() returns a reset root-style node.
        (childNode as { move: Move | null }).move = chosen.move;
        (childNode as { moveKey: MoveKey | null }).moveKey = chosen.moveKey;
        (childNode as { parent: MctsNode | null }).parent = currentNode;
        childNode.availability = 1;
        currentNode.children.push(childNode);

        // Advance into the expanded child.
        const applied = applyMove(def, currentState, chosen.move, undefined, runtime);
        if (acc !== undefined) {
          acc.applyMoveCalls += 1;
        }
        currentState = applied.state;
        currentNode = childNode;
        selectionDepth += 1;

        if (acc !== undefined) {
          acc.expansionTimeMs += performance.now() - expStart;
        }

        break; // Proceed to simulation from the expanded node.
      }
    }

    // No expansion — select among available children via ISUCT.
    if (availableChildren.length === 0) {
      // No children are available in this sampled world — treat as leaf.
      break;
    }

    const exploringPlayer = currentState.activePlayer as PlayerId;

    // Solver shortcut: if a proven-win child exists, pick it immediately.
    if (solverActive) {
      const solverChild = selectSolverAwareChild(currentNode, exploringPlayer);
      if (solverChild !== null) {
        const applied = applyMove(def, currentState, solverChild.move!, undefined, runtime);
        if (acc !== undefined) {
          acc.applyMoveCalls += 1;
        }
        currentState = applied.state;
        currentNode = solverChild;
        selectionDepth += 1;
        continue;
      }
    }

    const selected = selectChild(
      currentNode,
      exploringPlayer,
      config.explorationConstant,
      availableChildren,
    );

    // Apply the selected child's move to advance the state.
    const applied = applyMove(def, currentState, selected.move!, undefined, runtime);
    if (acc !== undefined) {
      acc.applyMoveCalls += 1;
    }
    currentState = applied.state;
    currentNode = selected;
    selectionDepth += 1;
  }

  // Finalize selection timing for non-expansion break paths.
  if (acc !== undefined && !selectionRecorded) {
    acc.selectionTimeMs += performance.now() - selStart;
  }

  if (acc !== undefined) {
    acc.selectionDepths.push(selectionDepth);
  }

  // ── Simulation (rollout) ─────────────────────────────────────────────
  const simStart = acc !== undefined ? performance.now() : 0;
  const rolloutResult = rollout(def, currentState, currentRng, config, runtime, acc);
  currentRng = rolloutResult.rng;
  if (acc !== undefined) {
    acc.simulationTimeMs += performance.now() - simStart;
  }

  // ── Evaluation ───────────────────────────────────────────────────────
  const evalStart = acc !== undefined ? performance.now() : 0;
  let rewards: readonly number[];
  if (rolloutResult.terminal !== null) {
    rewards = terminalToRewards(rolloutResult.terminal, sampledState.playerCount);
  } else {
    // Check terminal on rollout end state.
    const endTerminal = terminalResult(def, rolloutResult.state, runtime);
    if (acc !== undefined) {
      acc.terminalCalls += 1;
    }
    if (endTerminal !== null) {
      rewards = terminalToRewards(endTerminal, sampledState.playerCount);
    } else {
      rewards = evaluateForAllPlayers(def, rolloutResult.state, config.heuristicTemperature, runtime);
      if (acc !== undefined) {
        acc.evaluateStateCalls += 1;
      }
    }
  }
  if (acc !== undefined) {
    acc.evaluationTimeMs += performance.now() - evalStart;
    // Record leaf reward span.
    const minR = Math.min(...rewards);
    const maxR = Math.max(...rewards);
    acc.leafRewardSpans.push(maxR - minR);
  }

  // ── Backpropagation ──────────────────────────────────────────────────
  const bpStart = acc !== undefined ? performance.now() : 0;
  backpropagate(currentNode, rewards);

  // ── Solver proven-result propagation ───────────────────────────────
  if (solverActive) {
    let solverNode: MctsNode | null = currentNode;
    while (solverNode !== null) {
      updateSolverResult(solverNode, def, currentState, runtime);
      solverNode = solverNode.parent;
    }
  }

  if (acc !== undefined) {
    acc.backpropTimeMs += performance.now() - bpStart;
  }

  return { rng: currentRng };
}

// ---------------------------------------------------------------------------
// Main search loop
// ---------------------------------------------------------------------------

/**
 * Run the full MCTS search: iterate `config.iterations` times (with optional
 * wall-clock early exit), calling `sampleBeliefState` + `runOneIteration`
 * per iteration.
 *
 * @returns The consumed search RNG, iteration count, and optional diagnostics.
 */
export function runSearch(
  root: MctsNode,
  def: GameDef,
  state: GameState,
  observation: PlayerObservation,
  observer: PlayerId,
  config: MctsConfig,
  searchRng: Rng,
  rootLegalMoves: readonly Move[],
  runtime: GameDefRuntime,
  pool: NodePool,
): {
  readonly rng: Rng;
  readonly iterations: number;
  readonly diagnostics?: MctsSearchDiagnostics;
} {
  let currentRng = searchRng;
  let iterations = 0;

  // Diagnostics instrumentation.
  const acc = config.diagnostics === true ? createAccumulator() : undefined;
  const searchStart = config.diagnostics === true ? performance.now() : undefined;

  // Check solver activation once at search start.
  const solverActive = canActivateSolver(def, state, config);

  const deadline =
    config.timeLimitMs !== undefined ? Date.now() + config.timeLimitMs : undefined;

  // Track stop reason for diagnostics.
  let stopReason: 'iterations' | 'solver' | 'time' | 'confidence' | 'none' = 'iterations';

  while (iterations < config.iterations) {
    // If root is proven, break search early.
    if (solverActive && root.provenResult !== null) {
      stopReason = 'solver';
      break;
    }

    // Optional wall-clock early exit (only after minIterations).
    if (
      deadline !== undefined &&
      iterations >= config.minIterations &&
      Date.now() >= deadline
    ) {
      stopReason = 'time';
      break;
    }

    // Fork an iteration-local RNG.
    const [iterationRng, nextSearchRng] = fork(currentRng);
    currentRng = nextSearchRng;

    // Sample a belief state consistent with the observer's observation.
    const beliefStart = acc !== undefined ? performance.now() : 0;
    const belief = sampleBeliefState(def, state, observation, observer, iterationRng);
    if (acc !== undefined) {
      acc.beliefSamplingTimeMs += performance.now() - beliefStart;
    }

    // Run one full iteration on the sampled state.
    const result = runOneIteration(
      root,
      belief.state,
      belief.rng,
      def,
      config,
      rootLegalMoves,
      runtime,
      pool,
      solverActive,
      acc,
    );
    // Consume the iteration's RNG output (determinism is via fork chain).
    void result;

    iterations += 1;
  }

  // Collect diagnostics if enabled.
  if (acc !== undefined && searchStart !== undefined) {
    const diag = collectDiagnostics(root, iterations, searchStart, acc);
    return {
      rng: currentRng,
      iterations,
      diagnostics: { ...diag, rootStopReason: stopReason },
    };
  }

  return { rng: currentRng, iterations };
}

// ---------------------------------------------------------------------------
// Root decision selection
// ---------------------------------------------------------------------------

/**
 * Select the best child at the root by highest visit count (robust child
 * selection).  Tiebreak by mean reward for the exploring player.
 *
 * @throws if root has no children
 */
export function selectRootDecision(
  root: MctsNode,
  exploringPlayer: PlayerId,
): MctsNode {
  if (root.children.length === 0) {
    throw new Error('selectRootDecision: root has no children');
  }

  let best: MctsNode = root.children[0]!;
  let bestVisits = best.visits;
  let bestMean =
    best.visits > 0 ? best.totalReward[exploringPlayer]! / best.visits : 0;

  for (let i = 1; i < root.children.length; i += 1) {
    const child = root.children[i]!;
    const childMean =
      child.visits > 0 ? child.totalReward[exploringPlayer]! / child.visits : 0;

    if (
      child.visits > bestVisits ||
      (child.visits === bestVisits && childMean > bestMean)
    ) {
      best = child;
      bestVisits = child.visits;
      bestMean = childMean;
    }
  }

  return best;
}
