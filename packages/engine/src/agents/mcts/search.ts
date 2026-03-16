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
import { selectChild, selectDecisionChild } from './isuct.js';
import { shouldExpand, selectExpansionCandidate } from './expansion.js';
import { classifyMovesForSearch, filterAvailableCandidates } from './materialization.js';
import type { MoveClassification } from './materialization.js';
import { templateDecisionRootKey } from './decision-key.js';
import { expandDecisionNode } from './decision-expansion.js';
import type { DecisionExpansionContext } from './decision-expansion.js';
import { canonicalMoveKey } from './move-key.js';
import { rollout, simulateToCutoff, resolveDecisionBoundary } from './rollout.js';
import type { SimulationResult } from './rollout.js';
import { terminalToRewards, evaluateForAllPlayers } from './evaluate.js';
import { sampleBeliefState } from './belief.js';
import { canActivateSolver, updateSolverResult, selectSolverAwareChild } from './solver.js';
import { createAccumulator, collectDiagnostics } from './diagnostics.js';
import type { MastStats } from './mast.js';
import { createMastStats, updateMastStats } from './mast.js';
import type { StateInfoCache } from './state-cache.js';
import {
  createStateInfoCache,
  getOrComputeTerminal,
  getOrComputeLegalMoves,
  getOrComputeRewards,
} from './state-cache.js';

// ---------------------------------------------------------------------------
// Confidence-based root stopping (Hoeffding bound)
// ---------------------------------------------------------------------------

/**
 * Determine whether the best root action is statistically separated from
 * the runner-up using Hoeffding's inequality.
 *
 * Two guards prevent premature stops:
 * 1. Both best and runner-up must have >= `minVisits`.
 * 2. Best must have > 2× the runner-up's visits (visit-ratio guard).
 *
 * Rewards are assumed to be in [0, 1] (consistent with sigmoid normalisation
 * in evaluate.ts), so the Hoeffding bound range parameter is 1.
 *
 * @returns `true` when the search can safely stop early.
 */
export function shouldStopByConfidence(
  root: MctsNode,
  rootPlayerOrdinal: number,
  delta: number,
  minVisits: number,
): boolean {
  if (root.children.length < 2) {
    return false;
  }

  // Find best and runner-up children by mean reward for rootPlayer.
  let best: MctsNode | null = null;
  let bestMean = -Infinity;
  let runnerUp: MctsNode | null = null;
  let runnerUpMean = -Infinity;

  for (const child of root.children) {
    if (child.visits === 0) continue;
    const mean = child.totalReward[rootPlayerOrdinal]! / child.visits;
    if (mean > bestMean) {
      runnerUp = best;
      runnerUpMean = bestMean;
      best = child;
      bestMean = mean;
    } else if (mean > runnerUpMean) {
      runnerUp = child;
      runnerUpMean = mean;
    }
  }

  if (best === null || runnerUp === null) {
    return false;
  }

  // Guard: both must have sufficient visits.
  if (best.visits < minVisits || runnerUp.visits < minVisits) {
    return false;
  }

  // Guard: visit-ratio — best must dominate.
  if (best.visits <= 2 * runnerUp.visits) {
    return false;
  }

  // Hoeffding radius: sqrt(ln(1/delta) / (2 * n)), with range = 1.
  const lnInvDelta = Math.log(1 / delta);
  const bestRadius = Math.sqrt(lnInvDelta / (2 * best.visits));
  const runnerUpRadius = Math.sqrt(lnInvDelta / (2 * runnerUp.visits));

  // Confidence intervals don't overlap ⇒ lower bound of best > upper bound of runner-up.
  return (bestMean - bestRadius) > (runnerUpMean + runnerUpRadius);
}

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
  mastStats?: MastStats,
  stateCache?: StateInfoCache,
  maxCacheEntries?: number,
  iterationIndex: number = 0,
): { readonly rng: Rng } {
  let currentNode = root;
  let currentState = sampledState;
  let currentRng = rng;
  let selectionDepth = 0;
  let selectionRecorded = false;
  const selectionMoveKeys: string[] = [];
  // Safety cap for forced-sequence compression — prevents infinite loops
  // when every state has exactly one legal move and no terminal.
  const maxForcedPlies = config.maxSimulationDepth;
  let forcedPlies = 0;

  // ── Selection ────────────────────────────────────────────────────────
  const selStart = acc !== undefined ? performance.now() : 0;

  while (true) {
    // ── DECISION NODE PATH ─────────────────────────────────────────────
    // Decision nodes share game state from their nearest ancestor state
    // node.  Traversal is a pure tree walk — no kernel calls.
    if (currentNode.nodeKind === 'decision') {
      const decisionPlayer = currentNode.decisionPlayer!;

      if (currentNode.children.length === 0) {
        // Need to expand this decision node via legalChoicesDiscover.
        const ctx: DecisionExpansionContext = {
          def,
          state: currentState,
          playerCount: sampledState.playerCount,
          decisionWideningCap: config.decisionWideningCap ?? 12,
          ...(config.visitor !== undefined ? { visitor: config.visitor } : {}),
          ...(acc !== undefined ? { accumulator: acc } : {}),
          ...(runtime !== undefined ? { runtime } : {}),
        };

        const expansionResult = expandDecisionNode(currentNode, pool, ctx);

        switch (expansionResult.kind) {
          case 'complete': {
            // Decision sequence resolved — applyMove exactly once.
            try {
              const applied = applyMove(
                def, currentState, expansionResult.move, undefined, runtime,
              );
              if (acc !== undefined) { acc.applyMoveCalls += 1; }
              currentState = applied.state;

              // Create a state child node for the completed move.
              let stateChild: MctsNode;
              try {
                stateChild = pool.allocate();
              } catch {
                // Pool exhausted after decision completion — emit event, backprop from current.
                if (config.visitor?.onEvent) {
                  config.visitor.onEvent({
                    type: 'poolExhausted',
                    capacity: pool.capacity,
                    iteration: iterationIndex,
                  });
                }
                break;
              }
              const completedMoveKey = canonicalMoveKey(expansionResult.move);
              (stateChild as { move: Move | null }).move = expansionResult.move;
              (stateChild as { moveKey: MoveKey | null }).moveKey = completedMoveKey;
              (stateChild as { parent: MctsNode | null }).parent = currentNode;
              stateChild.availability = 1;
              currentNode.children.push(stateChild);

              currentNode = stateChild;
              selectionDepth += 1;
              selectionMoveKeys.push(completedMoveKey);

              // Capture heuristic prior at the new state node.
              stateChild.heuristicPrior = [...evaluateForAllPlayers(
                def, currentState, config.heuristicTemperature, runtime,
              )];
            } catch (e: unknown) {
              // applyMove failed on completed decision — emit failure, backprop from here.
              if (config.visitor?.onEvent) {
                config.visitor.onEvent({
                  type: 'applyMoveFailure',
                  actionId: expansionResult.move.actionId,
                  phase: 'expansion',
                  error: String(e),
                });
              }
              if (acc !== undefined) { acc.expansionApplyMoveFailures += 1; }
            }
            break; // Proceed to simulation.
          }

          case 'expanded': {
            // Select among new children using standard UCT.
            const selected = selectDecisionChild(
              currentNode, decisionPlayer, config.explorationConstant,
              expansionResult.children,
            );
            currentNode = selected;
            selectionDepth += 1;
            if (selected.moveKey !== null) {
              selectionMoveKeys.push(selected.moveKey);
            }
            continue; // Continue selection in decision subtree.
          }

          case 'illegal': {
            // Path is pruned — break to backprop from here.
            break;
          }

          case 'stochastic': {
            // Stochastic decision — not supported in tree, break.
            break;
          }

          case 'poolExhausted': {
            // Pool exhausted — break to backprop from here.
            break;
          }
        }
        break; // All non-continue cases break out of while loop.
      }

      // Node already has children — select among them using standard UCT.
      if (currentNode.children.length > 0) {
        const selected = selectDecisionChild(
          currentNode, decisionPlayer, config.explorationConstant,
          currentNode.children,
        );
        currentNode = selected;
        selectionDepth += 1;
        if (selected.moveKey !== null) {
          selectionMoveKeys.push(selected.moveKey);
        }
        continue; // Continue traversal through decision subtree.
      }

      // No children and not expandable — treat as leaf.
      break;
    }

    // ── STATE NODE PATH ────────────────────────────────────────────────
    // Determine legal moves at this node in the sampled state.
    const movesAtNode: readonly Move[] =
      currentNode === root
        ? rootLegalMoves
        : stateCache !== undefined && maxCacheEntries !== undefined
          ? getOrComputeLegalMoves(stateCache, def, currentState, runtime, maxCacheEntries, acc)
          : (() => {
              if (acc !== undefined) { acc.legalMovesCalls += 1; }
              return legalMoves(def, currentState, undefined, runtime);
            })();

    if (movesAtNode.length === 0) {
      // Terminal or no-move position — evaluate and backprop.
      break;
    }

    // Classify all legal moves at this state node via runtime readiness
    // (legalChoicesEvaluate per move — no compile-time shortcuts).
    const classification: MoveClassification = classifyMovesForSearch(
      def, currentState, movesAtNode, runtime, config.visitor,
    );
    const candidates = classification.ready;
    if (acc !== undefined) {
      acc.materializeCalls += 1;
    }

    // ── Decision root creation for pending moves ────────────────────
    // Each unique pending actionId gets a decision root child node.
    // When selection picks a decision root, it enters the decision
    // subtree and expands via expandDecisionNode.
    const actingPlayerForDecision = currentState.activePlayer as PlayerId;
    for (const pendingMove of classification.pending) {
      const rootKey = templateDecisionRootKey(pendingMove.actionId);

      // Check if a decision root for this action already exists.
      let alreadyExists = false;
      for (const child of currentNode.children) {
        if (child.moveKey === rootKey) {
          alreadyExists = true;
          break;
        }
      }
      if (alreadyExists) {
        continue;
      }

      // Allocate a decision root node from the pool.
      let decisionRoot: MctsNode;
      try {
        decisionRoot = pool.allocate();
      } catch {
        // Pool exhausted — emit event, stop creating decision roots.
        if (config.visitor?.onEvent) {
          config.visitor.onEvent({
            type: 'poolExhausted',
            capacity: pool.capacity,
            iteration: iterationIndex,
          });
        }
        break;
      }

      // Wire as a decision root child of the current state node.
      (decisionRoot as { move: Move | null }).move = pendingMove;
      (decisionRoot as { moveKey: MoveKey | null }).moveKey = rootKey;
      (decisionRoot as { parent: MctsNode | null }).parent = currentNode;
      decisionRoot.nodeKind = 'decision';
      decisionRoot.decisionPlayer = actingPlayerForDecision;
      decisionRoot.partialMove = pendingMove;
      decisionRoot.decisionBinding = null;
      decisionRoot.availability = 1;
      currentNode.children.push(decisionRoot);
    }

    // Total available candidates includes both ready and pending moves.
    const totalCandidateCount = candidates.length + classification.pending.length;

    if (totalCandidateCount === 0) {
      break;
    }

    // ── Forced-sequence compression ────────────────────────────────
    // Only applies when there is exactly one ready candidate and no
    // pending moves needing decision roots.
    if (
      config.compressForcedSequences !== false &&
      candidates.length === 1 &&
      classification.pending.length === 0
    ) {
      // Safety cap: break if forced plies exceed the limit.
      if (forcedPlies >= maxForcedPlies) {
        break;
      }
      const forced = candidates[0]!;
      selectionMoveKeys.push(forced.moveKey);

      const applied = applyMove(def, currentState, forced.move, undefined, runtime);
      if (acc !== undefined) {
        acc.applyMoveCalls += 1;
        acc.forcedMovePlies += 1;
      }
      currentState = applied.state;
      selectionDepth += 1;
      forcedPlies += 1;

      // Check terminal after forced move.
      const terminal = stateCache !== undefined && maxCacheEntries !== undefined
        ? getOrComputeTerminal(stateCache, def, currentState, runtime, maxCacheEntries, acc)
        : (() => {
            if (acc !== undefined) { acc.terminalCalls += 1; }
            return terminalResult(def, currentState, runtime);
          })();
      if (terminal !== null) {
        break;
      }

      // Respect solver logic: if solver is active and a proven result
      // exists at the current node, stop compressing.
      if (solverActive && currentNode.provenResult !== null) {
        break;
      }

      // Continue selection loop — do NOT allocate a node.
      continue;
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
      availableChildren.length < totalCandidateCount
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
          config.visitor,
        );
        currentRng = postExpansion;

        // Allocate a child node from the pool.
        let childNode: MctsNode;
        try {
          childNode = pool.allocate();
        } catch {
          // Pool exhausted — emit event, skip expansion, backprop from current.
          if (config.visitor?.onEvent) {
            config.visitor.onEvent({
              type: 'poolExhausted',
              capacity: pool.capacity,
              iteration: iterationIndex,
            });
          }
          break;
        }
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
        selectionMoveKeys.push(chosen.moveKey);

        // Capture heuristic prior at expansion time (for optional blended selection).
        childNode.heuristicPrior = [...evaluateForAllPlayers(
          def, currentState, config.heuristicTemperature, runtime,
        )];

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
        if (solverChild.nodeKind === 'decision') {
          // Selected a decision root via solver — enter decision path.
          currentNode = solverChild;
          selectionDepth += 1;
          if (solverChild.moveKey !== null) {
            selectionMoveKeys.push(solverChild.moveKey);
          }
          continue;
        }
        const applied = applyMove(def, currentState, solverChild.move!, undefined, runtime);
        if (acc !== undefined) {
          acc.applyMoveCalls += 1;
        }
        currentState = applied.state;
        currentNode = solverChild;
        selectionDepth += 1;
        if (solverChild.moveKey !== null) {
          selectionMoveKeys.push(solverChild.moveKey);
        }
        continue;
      }
    }

    const selected = selectChild(
      currentNode,
      exploringPlayer,
      config.explorationConstant,
      availableChildren,
      config.heuristicBackupAlpha ?? 0,
    );

    if (selected.nodeKind === 'decision') {
      // Selected a decision root — enter decision path (no applyMove).
      currentNode = selected;
      selectionDepth += 1;
      if (selected.moveKey !== null) {
        selectionMoveKeys.push(selected.moveKey);
      }
      continue;
    }

    // Apply the selected child's move to advance the state.
    const applied = applyMove(def, currentState, selected.move!, undefined, runtime);
    if (acc !== undefined) {
      acc.applyMoveCalls += 1;
    }
    currentState = applied.state;
    currentNode = selected;
    selectionDepth += 1;
    if (selected.moveKey !== null) {
      selectionMoveKeys.push(selected.moveKey);
    }
  }

  // Finalize selection timing for non-expansion break paths.
  if (acc !== undefined && !selectionRecorded) {
    acc.selectionTimeMs += performance.now() - selStart;
  }

  if (acc !== undefined) {
    acc.selectionDepths.push(selectionDepth);
  }

  // ── Decision boundary resolution ────────────────────────────────────
  // When selection exits at a decision node (partially completed move),
  // complete remaining decisions via random completion before simulation.
  // Decision completion does NOT count toward the simulation cutoff.
  let boundaryFailed = false;

  if (currentNode.nodeKind === 'decision' && currentNode.partialMove !== null) {
    const boundary = resolveDecisionBoundary(
      def, currentState, currentNode.partialMove, currentRng, runtime, acc,
    );
    if (boundary !== null) {
      currentState = boundary.state;
      currentRng = boundary.rng;
      // Visitor: emit applyMoveFailure phase='rollout' is NOT needed here
      // because resolveDecisionBoundary handled it internally.
    } else {
      // Failed completion — flag for zero-reward backpropagation below.
      boundaryFailed = true;
    }
  }

  // ── Simulation (rollout mode dispatch) ──────────────────────────────
  const simStart = acc !== undefined ? performance.now() : 0;
  let simResult: SimulationResult;

  if (boundaryFailed) {
    // Decision boundary failed — skip simulation entirely.
    simResult = {
      state: currentState,
      terminal: null,
      rng: currentRng,
      depth: 0,
      traversedMoveKeys: [],
    };
  } else switch (config.rolloutMode) {
    case 'legacy':
      simResult = rollout(def, currentState, currentRng, config, runtime, acc, stateCache, maxCacheEntries);
      break;
    case 'hybrid':
      simResult = simulateToCutoff(def, currentState, currentRng, config, runtime, acc, mastStats, stateCache, maxCacheEntries);
      break;
    case 'direct':
      // No simulation — evaluate the expansion state directly.
      simResult = {
        state: currentState,
        terminal: stateCache !== undefined && maxCacheEntries !== undefined
          ? getOrComputeTerminal(stateCache, def, currentState, runtime, maxCacheEntries, acc)
          : (() => {
              if (acc !== undefined) { acc.terminalCalls += 1; }
              return terminalResult(def, currentState, runtime);
            })(),
        rng: currentRng,
        depth: 0,
        traversedMoveKeys: [],
      };
      break;
  }

  currentRng = simResult.rng;
  if (acc !== undefined) {
    acc.simulationTimeMs += performance.now() - simStart;
  }

  // ── Evaluation ───────────────────────────────────────────────────────
  const evalStart = acc !== undefined ? performance.now() : 0;
  let rewards: readonly number[];
  if (boundaryFailed) {
    // Failed decision boundary — zero rewards (loss penalty).
    rewards = new Array<number>(sampledState.playerCount).fill(0);
  } else if (simResult.terminal !== null) {
    rewards = terminalToRewards(simResult.terminal, sampledState.playerCount);
  } else {
    // Check terminal on simulation end state.
    const endTerminal = stateCache !== undefined && maxCacheEntries !== undefined
      ? getOrComputeTerminal(stateCache, def, simResult.state, runtime, maxCacheEntries, acc)
      : (() => {
          if (acc !== undefined) { acc.terminalCalls += 1; }
          return terminalResult(def, simResult.state, runtime);
        })();
    if (endTerminal !== null) {
      rewards = terminalToRewards(endTerminal, sampledState.playerCount);
    } else {
      rewards = stateCache !== undefined && maxCacheEntries !== undefined
        ? getOrComputeRewards(stateCache, def, simResult.state, config, runtime, maxCacheEntries, acc)
        : (() => {
            if (acc !== undefined) { acc.evaluateStateCalls += 1; }
            return evaluateForAllPlayers(def, simResult.state, config.heuristicTemperature, runtime);
          })();
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

  // ── MAST update ────────────────────────────────────────────────────
  if (mastStats !== undefined) {
    const allMoveKeys = [...selectionMoveKeys, ...simResult.traversedMoveKeys];
    if (allMoveKeys.length > 0) {
      updateMastStats(mastStats, allMoveKeys, rewards);
    }
  }

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
// Visitor helpers
// ---------------------------------------------------------------------------

/**
 * Collect the top root children sorted by visits descending (capped at 10).
 * Used for `iterationBatch` visitor events.
 */
function getTopChildren(
  root: MctsNode,
): readonly { readonly actionId: string; readonly visits: number }[] {
  const visited: { readonly actionId: string; readonly visits: number }[] = [];
  for (const child of root.children) {
    if (child.visits > 0 && child.move !== null) {
      visited.push({ actionId: child.move.actionId, visits: child.visits });
    }
  }
  visited.sort((a, b) => b.visits - a.visits);
  if (visited.length > 10) {
    visited.length = 10;
  }
  return visited;
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

  // ── Visitor: emit searchStart ──────────────────────────────────────────
  const onEvent = config.visitor?.onEvent;
  const visitorStart = onEvent !== undefined ? performance.now() : 0;

  if (onEvent !== undefined) {
    // Classify root moves once for the visitor start/candidates events.
    // This is cheap (one legalChoicesEvaluate per move) and only runs once.
    const visitorClassification = classifyMovesForSearch(
      def, state, rootLegalMoves, runtime, config.visitor,
    );

    onEvent({
      type: 'searchStart',
      totalIterations: config.iterations,
      legalMoveCount: rootLegalMoves.length,
      readyCount: visitorClassification.ready.length,
      pendingCount: visitorClassification.pending.length,
      poolCapacity: pool.capacity,
    });

    // Emit rootCandidates with ready/pending breakdown.
    const readyEntries: { readonly actionId: string; readonly moveKey: MoveKey }[] = [];
    for (const candidate of visitorClassification.ready) {
      readyEntries.push({ actionId: candidate.move.actionId, moveKey: candidate.moveKey });
    }
    const pendingEntries: { readonly actionId: string }[] = [];
    for (const move of visitorClassification.pending) {
      pendingEntries.push({ actionId: move.actionId });
    }
    onEvent({
      type: 'rootCandidates',
      ready: readyEntries,
      pending: pendingEntries,
    });
  }

  // ── Visitor: allocation tracking via pool wrapper ──────────────────────
  let nodesAllocated = 0;
  const effectivePool: NodePool = onEvent !== undefined
    ? {
        get capacity() { return pool.capacity; },
        allocate() { nodesAllocated += 1; return pool.allocate(); },
        reset() { pool.reset(); },
      }
    : pool;

  // ── Visitor: batch tracking ────────────────────────────────────────────
  const VISITOR_BATCH_SIZE = 50;
  let batchFromIteration = 0;

  // Check solver activation once at search start.
  const solverActive = canActivateSolver(def, state, config);

  // Create MAST stats local to this search run.
  const mastStats = config.rolloutPolicy === 'mast' ? createMastStats() : undefined;

  // Create per-search state-info cache when enabled (default: true).
  const cacheEnabled = config.enableStateInfoCache !== false;
  const stateCache = cacheEnabled ? createStateInfoCache() : undefined;
  const maxCacheEntries = cacheEnabled
    ? (config.maxStateInfoCacheEntries ?? Math.min(pool.capacity, config.iterations * 4))
    : undefined;

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

    // Confidence-based early exit (only after minIterations).
    if (
      iterations >= config.minIterations &&
      shouldStopByConfidence(
        root,
        observer as number,
        config.rootStopConfidenceDelta ?? 1e-3,
        config.rootStopMinVisits ?? 16,
      )
    ) {
      stopReason = 'confidence';
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
      effectivePool,
      solverActive,
      acc,
      mastStats,
      stateCache,
      maxCacheEntries,
      iterations,
    );
    // Consume the iteration's RNG output (determinism is via fork chain).
    void result;

    iterations += 1;

    // ── Visitor: emit iterationBatch every VISITOR_BATCH_SIZE iterations ──
    if (
      onEvent !== undefined &&
      iterations - batchFromIteration >= VISITOR_BATCH_SIZE
    ) {
      onEvent({
        type: 'iterationBatch',
        fromIteration: batchFromIteration,
        toIteration: iterations,
        rootChildCount: root.children.length,
        elapsedMs: performance.now() - visitorStart,
        nodesAllocated,
        topChildren: getTopChildren(root),
      });
      batchFromIteration = iterations;
    }
  }

  // ── Visitor: emit final partial batch (if iterations remain since last batch) ──
  if (onEvent !== undefined && iterations > batchFromIteration) {
    onEvent({
      type: 'iterationBatch',
      fromIteration: batchFromIteration,
      toIteration: iterations,
      rootChildCount: root.children.length,
      elapsedMs: performance.now() - visitorStart,
      nodesAllocated,
      topChildren: getTopChildren(root),
    });
  }

  // ── Visitor: emit searchComplete ───────────────────────────────────────
  if (onEvent !== undefined) {
    let bestActionId = '';
    let bestVisits = 0;
    for (const child of root.children) {
      if (child.visits > bestVisits && child.move !== null) {
        bestActionId = child.move.actionId;
        bestVisits = child.visits;
      }
    }
    onEvent({
      type: 'searchComplete',
      iterations,
      stopReason: stopReason as 'confidence' | 'solver' | 'time' | 'iterations',
      elapsedMs: performance.now() - visitorStart,
      bestActionId,
      bestVisits,
    });
  }

  // Collect diagnostics if enabled.
  if (acc !== undefined && searchStart !== undefined) {
    const diag = collectDiagnostics(root, iterations, searchStart, acc);
    return {
      rng: currentRng,
      iterations,
      diagnostics: { ...diag, rolloutMode: config.rolloutMode, rootStopReason: stopReason },
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
