# Spec 62 — MCTS Search Visitor & Incremental Decision Expansion

**Supersedes**: Spec 61 (MCTS Decision-Sequence Materialization)

## 0. Problem Statement

### 0.1 MCTS Cannot Play Deep-Decision Games

MCTS cannot play Fire in the Lake (FITL). 9 of 10 competence scenarios fail: 7 crash with `moveHasIncompleteParams`, 1 crashes with `SELECTOR_CARDINALITY`, 1 picks `pass` (impoverished search). Only coup pacification (simple fully-resolved moves) passes.

**Root cause**: The MCTS materializes complete moves by randomly filling all decision parameters at once via `completeTemplateMove()`. FITL's complex actions have 5-15+ sequential decision steps. Random completion has exponentially low success probability for deep decision trees — even with retries, most completions fail, silently dropping entire action categories from the search.

For 15-step decisions with ~50% per-step validity, `P(all valid) ~ 0.003%`. The retry approach proposed in Spec 61 is mathematically insufficient. The correct solution is **incremental decision expansion** — treating each decision step as a separate MCTS tree node using the existing `legalChoicesDiscover()` API.

> **Note (post-63MCTSPERROLLFRESEA)**: The 63MCTSPERROLLFRESEA ticket series addressed MCTS *performance* — hybrid rollout modes, MAST policy, state info caching, forced-sequence compression, confidence-based stopping, extended diagnostics, and heuristic backup alpha. These optimizations make the search faster but do **not** address the core problem: `completeTemplateMove()` random completion still has exponentially low success for 15-step decisions. The competence failures (9/10 FITL scenarios) remain unresolved.

### 0.2 Zero Observability Into MCTS Behavior

The MCTS search is a black box. When tests hang, crash, or produce wrong results, there is no way to determine what happened inside the search. The existing `diagnostics` flag provides post-hoc aggregate counters but no real-time visibility into:

- What actions the search is currently exploring
- Why template moves are being dropped
- Whether decision paths are completing or pruning
- Pool exhaustion, infinite loops, or error cascades

This makes it impossible to safely tune pool sizes, iteration counts, or architectural changes without guessing.

### 0.3 Silent AI in Visual Play

When a human player uses the browser runner against MCTS AI opponents, the AI turn shows a generic "thinking" animation with no insight into what the AI is considering. For complex games like FITL where MCTS can take 10-30+ seconds, this creates a poor experience — the human has no sense of whether the AI is stuck, exploring interesting moves, or about to decide.

## 1. Architecture Overview

This spec introduces three interconnected components:

```
                        MctsSearchVisitor (engine)
                              │
              ┌───────────────┼───────────────┐
              │               │               │
         Test Logger     Diagnostics     Worker Bridge
     (console + JSONL)   (counters)      (postMessage)
              │               │               │
              │               │          Runner Store
              │               │               │
              │               │          AITurnOverlay
              │               │          Dashboard with
              │               │          progress + stats
              │               │
         Test Assertions  Tuning Data
```

1. **`MctsSearchVisitor`** — A game-agnostic callback interface on `MctsConfig` that receives structured events during search. Zero overhead when not provided.

2. **Incremental decision expansion** — Treats each decision step as a separate MCTS tree node using `legalChoicesDiscover()`, with visitor callbacks at each step for full observability.

3. **Runner integration** — The worker bridge translates visitor events into `postMessage` calls that the Zustand store surfaces to the `AITurnOverlay` component as a real-time dashboard with progress, iteration stats, and top action candidates.

**Dual-track observability design**: The visitor provides **real-time streaming** events for consumers (test loggers, runner dashboard). The `MutableDiagnosticsAccumulator` (from 63MCTSPERROLLFRESEA-001) provides **post-hoc summary** counters for aggregate analysis and tuning. They are complementary — the visitor is for live observation, diagnostics for post-search statistics.

## 2. MctsSearchVisitor Interface

### 2.1 Design Principles

- **Optional**: `visitor` field on `MctsConfig` defaults to `undefined`. No callbacks = zero overhead (a single `if (visitor)` guard per call site).
- **Game-agnostic**: Events use engine types (`ActionId`, `Move`, `MoveKey`). The runner translates to display names using `GameDef` metadata.
- **Non-blocking**: Visitor callbacks must be synchronous and lightweight. The search does not await them. Visitors that need async behavior (e.g., `postMessage`) should buffer internally.
- **Structured**: Each event is a discriminated union with a `type` field, enabling type-safe handling and serialization across the worker boundary.

### 2.2 Event Types

```typescript
// packages/engine/src/agents/mcts/visitor.ts

import type { Move } from '../../kernel/types-core.js';
import type { MoveKey } from './move-key.js';

/** Discriminated union of all MCTS search events. */
export type MctsSearchEvent =
  | MctsSearchStartEvent
  | MctsIterationBatchEvent
  | MctsExpansionEvent
  | MctsDecisionNodeCreatedEvent
  | MctsDecisionCompletedEvent
  | MctsDecisionIllegalEvent
  | MctsTemplateDroppedEvent
  | MctsApplyMoveFailureEvent
  | MctsPoolExhaustedEvent
  | MctsSearchCompleteEvent
  | MctsRootCandidatesEvent;

/**
 * Emitted once at the start of a search.
 * Provides the full context of the search configuration.
 */
export interface MctsSearchStartEvent {
  readonly type: 'searchStart';
  readonly totalIterations: number;
  readonly legalMoveCount: number;
  readonly concreteCount: number;
  readonly templateCount: number;
  readonly poolCapacity: number;
}

/**
 * Emitted periodically as a batch summary of completed iterations.
 * Replaces per-iteration events to avoid hot-loop overhead.
 * Recommended batch size: every 50 iterations or every 250ms, whichever comes first.
 */
export interface MctsIterationBatchEvent {
  readonly type: 'iterationBatch';
  readonly fromIteration: number;
  readonly toIteration: number;
  readonly rootChildCount: number;
  readonly elapsedMs: number;
  readonly nodesAllocated: number;
  readonly topChildren: readonly { actionId: string; visits: number }[];
}

export interface MctsExpansionEvent {
  readonly type: 'expansion';
  readonly actionId: string;
  readonly moveKey: MoveKey;
  readonly childIndex: number;
  readonly totalChildren: number;
}

export interface MctsDecisionNodeCreatedEvent {
  readonly type: 'decisionNodeCreated';
  readonly actionId: string;
  readonly decisionName: string;
  readonly optionCount: number;
  readonly decisionDepth: number;
}

export interface MctsDecisionCompletedEvent {
  readonly type: 'decisionCompleted';
  readonly actionId: string;
  readonly stepsUsed: number;
  readonly moveKey: MoveKey;
}

export interface MctsDecisionIllegalEvent {
  readonly type: 'decisionIllegal';
  readonly actionId: string;
  readonly decisionName: string;
  readonly reason: string;
}

/**
 * Emitted when a template move is dropped during materialization
 * before it can enter the search tree.
 */
export interface MctsTemplateDroppedEvent {
  readonly type: 'templateDropped';
  readonly actionId: string;
  readonly reason: 'unsatisfiable' | 'stochasticUnresolved' | 'applyMoveFailed';
}

export interface MctsApplyMoveFailureEvent {
  readonly type: 'applyMoveFailure';
  readonly actionId: string;
  readonly phase: 'expansion' | 'selection' | 'rollout' | 'forcedSequence';
  readonly error: string;
}

export interface MctsPoolExhaustedEvent {
  readonly type: 'poolExhausted';
  readonly capacity: number;
  readonly iteration: number;
}

export interface MctsSearchCompleteEvent {
  readonly type: 'searchComplete';
  readonly iterations: number;
  readonly stopReason: 'confidence' | 'solver' | 'time' | 'iterations';
  readonly elapsedMs: number;
  readonly bestActionId: string;
  readonly bestVisits: number;
}

export interface MctsRootCandidatesEvent {
  readonly type: 'rootCandidates';
  readonly concrete: readonly { actionId: string; moveKey: MoveKey }[];
  readonly templates: readonly { actionId: string }[];
}

/**
 * Callback interface for MCTS search observation.
 *
 * All methods are optional. Implement only the events you care about.
 * All methods must be synchronous and cheap — the search hot loop
 * does not await them.
 */
export interface MctsSearchVisitor {
  readonly onEvent?: (event: MctsSearchEvent) => void;
}
```

**Removed from original spec**: `rolloutComplete` event — the `MutableDiagnosticsAccumulator` already tracks `hybridRolloutPlies` and rollout-related counters from 63MCTSPERROLLFRESEA. Duplicating this as a streaming event adds hot-loop overhead with no unique value.

**Updated**: `searchComplete.stopReason` uses the same vocabulary as `MctsSearchDiagnostics.rootStopReason` from 63MCTSPERROLLFRESEA: `'confidence'`, `'solver'`, `'time'`, `'iterations'`.

### 2.3 Why a Single `onEvent` Method

A single `onEvent(event)` method with a discriminated union is preferred over per-event callbacks (`onIterationStart`, `onExpansion`, etc.) because:

1. **Serialization**: The worker bridge can forward `MctsSearchEvent` objects directly via `postMessage` without adapting per-callback.
2. **Extensibility**: New event types can be added without changing the `MctsSearchVisitor` interface.
3. **Filtering**: Consumers use `switch (event.type)` to handle only events they care about.
4. **Testing**: A single `events: MctsSearchEvent[]` array captures everything for assertions.

### 2.4 Config Integration

The following fields already exist on `MctsConfig` (from 63MCTSPERROLLFRESEA):

- `rolloutMode`, `hybridCutoffDepth` — hybrid rollout configuration
- `rolloutPolicy`, `mastWarmUpThreshold` — MAST rollout policy
- `enableStateInfoCache`, `maxStateInfoCacheEntries` — per-search state info cache
- `compressForcedSequences` — forced-sequence compression
- `rootStopConfidenceDelta`, `rootStopMinVisits` — Hoeffding-bound confidence stopping
- `heuristicBackupAlpha` — heuristic backup blending weight

This spec adds only:

```typescript
// Additions to MctsConfig
export interface MctsConfig {
  // ... all existing fields unchanged ...

  /** Optional visitor for real-time search observation. */
  readonly visitor?: MctsSearchVisitor;

  /**
   * Maximum number of decision options before progressive widening activates
   * at decision nodes. When optionCount <= this value, all options are expanded
   * immediately (no widening). Default: 12.
   */
  readonly decisionWideningCap?: number;

  /**
   * Pool capacity multiplier for decision depth. The pool is sized as:
   *   max(iterations * decisionDepthMultiplier + 1, legalMoves.length * 4)
   * Default: 4.
   */
  readonly decisionDepthMultiplier?: number;
}
```

The `visitor` field is excluded from `validateMctsConfig()` validation (it's a callback, not a tuneable parameter) and from `Object.freeze()` on the config (callbacks are inherently mutable references). It is not included in preset definitions.

The `decisionWideningCap` and `decisionDepthMultiplier` fields ARE validated and included in presets (they are tuneable numeric parameters).

## 3. Incremental Decision Expansion

### 3.1 Rationale (Superseding Spec 61 Section 2.1)

Spec 61 proposed retry logic for `completeTemplateMove()`. This is mathematically insufficient for deep decision trees. The correct approach is **incremental decision expansion**: each decision step becomes a tree node, and MCTS learns which early decisions are good through standard tree search.

This is the standard MCTS technique for games with compound actions (Browne et al. survey, Arimaa sub-move integration).

### 3.2 Decision Node Architecture

Add an explicit discriminator and decision-specific fields to `MctsNode`:

```typescript
export interface MctsNode {
  // ... existing fields unchanged ...

  /** Discriminator: 'state' for normal game-state nodes, 'decision' for mid-decision nodes. */
  nodeKind: 'state' | 'decision';

  /** Non-null for decision nodes: the player making the decision. */
  decisionPlayer: PlayerId | null;

  /** Non-null for decision nodes: the partial move being built. */
  partialMove: Move | null;

  /** Non-null for decision nodes: the binding name chosen to reach this node. */
  decisionBinding: string | null;
}
```

- `nodeKind === 'state'` → state node (current behavior, stores computed game state)
- `nodeKind === 'decision'` → decision node (mid-decision, game state unchanged from parent state node)

The explicit `nodeKind` discriminator is preferred over checking `partialMove === null` because:
1. It is self-documenting and type-safe
2. It enables exhaustive `switch` in selection/expansion code
3. It avoids ambiguity if `partialMove` is ever used for other purposes

**Invariant**: `heuristicPrior` is always `null` for decision nodes. Decision nodes do not represent game states and therefore have no heuristic evaluation. The `heuristicPrior` field (added in 63MCTSPERROLLFRESEA-008) is only meaningful for state nodes.

#### 3.2.1 Decision Node Selection Protocol

Decision nodes require different selection behavior than state nodes:

- **State nodes** → ISUCT (information-set UCT, availability-aware). This is the existing behavior: UCB uses `child.availability` in the denominator.
- **Decision nodes** → Standard UCT using `parent.visits` in the denominator, NOT `child.availability`. Decision nodes do not represent hidden information — the deciding player always knows all their options.

Key invariants for decision node traversal:

1. **Decision nodes do NOT compute or store game state.** The game state is unchanged throughout a decision subtree — it lives on the nearest ancestor state node.
2. **`applyMove` is called exactly once** when a decision sequence completes (i.e., `legalChoicesDiscover()` returns `kind: 'complete'`). The completed move is applied to the ancestor state node's game state to produce the child state node.
3. **Selection through a decision subtree = pure tree traversal.** No kernel calls, no state computation — just walk down the tree using UCT scores on the decision options.
4. **Rollout from a decision node**: Complete remaining decisions randomly using `completeTemplateMove(partialMove)`, apply the completed move once, then continue rollout normally from the resulting state (see Section 3.7).
5. **Exploring player**: Read from `ChoicePendingRequest.decisionPlayer` (the player whose decision is pending), not from the game state's current player.

### 3.3 Decision Expansion Module

Create `decision-expansion.ts` that wraps `legalChoicesDiscover()`:

- Given a decision node + game state, call `legalChoicesDiscover(def, state, partialMove)`
- Handle `pending` → each `ChoiceOption` becomes a child candidate
- Handle `complete` → apply the fully-resolved move → state node child
- Handle `illegal` → prune this path (backpropagate loss)
- Handle `pendingStochastic` → chance node with weighted outcomes

#### chooseN Handling (Iterative Expansion via Hybrid Resolver)

`chooseN` decisions (e.g., "choose 2-3 provinces") are handled via **iterative expansion** — each individual pick in a chooseN sequence is a separate decision node, using the existing `legalChoicesDiscover()` API and the three-tier hybrid resolver infrastructure from 63CHOOPEROPT.

**How it works**:

1. When MCTS expands a decision node for a chooseN step, it calls `legalChoicesDiscover(def, state, partialMove)`.
2. The response is `pending` with a `ChoicePendingChooseNRequest` containing options with **resolution metadata** (`resolution: 'exact' | 'provisional' | 'stochastic' | 'ambiguous'`) from the three-tier hybrid resolver (exact enumeration → singleton probes → witness search).
3. Only options with `legality === 'legal'` are expanded as children.
4. Options with `legality === 'unknown'` are expansion candidates via progressive widening (treated as "maybe legal, explore when budget allows").
5. Options with `legality === 'illegal'` are pruned (never expanded).
6. Resolution metadata informs expansion priority: `exact` options are preferred over `provisional` ones.
7. Progressive widening applies per step over the remaining unselected options, NOT over the full combinatorial space.
8. After picking one option, the next `legalChoicesDiscover()` call returns the next pending choice with the remaining pool (the kernel tracks selected items via the partialMove).

**Benefits over the original atomic sampling design**:
- Reuses existing infrastructure (no new sampling code needed)
- MCTS learns which early picks are good (not just which complete selections)
- Option-level legality is resolver-validated (not random)
- No `sampleChooseNCompletion()` function needed
- No Fisher-Yates shuffle needed
- No sorted dedup keys for combinations needed

#### Progressive Widening Bypass

For decision nodes where `optionCount <= decisionWideningCap` (default 12), bypass progressive widening entirely — expand all options immediately. This ensures that small decision spaces (e.g., "choose faction" with 4 options) are fully explored without the overhead of progressive widening.

Progressive widening only activates for decision nodes with `optionCount > decisionWideningCap`.

### 3.4 Decision Key Module

Create `decision-key.ts` for MoveKey generation at decision nodes:

- Encode `actionId + binding name + binding value` so UCB deduplication works
- Template root key encodes action category (e.g., `D:rally`) so all rally decision subtrees share UCB statistics

### 3.5 Search Loop Integration

Modify `search.ts` selection loop:

1. **State nodes with template moves**: Partition `legalMoves()` into concrete (state node children) and templates (decision root children). Templates get `legalChoicesDiscover()` for first decision.
2. **Decision nodes**: Use `expandDecisionNode()` instead of `legalMoves()` + materialization. Progressive widening applies identically (subject to the bypass rule in Section 3.3).
3. **Decision completion**: When `legalChoicesDiscover()` returns `complete`, apply the move → create state node child → proceed to simulation.
4. **Decision node at simulation boundary**: If selection ends on a decision node (partially completed move), complete remaining decisions via `completeTemplateMove(partialMove)` — fast random completion. Apply the completed move to get a real game state, then continue to simulation phase.

**Integration with existing 63MCTSPERROLLFRESEA infrastructure**:

- **Forced-sequence compression**: If a decision step has only 1 legal option, compress — don't allocate a node, advance the partialMove directly. This mirrors how forced-sequence compression works for single-candidate game moves.
- **State info cache**: Only state nodes use the cache (decision nodes don't have game states).
- **Confidence-based stopping** (`shouldStopByConfidence()`): Operates on root children, which may be decision root nodes for templates. Visit counts on decision root nodes reflect the total simulations through that action category.

### 3.6 Pool Sizing

The node pool must accommodate decision subtrees. The pool capacity formula:

```
poolCapacity = max(iterations * decisionDepthMultiplier + 1, legalMoves.length * 4)
```

Where `decisionDepthMultiplier` defaults to 4 (configurable via `MctsConfig.decisionDepthMultiplier`).

**Graceful degradation on pool exhaustion**: When the pool is exhausted mid-search:
1. Skip expansion — do not allocate a new node
2. Backpropagate from the current node (treat as a leaf)
3. Emit a `poolExhausted` visitor event
4. Continue remaining iterations (they can still traverse the existing tree and improve UCB estimates)
5. Do NOT abort the search — partial results are still valuable

This ensures that pool sizing errors degrade gracefully rather than crashing.

### 3.7 Rollout Integration (Boundary-Respecting Simulation)

The decision architecture and rollout system are **orthogonal** — decision nodes control tree structure; `rolloutMode` (from 63MCTSPERROLLFRESEA) controls simulation strategy. They do not interfere.

**Architecture** (consistent with TAG framework / O-MCTS literature):

1. **Tree phase**: Full incremental decision expansion via decision nodes + `legalChoicesDiscover()`. Each decision step is a tree node with UCT-guided selection.

2. **Simulation boundary mid-decision**: When selection exits the tree at a decision node (partially completed move):
   a. Complete remaining decisions via `completeTemplateMove(partialMove)` — fast random completion using the existing function.
   b. Apply the completed move to get a real game state.
   c. Compound action completion does NOT count toward the simulation cutoff budget. The cutoff counts complete game plies, not mid-decision steps. This respects action boundaries — never evaluate mid-compound-action.

3. **Simulation phase**: Uses existing `simulateToCutoff()` / `rollout()` / direct eval per `rolloutMode` config (from 63MCTSPERROLLFRESEA). Template moves encountered *during simulation* are completed via `materializeConcreteCandidates()` → `completeTemplateMove()` (existing behavior, unchanged).

4. **No `completeDecisionIncrementally()` function needed** — the tree handles incrementality; simulation uses fast random completion via the existing `completeTemplateMove()`.

### 3.8 Visitor Integration in Decision Expansion

Every decision step emits visitor events:

- `decisionNodeCreated` when a new decision node is allocated
- `decisionCompleted` when a decision sequence resolves to a complete move
- `decisionIllegal` when a path is pruned
- `templateDropped` when a template move is dropped before entering the tree
- `applyMoveFailure` when a completed move fails at `applyMove()`

Decision-related counters (`decisionNodesCreated`, `decisionCompletionsInTree`, `decisionCompletionsInRollout`, `decisionIllegalPruned`, `decisionDepthMax`) are already present in `MutableDiagnosticsAccumulator` and `MctsSearchDiagnostics` from 63MCTSPERROLLFRESEA. Visitor events supplement these with streaming notifications for real-time observation.

The `CiDiagnosticsReporter` forwards both visitor events (streaming) and the diagnostics summary (post-search).

### 3.9 Post-Completion for Decision Nodes

When `selectRootDecision()` returns a decision node child (template move was the best root action), `postCompleteSelectedMove()` must:

1. Follow the highest-visit path through the decision subtree
2. Find the deepest explored partial move
3. Complete remaining decisions via `completeTemplateMove()` — fast random completion for any steps not explored in-tree
4. Fall back to `completeTemplateMove()` on original legal moves if needed

## 4. Runner Integration

### 4.1 Worker Bridge (Time-Based Throttling)

The worker creates a visitor that accumulates events and sends snapshots to the main thread via time-based throttling:

```typescript
// In createGameWorker().requestAgentMove():
const visitor: MctsSearchVisitor = {
  onEvent(event) {
    accumulateEvent(event); // buffer into local state
  },
};

// Time-based snapshot dispatch at 4 Hz (250ms interval)
const snapshotTimer = setInterval(() => {
  const snapshot: MctsProgressSnapshot = {
    type: 'mctsProgress',
    iteration: currentIteration,
    totalIterations: totalIterations,
    elapsedMs: performance.now() - searchStartTime,
    iterationsPerSec: calculateRate(),
    topActions: getTopActions(),
    treeDepth: maxDepthSeen,
    nodesAllocated: nodesAllocated,
    decisionDepthMax: maxDecisionDepth,
  };
  self.postMessage(snapshot);
}, 250);

// On search completion:
clearInterval(snapshotTimer);
// Forward searchComplete immediately
self.postMessage({ type: 'mctsSearchComplete', event: searchCompleteEvent });
```

The `MctsProgressSnapshot` type:

```typescript
interface MctsProgressSnapshot {
  readonly type: 'mctsProgress';
  readonly iteration: number;
  readonly totalIterations: number;
  readonly elapsedMs: number;
  readonly iterationsPerSec: number;
  readonly topActions: readonly { actionId: string; visits: number; pct: number }[];
  readonly treeDepth: number;
  readonly nodesAllocated: number;
  readonly decisionDepthMax: number;
}
```

This approach:
- Avoids flooding the main thread (fixed 4 Hz regardless of iteration speed)
- Decouples snapshot frequency from iteration batch size
- Provides smooth progress updates regardless of search speed

### 4.2 Bridge Adapter & `aiThinking` Store Slice

The game bridge (`packages/runner/src/bridge/`) listens for `mctsProgress` and `mctsSearchComplete` messages and updates the Zustand store:

```typescript
// New store slice: aiThinking — full dashboard state
interface AiThinkingState {
  /** Whether the AI is currently thinking. */
  readonly isThinking: boolean;
  /** Iteration progress (0-1). */
  readonly progress: number;
  /** Current iteration number. */
  readonly iteration: number;
  /** Total iterations for this search. */
  readonly totalIterations: number;
  /** Iterations per second. */
  readonly iterationsPerSec: number;
  /** Elapsed time in milliseconds. */
  readonly elapsedMs: number;
  /** Top root actions with visit percentages and display names. */
  readonly topActions: readonly {
    actionId: string;
    displayName: string;
    visits: number;
    pct: number;
  }[];
  /** Maximum tree depth reached. */
  readonly treeDepth: number;
  /** Total nodes allocated in the pool. */
  readonly nodesAllocated: number;
}
```

### 4.3 AITurnOverlay Dashboard

The existing `AITurnOverlay` component is enhanced to show a full thinking dashboard:

```
┌──────────────────────────────────────────┐
│              AI Turn                     │
│           NVA (Player 3)                 │
│                                          │
│   Progress: ████████░░ 80%               │
│   Iteration: 800 / 1000  (2,450 iter/s) │
│   Elapsed: 3.2s                          │
│                                          │
│   Top Actions:                           │
│   ▓▓▓▓▓▓▓▓▓░  Rally      45%  (360)     │
│   ▓▓▓▓▓▓░░░░  March      30%  (240)     │
│   ▓▓▓░░░░░░░  Attack     15%  (120)     │
│                                          │
│   Tree: 1,847 nodes, depth 12           │
│                                          │
│   ● ● ●                                 │
│                                          │
│          [ Skip ]                        │
└──────────────────────────────────────────┘
```

Dashboard elements:
- **Progress bar** with percentage
- **Iteration count** and rate (iter/s)
- **Top 3 actions** with mini bar charts, percentages, and visit counts
- **Tree stats**: nodes allocated and maximum depth
- **Elapsed time**

The display names come from `GameDef.actions[].id` mapped through the runner's display name utilities. This is game-agnostic — every game's actions get human-readable names based on the GameDef metadata.

### 4.4 Comlink Considerations

The visitor runs inside the Web Worker. Comlink does not support streaming callbacks for an in-progress `requestAgentMove()` call. Two options:

**Option A (recommended)**: Use raw `postMessage` / `addEventListener` alongside Comlink for the streaming event channel. The `requestAgentMove()` call remains a Comlink RPC that returns the final result; thinking events flow through a separate channel.

**Option B**: Expose a `subscribeToMctsEvents(callback)` method on the worker API that the bridge calls before `requestAgentMove()`. This is cleaner but requires Comlink proxy support for callbacks.

The spec recommends Option A for simplicity and proven reliability.

### 4.5 CI Diagnostics Pipeline

#### CiDiagnosticsReporter Test Helper

Create a `CiDiagnosticsReporter` test helper that outputs both JSONL (machine-readable) and console progress (human-readable) for CI environments:

```typescript
// packages/engine/test/helpers/ci-diagnostics-reporter.ts

/**
 * Visitor implementation for CI pipelines.
 * Writes JSONL to a file for post-analysis and logs progress to console.
 */
export class CiDiagnosticsReporter implements MctsSearchVisitor {
  constructor(
    private readonly outputPath: string, // JSONL output file
    private readonly scenarioName: string,
  ) {}

  onEvent(event: MctsSearchEvent): void {
    // Append JSONL line
    appendFileSync(this.outputPath, JSON.stringify({
      timestamp: Date.now(),
      scenario: this.scenarioName,
      event,
    }) + '\n');

    // Console progress for human readability
    switch (event.type) {
      case 'searchStart':
        console.log(`[MCTS] ${this.scenarioName}: starting ${event.totalIterations} iterations (${event.concreteCount} concrete, ${event.templateCount} templates, pool=${event.poolCapacity})`);
        break;
      case 'iterationBatch':
        console.log(`[MCTS] ${this.scenarioName}: iterations ${event.fromIteration}-${event.toIteration}, ${event.rootChildCount} children, ${event.nodesAllocated} nodes, ${event.elapsedMs.toFixed(0)}ms`);
        break;
      case 'searchComplete':
        console.log(`[MCTS] ${this.scenarioName}: complete in ${event.elapsedMs.toFixed(0)}ms, ${event.iterations} iterations, best=${event.bestActionId} (${event.bestVisits} visits), stop=${event.stopReason}`);
        break;
      case 'poolExhausted':
        console.warn(`[MCTS] ${this.scenarioName}: POOL EXHAUSTED at iteration ${event.iteration}, capacity=${event.capacity}`);
        break;
      case 'templateDropped':
        console.warn(`[MCTS] ${this.scenarioName}: template dropped: ${event.actionId} (${event.reason})`);
        break;
    }
  }
}
```

#### JSONL Schema

Each line in the JSONL output file:

```json
{
  "timestamp": 1710000000000,
  "scenario": "coup-pacification",
  "event": { "type": "searchStart", "totalIterations": 1000, "..." : "..." }
}
```

#### CI Workflow Integration

All 6 MCTS-related CI workflow files need these additions:

```yaml
# In each .github/workflows/engine-mcts-*.yml:

env:
  MCTS_DIAGNOSTICS_DIR: ${{ runner.temp }}/mcts-diagnostics

steps:
  # ... existing test step ...

  - name: Upload MCTS diagnostics
    uses: actions/upload-artifact@v4
    if: always()
    with:
      name: mcts-diagnostics-${{ matrix.scenario || 'all' }}
      path: ${{ env.MCTS_DIAGNOSTICS_DIR }}
      retention-days: 14
      if-no-files-found: ignore
```

The `CiDiagnosticsReporter` reads `MCTS_DIAGNOSTICS_DIR` from the environment. If set, it writes JSONL files to that directory. If not set, it falls back to console-only output.

## 5. Implementation Plan

### Phase 1: Search Visitor Foundation

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-001 | Create `MctsSearchVisitor` interface and `MctsSearchEvent` discriminated union. Includes `searchStart`, `iterationBatch`, `templateDropped` event types (replaces per-iteration events). Note: `MutableDiagnosticsAccumulator` already exists with per-phase timings and kernel-call counters — visitor events are the streaming complement. | `visitor.ts` (new) |
| MCTSINCDEC-002 | Add `visitor?: MctsSearchVisitor`, `decisionWideningCap?: number`, and `decisionDepthMultiplier?: number` to `MctsConfig`. Update `validateMctsConfig()`: pass visitor through without validation, validate numeric fields with defaults. Note: all other MctsConfig fields from 63MCTSPERROLLFRESEA already exist. | `config.ts` |
| MCTSINCDEC-003 | Wire visitor into `runSearch()` and `runOneIteration()`: emit `searchStart` once at beginning, accumulate iteration data, emit `iterationBatch` every 50 iterations, emit `searchComplete` with `stopReason` matching `rootStopReason` vocabulary (`'confidence' | 'solver' | 'time' | 'iterations'`). | `search.ts` |
| MCTSINCDEC-004 | Wire visitor into `selectExpansionCandidate()` defensive catch: emit `applyMoveFailure`. Wire into materialization: emit `templateDropped`. Wire into existing search.ts defensive catches. | `expansion.ts`, `search.ts`, `materialization.ts` |
| MCTSINCDEC-005 | Create `CiDiagnosticsReporter` test helper (JSONL + console progress). Also create `ConsoleVisitor` for local development. Use both in FITL MCTS test helpers. | `test/helpers/ci-diagnostics-reporter.ts` (new), `test/helpers/mcts-console-visitor.ts` (new), `fitl-mcts-test-helpers.ts` |
| MCTSINCDEC-006 | Run FITL MCTS fast tests with `ConsoleVisitor`. Record output. Diagnose why scenarios crash or fail. This establishes the observability baseline. | test run + analysis |

### Phase 2: Decision Node Architecture

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-007 | Extend `MctsNode` with `nodeKind: 'state' \| 'decision'`, `decisionPlayer: PlayerId \| null`, `partialMove`, and `decisionBinding` fields. Update `createRootNode()`, `createChildNode()`, pool reset. Add `createDecisionChildNode()` factory. Default `nodeKind` to `'state'` for all existing node creation. Invariant: `heuristicPrior` is always `null` for decision nodes. | `node.ts`, `node-pool.ts` |
| MCTSINCDEC-008 | Create `decision-expansion.ts`: `expandDecisionNode()` using `legalChoicesDiscover()`. Handle `pending`, `complete`, `illegal`, `pendingStochastic`. Implement **iterative chooseN expansion**: each chooseN pick is a separate decision node. Use `ChoicePendingChooseNRequest` options with resolution metadata (`resolution: 'exact' \| 'provisional' \| 'stochastic' \| 'ambiguous'`) from the three-tier hybrid resolver to classify children — `legality === 'legal'` options are expanded, `legality === 'unknown'` options are progressive widening candidates, `legality === 'illegal'` options are pruned. Implement progressive widening bypass for small option sets (`<= decisionWideningCap`). | `decision-expansion.ts` (new) |
| MCTSINCDEC-009 | Create `decision-key.ts`: `decisionNodeKey()` and `templateDecisionRootKey()` for MoveKey generation. | `decision-key.ts` (new) |
| MCTSINCDEC-010 | Modify `search.ts` selection loop: detect `nodeKind`, use standard UCT (not ISUCT) at decision nodes (`parent.visits` denominator, no availability), implement no-`applyMove` traversal through decision subtrees, call `applyMove` exactly once on decision completion. Emit visitor events (`decisionNodeCreated`, `decisionCompleted`, `decisionIllegal`). Read exploring player from `ChoicePendingRequest.decisionPlayer`. Integrate with forced-sequence compression: single-option decision steps skip node allocation. | `search.ts`, `isuct.ts` |
| MCTSINCDEC-011 | Modify `rollout.ts`: when selection exits the tree at a decision node, complete remaining decisions via `completeTemplateMove(partialMove)` — fast random completion. Apply the completed move to get a real game state, then continue to simulation. Compound action completion does NOT count toward cutoff budget (respects action boundaries). Template moves during simulation use existing `materializeConcreteCandidates()` → `completeTemplateMove()` path (unchanged). | `rollout.ts` |
| MCTSINCDEC-012 | Update `mcts-agent.ts`: implement pool capacity formula `max(iterations * decisionDepthMultiplier + 1, legalMoves.length * 4)`. Implement graceful degradation on pool exhaustion (skip expansion, backpropagate, emit event, continue). Update `postCompleteSelectedMove()` to handle decision node children at root — follow highest-visit path, complete remaining via `completeTemplateMove()`. | `mcts-agent.ts` |
| MCTSINCDEC-013 | Wire `rootCandidates` visitor event at the start of each search (concrete vs template partitioning). | `search.ts` |

### Phase 3: Compound Move & Kernel Verification

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-014 | Verify `legalChoicesDiscover()` handles compound moves (`move.compound.specialActivity`). After main operation decisions complete, it should present SA decisions. If not, extend. Write unit tests. | `legal-choices.ts`, new test file |
| MCTSINCDEC-015 | Verify `legalChoicesDiscover()` correctly returns `illegal` when a decision path leads to an impossible state (empty domain). Write unit tests for edge cases. | `legal-choices.ts`, new test file |

### Phase 4: Validation & Tuning

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-016 | Run FITL MCTS fast tests with visitor enabled. All 10 scenarios should complete without crashes. Tune `acceptableCategories` based on visitor output. | test files |
| MCTSINCDEC-017 | Run FITL MCTS default and strong test suites. Tune acceptable category sets. | test files |
| MCTSINCDEC-018 | Verify Texas Hold'em MCTS tests still pass (regression check). | test run |
| MCTSINCDEC-019 | Tune node pool sizing. Profile with diagnostics and visitor. Decision nodes increase depth but reduce width. | `config.ts`, `mcts-agent.ts` |
| MCTSINCDEC-020 | Add CI workflow YAML updates: `MCTS_DIAGNOSTICS_DIR` env var + `actions/upload-artifact@v4` with `if: always()` to all 6 `engine-mcts-*.yml` workflow files. Final verification: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`. | `.github/workflows/engine-mcts-*.yml` (6 files) |

### Phase 5: Runner Integration

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-021 | Add `mctsProgress` postMessage channel in `createGameWorker()`. Create visitor that accumulates events and dispatches `MctsProgressSnapshot` via `setInterval(250)` (4 Hz). Clear timer on search completion. Forward `searchComplete` immediately. | `game-worker-api.ts` |
| MCTSINCDEC-022 | Add `aiThinking` state slice to Zustand store with full dashboard fields (`isThinking`, `progress`, `iteration`, `totalIterations`, `iterationsPerSec`, `elapsedMs`, `topActions`, `treeDepth`, `nodesAllocated`). Bridge listens for `mctsProgress` messages and updates store. | `store-types.ts`, `game-store.ts` |
| MCTSINCDEC-023 | Create display name mapping utility: `actionId` → human-readable name from `GameDef.actions`. | `utils/action-display-names.ts` (new) |
| MCTSINCDEC-024 | Enhance `AITurnOverlay` to show full dashboard: progress bar with percentage, iteration count and rate (iter/s), top 3 actions with mini bar charts and visit counts, tree stats (nodes, depth), elapsed time. | `AITurnOverlay.tsx`, `AITurnOverlay.module.css` |
| MCTSINCDEC-025 | Verify visual play with FITL. MCTS should show meaningful dashboard during search. | manual test |

## 6. Files to Modify

| File | Changes |
|------|---------|
| `packages/engine/src/agents/mcts/visitor.ts` | **NEW**: `MctsSearchVisitor`, `MctsSearchEvent` types |
| `packages/engine/src/agents/mcts/config.ts` | Add `visitor`, `decisionWideningCap`, `decisionDepthMultiplier` fields (all 63MCTSPERROLLFRESEA fields already exist) |
| `packages/engine/src/agents/mcts/node.ts` | Add `nodeKind`, `decisionPlayer`, `partialMove`, `decisionBinding` fields |
| `packages/engine/src/agents/mcts/node-pool.ts` | Reset new fields |
| `packages/engine/src/agents/mcts/decision-expansion.ts` | **NEW**: Decision expansion via `legalChoicesDiscover()`, iterative chooseN with hybrid resolver metadata, widening bypass |
| `packages/engine/src/agents/mcts/decision-key.ts` | **NEW**: MoveKey for decision nodes |
| `packages/engine/src/agents/mcts/search.ts` | Selection loop: decision nodes, visitor events, UCT variant dispatch, forced-sequence integration (already has `shouldStopByConfidence()`, `materializeOrFastPath()`) |
| `packages/engine/src/agents/mcts/isuct.ts` | UCT variant for decision nodes (standard UCT, no availability) |
| `packages/engine/src/agents/mcts/expansion.ts` | Visitor events for expansion failures (already has `expansionApplyMoveFailures` counter) |
| `packages/engine/src/agents/mcts/materialization.ts` | `templateDropped` visitor events (already has `concreteActionIds`, `materializeOrFastPath()`) |
| `packages/engine/src/agents/mcts/rollout.ts` | Boundary-respecting simulation: `completeTemplateMove(partialMove)` at decision boundary, action-boundary cutoff (already has `materializeOrFastPath()`) |
| `packages/engine/src/agents/mcts/mcts-agent.ts` | Pool sizing formula, graceful degradation, decision node post-completion |
| `packages/engine/src/agents/mcts/diagnostics.ts` | Decision node counters already present in `MutableDiagnosticsAccumulator` and `MctsSearchDiagnostics` (from 63MCTSPERROLLFRESEA) — only wire visitor events |
| `packages/engine/src/agents/mcts/index.ts` | Re-export new modules |
| `packages/engine/test/helpers/ci-diagnostics-reporter.ts` | **NEW**: JSONL + console progress reporter for CI |
| `packages/engine/test/helpers/mcts-console-visitor.ts` | **NEW**: Console visitor for local dev |
| `.github/workflows/engine-mcts-*.yml` | **ALL 6 FILES**: `MCTS_DIAGNOSTICS_DIR` env var + artifact upload |
| `packages/runner/src/worker/game-worker-api.ts` | Visitor → postMessage bridge, time-based throttling |
| `packages/runner/src/store/store-types.ts` | `aiThinking` state slice (full dashboard) |
| `packages/runner/src/store/game-store.ts` | Bridge listener for mctsProgress messages |
| `packages/runner/src/ui/AITurnOverlay.tsx` | Full thinking dashboard UI |
| `packages/runner/src/ui/AITurnOverlay.module.css` | Dashboard styles |
| `packages/runner/src/utils/action-display-names.ts` | **NEW** (if not already present) |

## 7. Existing Infrastructure to Reuse

### Kernel Infrastructure

| What | Where | How |
|------|-------|-----|
| `legalChoicesDiscover()` | `kernel/legal-choices.ts` | Primary API for decision expansion — returns `ChoiceRequest` with `pending`/`complete`/`illegal`/`pendingStochastic` |
| `ChoiceRequest` types | `kernel/types-core.ts` | `ChoiceCompleteRequest`, `ChoicePendingRequest` (with `ChoicePendingChooseOneRequest`, `ChoicePendingChooseNRequest`), `ChoiceStochasticPendingRequest`, `ChoiceIllegalRequest` |
| `ChoiceOption.resolution` | `kernel/types-core.ts` | `ChooseNOptionResolution = 'exact' | 'provisional' | 'stochastic' | 'ambiguous'` — resolution metadata from hybrid resolver |
| `choose-n-option-resolution.ts` | `kernel/choose-n-option-resolution.ts` | Three-tier hybrid resolver: singleton probes + budgeted witness search for large-domain chooseN legality |
| `choose-n-session.ts` | `kernel/choose-n-session.ts` | `ChooseNTemplate` (selection-invariant data) and `ChooseNSession` (caches + current state for efficient recomputation) |
| `choose-n-selected-validation.ts` | `kernel/choose-n-selected-validation.ts` | Pure selection sequence validator for chooseN |
| `completeTemplateMove()` | `kernel/move-completion.ts` | Random completion of partial moves — used at simulation boundary and post-completion |

### MCTS Infrastructure (from 63MCTSPERROLLFRESEA)

| What | Where | How |
|------|-------|-----|
| `mast.ts` | `agents/mcts/mast.ts` | MAST rollout policy (pure module, no kernel deps) |
| `state-cache.ts` | `agents/mcts/state-cache.ts` | Per-search state info cache for terminalResult/legalMoves/rewards |
| `MutableDiagnosticsAccumulator` | `agents/mcts/diagnostics.ts` | Hot-loop metric collection — already has decision node counters (`decisionNodesCreated`, `decisionDepthMax`, `decisionCompletionsInTree`, `decisionCompletionsInRollout`, `decisionIllegalPruned`) |
| `MctsSearchDiagnostics` | `agents/mcts/diagnostics.ts` | Post-hoc summary — has `rootStopReason` (`'none' | 'solver' | 'time' | 'confidence' | 'iterations'`), per-phase timings, kernel-call counters, cache stats, decision counters |
| `concreteActionIds` on `GameDefRuntime` | `agents/mcts/materialization.ts` | Fast-path detection for non-template actions |
| `materializeOrFastPath()` | `agents/mcts/materialization.ts` | Concrete action fast path for materialization |
| `shouldStopByConfidence()` | `agents/mcts/search.ts` | Hoeffding-bound confidence-based root stopping |
| `heuristicPrior` on `MctsNode` | `agents/mcts/node.ts` | Optional heuristic prior at expansion (state nodes only — `null` for decision nodes) |
| Progressive widening | `agents/mcts/expansion.ts` | `shouldExpand()` / `maxChildren()` — reuse for decision nodes with bypass for small sets |
| ISUCT selection | `agents/mcts/isuct.ts` | Used for state nodes; decision nodes use standard UCT variant |
| Node pool | `agents/mcts/node-pool.ts` | Extend for decision node fields |
| Phase 1 defensive catches | `agents/mcts/expansion.ts` | Try/catch + `expansionApplyMoveFailures` counter already in place |

### Test & Runner Infrastructure

| What | Where | How |
|------|-------|-----|
| FITL test infrastructure | `test/e2e/mcts-fitl/` | 10 scenarios, replay, assertions |
| Comlink worker bridge | `runner/src/worker/` | Existing postMessage channel for worker communication |
| AITurnOverlay | `runner/src/ui/AITurnOverlay.tsx` | Existing component to enhance |
| Display name utilities | `runner/src/utils/display-name.ts` | Existing name formatting |

## 8. What Spec 61 Got Right (Carried Forward)

- **Section 2.3 (Defensive Expansion)**: Implemented as Phase 1 pre-work. Try/catch in `selectExpansionCandidate()` with `applyMoveFailure` scoring. Counter `expansionApplyMoveFailures` is in the diagnostics accumulator.
- **Section 2.4 (Defensive Rollout)**: Already present in rollout.ts.
- **Section 2.5 (Diagnostics)**: Diagnostic counters added to `diagnostics.ts`. The `MutableDiagnosticsAccumulator` and `MctsSearchDiagnostics` are fully implemented with per-phase timings, kernel-call counters, cache stats, decision node counters, and derived averages.
- **Section 5 (Test Infrastructure)**: FITL MCTS test helpers, scenarios, and CI workflows created in prior session.

## 9. What Spec 61 Got Wrong (Superseded)

- **Section 2.1 (Retry Logic)**: Mathematically insufficient for 15-step decisions. Replaced by incremental decision expansion.
- **Section 2.2 (Compound Move Completion)**: Still needed but as a kernel-level fix to `legalChoicesDiscover()`, not MCTS-level.
- **Section 2.6 (Budget Tuning)**: `materializationRetriesPerCompletion` config field is unnecessary. Decision nodes eliminate the need for retry budgets.
- **No observability**: Spec 61 had no visitor architecture. All changes were blind. This spec puts observability first.

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Tree depth explodes (5-15 decision nodes per game move, more for iterative chooseN where N picks = N decision nodes) | Progressive widening bounds width. Forced-sequence compression (from 63MCTSPERROLLFRESEA) skips nodes when only 1 option is legal. Visitor events + `decisionDepthMax` diagnostic expose depth. Tune `maxSimulationDepth` to account for decision depth. |
| Node pool exhaustion from many decision nodes | Concrete formula: `max(iterations * decisionDepthMultiplier + 1, legalMoves.length * 4)`. Graceful degradation: skip expansion, backpropagate, emit `poolExhausted` event, continue remaining iterations. Decision nodes are lightweight (no state computation). |
| chooseN iterative expansion cost via hybrid resolver | The three-tier hybrid resolver (singleton probes + witness search) is more expensive per decision step than random sampling. Mitigation: progressive widening limits how many decision nodes are expanded per step; resolver results are cached within the `ChooseNSession`; forced-sequence compression skips nodes when only 1 option passes. The resolver is already proven fast enough for interactive play by 63CHOOPEROPT. |
| `legalChoicesDiscover()` doesn't handle compound SAs | MCTSINCDEC-014 investigates and fixes at the kernel level. |
| Texas Hold'em regression | Simple 1-decision moves create 1-deep decision subtrees. Functionally equivalent to current behavior. MCTSINCDEC-018 validates. |
| Worker postMessage flooding | Time-based throttling at 4 Hz (250ms interval). Snapshot-based, not per-event. |
| Visitor callbacks slow down search | Synchronous, no allocation. Single `if (visitor)` guard. Benchmark with/without visitor. |

## 11. Success Criteria

1. **Observability**: FITL MCTS tests produce structured visitor output showing what the search explored, how decision trees expanded, and why moves were selected or pruned.
2. **Competence**: `RUN_MCTS_FITL_E2E=1` — all 10 FITL scenarios pass (no crashes, reasonable move categories).
3. **Regression**: Texas Hold'em MCTS tests still pass.
4. **Diagnostics**: Decision node counters show successful completions (low `decisionIllegalPruned`, high `decisionCompletionsInTree`).
5. **CI Pipeline**: JSONL diagnostics uploaded as artifacts on all MCTS CI runs.
6. **Visual play**: AITurnOverlay shows a real-time dashboard with progress, top actions, and tree stats during MCTS search.
7. **Clean build**: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test` — all green.

## 12. Non-Goals

- Game-specific MCTS heuristics or evaluation functions
- NPC/bot AI that follows FITL faction rules (Spec 30 scope)
- Backward compatibility with old MCTS config shapes
- Changes to `legalMoves()` enumeration (templates are the intended output)
- GameSpecDoc or visual-config.yaml changes
