# Spec 62 — MCTS Search Visitor & Incremental Decision Expansion

**Supersedes**: Spec 61 (MCTS Decision-Sequence Materialization)

## 0. Problem Statement

### 0.1 MCTS Cannot Play Deep-Decision Games

MCTS cannot play Fire in the Lake (FITL). 9 of 10 competence scenarios fail: 7 crash with `moveHasIncompleteParams`, 1 crashes with `SELECTOR_CARDINALITY`, 1 picks `pass` (impoverished search). Only coup pacification (simple fully-resolved moves) passes.

**Root cause**: The MCTS materializes complete moves by randomly filling all decision parameters at once via `completeTemplateMove()`. FITL's complex actions have 5-15+ sequential decision steps. Random completion has exponentially low success probability for deep decision trees — even with retries, most completions fail, silently dropping entire action categories from the search.

For 15-step decisions with ~50% per-step validity, `P(all valid) ~ 0.003%`. The retry approach proposed in Spec 61 is mathematically insufficient. The correct solution is **incremental decision expansion** — treating each decision step as a separate MCTS tree node using the existing `legalChoicesDiscover()` API.

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
  | MctsRolloutCompleteEvent
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

export interface MctsRolloutCompleteEvent {
  readonly type: 'rolloutComplete';
  readonly depth: number;
  readonly reachedTerminal: boolean;
}

export interface MctsSearchCompleteEvent {
  readonly type: 'searchComplete';
  readonly iterations: number;
  readonly stopReason: string;
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

### 2.3 Why a Single `onEvent` Method

A single `onEvent(event)` method with a discriminated union is preferred over per-event callbacks (`onIterationStart`, `onExpansion`, etc.) because:

1. **Serialization**: The worker bridge can forward `MctsSearchEvent` objects directly via `postMessage` without adapting per-callback.
2. **Extensibility**: New event types can be added without changing the `MctsSearchVisitor` interface.
3. **Filtering**: Consumers use `switch (event.type)` to handle only events they care about.
4. **Testing**: A single `events: MctsSearchEvent[]` array captures everything for assertions.

### 2.4 Config Integration

```typescript
// Addition to MctsConfig
export interface MctsConfig {
  // ... existing fields ...

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

#### 3.2.1 Decision Node Selection Protocol

Decision nodes require different selection behavior than state nodes:

- **State nodes** → ISUCT (information-set UCT, availability-aware). This is the existing behavior: UCB uses `child.availability` in the denominator.
- **Decision nodes** → Standard UCT using `parent.visits` in the denominator, NOT `child.availability`. Decision nodes do not represent hidden information — the deciding player always knows all their options.

Key invariants for decision node traversal:

1. **Decision nodes do NOT compute or store game state.** The game state is unchanged throughout a decision subtree — it lives on the nearest ancestor state node.
2. **`applyMove` is called exactly once** when a decision sequence completes (i.e., `legalChoicesDiscover()` returns `kind: 'complete'`). The completed move is applied to the ancestor state node's game state to produce the child state node.
3. **Selection through a decision subtree = pure tree traversal.** No kernel calls, no state computation — just walk down the tree using UCT scores on the decision options.
4. **Rollout from a decision node**: Complete remaining decisions randomly using `completeDecisionIncrementally()`, then apply the completed move once, then continue rollout normally from the resulting state.
5. **Exploring player**: Read from `ChoicePendingRequest.decisionPlayer` (the player whose decision is pending), not from the game state's current player.

### 3.3 Decision Expansion Module

Create `decision-expansion.ts` that wraps `legalChoicesDiscover()`:

- Given a decision node + game state, call `legalChoicesDiscover(def, state, partialMove)`
- Handle `pending` → each `ChoiceOption` becomes a child candidate
- Handle `complete` → apply the fully-resolved move → state node child
- Handle `illegal` → prune this path (backpropagate loss)
- Handle `pendingStochastic` → chance node with weighted outcomes

#### chooseN Handling (Atomic Sampling)

`chooseN` decisions (e.g., "choose 2-3 provinces") are handled as **atomic sampling**, NOT iterative selection:

- The entire `chooseN` = a single decision node
- Children = complete selections sampled via Fisher-Yates shuffle
- `sampleChooseNCompletion(options: string[], min: number, max: number, rng: Rng): string[]` generates one complete selection
- The decision key **sorts** the selection for deduplication (so `[A,B]` and `[B,A]` map to the same child)
- Progressive widening applies normally to the sampling — each expansion samples a new complete selection

This avoids combinatorial explosion. For `choose 3 from 10`, iterative selection would create `10 * 9 * 8 = 720` leaf paths. Atomic sampling creates one child per sampled combination, bounded by progressive widening.

#### Progressive Widening Bypass

For decision nodes where `optionCount <= decisionWideningCap` (default 12), bypass progressive widening entirely — expand all options immediately. This ensures that small decision spaces (e.g., "choose faction" with 4 options) are fully explored without the overhead of progressive widening.

Progressive widening only activates for:
- Decision nodes with `optionCount > decisionWideningCap`
- chooseN atomic sampling (where the effective option space is combinatorial)

### 3.4 Decision Key Module

Create `decision-key.ts` for MoveKey generation at decision nodes:

- Encode `actionId + binding name + binding value` so UCB deduplication works
- Template root key encodes action category (e.g., `D:rally`) so all rally decision subtrees share UCB statistics

### 3.5 Search Loop Integration

Modify `search.ts` selection loop:

1. **State nodes with template moves**: Partition `legalMoves()` into concrete (state node children) and templates (decision root children). Templates get `legalChoicesDiscover()` for first decision.
2. **Decision nodes**: Use `expandDecisionNode()` instead of `legalMoves()` + materialization. Progressive widening applies identically (subject to the bypass rule in Section 3.3).
3. **Decision completion**: When `legalChoicesDiscover()` returns `complete`, apply the move → create state node child → proceed to simulation.
4. **Decision node at simulation boundary**: If selection ends on a decision node, complete remaining decisions randomly via `completeDecisionIncrementally()` before rollout.

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

### 3.7 Rollout Integration

Modify `rollout.ts`:

- When `materializeConcreteCandidates()` returns 0 candidates (template completion failed), fall back to `completeDecisionIncrementally()` which uses step-by-step `legalChoicesDiscover()`.
- This replaces `completeTemplateMove()` as the primary completion strategy for template moves in rollout.

### 3.8 Visitor Integration in Decision Expansion

Every decision step emits visitor events:

- `decisionNodeCreated` when a new decision node is allocated
- `decisionCompleted` when a decision sequence resolves to a complete move
- `decisionIllegal` when a path is pruned
- `templateDropped` when a template move is dropped before entering the tree
- `applyMoveFailure` when a completed move fails at `applyMove()`

This gives full visibility into the decision expansion process, enabling test assertions like "MCTS explored at least 3 rally subtrees" or "no decision paths were illegally pruned."

### 3.9 Post-Completion for Decision Nodes

When `selectRootDecision()` returns a decision node child (template move was the best root action), `postCompleteSelectedMove()` must:

1. Follow the highest-visit path through the decision subtree
2. Find the deepest explored partial move
3. Complete remaining decisions via `completeDecisionIncrementally()`
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
        console.log(`[MCTS] ${this.scenarioName}: complete in ${event.elapsedMs.toFixed(0)}ms, ${event.iterations} iterations, best=${event.bestActionId} (${event.bestVisits} visits)`);
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
| MCTSINCDEC-001 | Create `MctsSearchVisitor` interface and `MctsSearchEvent` discriminated union. Includes `searchStart`, `iterationBatch`, `templateDropped` event types (replaces per-iteration events). | `visitor.ts` (new) |
| MCTSINCDEC-002 | Add `visitor?: MctsSearchVisitor`, `decisionWideningCap?: number`, and `decisionDepthMultiplier?: number` to `MctsConfig`. Update `validateMctsConfig()`: pass visitor through without validation, validate numeric fields with defaults. | `config.ts` |
| MCTSINCDEC-003 | Wire visitor into `runSearch()` and `runOneIteration()`: emit `searchStart` once at beginning, accumulate iteration data, emit `iterationBatch` every 50 iterations, emit `searchComplete`. | `search.ts` |
| MCTSINCDEC-004 | Wire visitor into `selectExpansionCandidate()` defensive catch: emit `applyMoveFailure`. Wire into materialization: emit `templateDropped`. Wire into existing search.ts defensive catches from Phase 1. | `expansion.ts`, `search.ts`, `materialization.ts` |
| MCTSINCDEC-005 | Create `CiDiagnosticsReporter` test helper (JSONL + console progress). Also create `ConsoleVisitor` for local development. Use both in FITL MCTS test helpers. | `test/helpers/ci-diagnostics-reporter.ts` (new), `test/helpers/mcts-console-visitor.ts` (new), `fitl-mcts-test-helpers.ts` |
| MCTSINCDEC-006 | Run FITL MCTS fast tests with `ConsoleVisitor`. Record output. Diagnose why scenarios crash or fail. This establishes the observability baseline. | test run + analysis |

### Phase 2: Decision Node Architecture

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-007 | Extend `MctsNode` with `nodeKind: 'state' \| 'decision'`, `decisionPlayer: PlayerId \| null`, `partialMove`, and `decisionBinding` fields. Update `createRootNode()`, `createChildNode()`, pool reset. Add `createDecisionChildNode()` factory. Default `nodeKind` to `'state'` for all existing node creation. | `node.ts`, `node-pool.ts` |
| MCTSINCDEC-008 | Create `decision-expansion.ts`: `expandDecisionNode()` using `legalChoicesDiscover()`. Handle `pending`, `complete`, `illegal`, `pendingStochastic`. Implement atomic chooseN via `sampleChooseNCompletion()` with sorted dedup keys. Implement progressive widening bypass for small option sets (`<= decisionWideningCap`). Include `completeDecisionIncrementally()` for rollout. | `decision-expansion.ts` (new) |
| MCTSINCDEC-009 | Create `decision-key.ts`: `decisionNodeKey()` and `templateDecisionRootKey()` for MoveKey generation. | `decision-key.ts` (new) |
| MCTSINCDEC-010 | Modify `search.ts` selection loop: detect `nodeKind`, use standard UCT (not ISUCT) at decision nodes (`parent.visits` denominator, no availability), implement no-`applyMove` traversal through decision subtrees, call `applyMove` exactly once on decision completion. Emit visitor events (`decisionNodeCreated`, `decisionCompleted`, `decisionIllegal`). Read exploring player from `ChoicePendingRequest.decisionPlayer`. | `search.ts`, `isuct.ts` |
| MCTSINCDEC-011 | Modify `rollout.ts`: fall back to `completeDecisionIncrementally()` when materialization returns 0 candidates. Emit `decisionCompletionsInRollout` diagnostic. | `rollout.ts` |
| MCTSINCDEC-012 | Update `mcts-agent.ts`: implement pool capacity formula `max(iterations * decisionDepthMultiplier + 1, legalMoves.length * 4)`. Implement graceful degradation on pool exhaustion (skip expansion, backpropagate, emit event, continue). Update `postCompleteSelectedMove()` to handle decision node children at root. | `mcts-agent.ts` |
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
| `packages/engine/src/agents/mcts/config.ts` | Add `visitor`, `decisionWideningCap`, `decisionDepthMultiplier` fields |
| `packages/engine/src/agents/mcts/node.ts` | Add `nodeKind`, `decisionPlayer`, `partialMove`, `decisionBinding` fields |
| `packages/engine/src/agents/mcts/node-pool.ts` | Reset new fields |
| `packages/engine/src/agents/mcts/decision-expansion.ts` | **NEW**: Decision expansion via `legalChoicesDiscover()`, atomic chooseN, widening bypass |
| `packages/engine/src/agents/mcts/decision-key.ts` | **NEW**: MoveKey for decision nodes |
| `packages/engine/src/agents/mcts/search.ts` | Selection loop: decision nodes, visitor events, UCT variant dispatch |
| `packages/engine/src/agents/mcts/isuct.ts` | UCT variant for decision nodes (standard UCT, no availability) |
| `packages/engine/src/agents/mcts/expansion.ts` | Visitor events for expansion failures |
| `packages/engine/src/agents/mcts/materialization.ts` | `templateDropped` visitor events |
| `packages/engine/src/agents/mcts/rollout.ts` | Incremental decision fallback |
| `packages/engine/src/agents/mcts/mcts-agent.ts` | Pool sizing formula, graceful degradation, decision node post-completion |
| `packages/engine/src/agents/mcts/diagnostics.ts` | Decision node counters |
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

| What | Where | How |
|------|-------|-----|
| `legalChoicesDiscover()` | `kernel/legal-choices.ts:893` | Primary API for decision expansion |
| `ChoiceRequest` types | `kernel/types-core.ts:675` | `complete`, `pending`, `pendingStochastic`, `illegal` |
| Progressive widening | `agents/mcts/expansion.ts` | Reuse `shouldExpand()` / `maxChildren()` for decision nodes (with bypass for small sets) |
| ISUCT selection | `agents/mcts/isuct.ts` | Used for state nodes; decision nodes use standard UCT variant |
| Node pool | `agents/mcts/node-pool.ts` | Extend for decision node fields |
| Phase 1 defensive catches | `agents/mcts/expansion.ts`, `diagnostics.ts` | Try/catch + counters already in place |
| FITL test infrastructure | `test/e2e/mcts-fitl/` | 10 scenarios, replay, assertions |
| Comlink worker bridge | `runner/src/worker/` | Existing postMessage channel for worker communication |
| AITurnOverlay | `runner/src/ui/AITurnOverlay.tsx` | Existing component to enhance |
| Display name utilities | `runner/src/utils/display-name.ts` | Existing name formatting |

## 8. What Spec 61 Got Right (Carried Forward)

- **Section 2.3 (Defensive Expansion)**: Implemented in this session as Phase 1. Try/catch in `selectExpansionCandidate()` with `applyMoveFailure` scoring.
- **Section 2.4 (Defensive Rollout)**: Already present in rollout.ts (lines 142-152, 292-301).
- **Section 2.5 (Diagnostics)**: Diagnostic counters added to `diagnostics.ts` in this session.
- **Section 5 (Test Infrastructure)**: FITL MCTS test helpers, scenarios, and CI workflows created in prior session.

## 9. What Spec 61 Got Wrong (Superseded)

- **Section 2.1 (Retry Logic)**: Mathematically insufficient for 15-step decisions. Replaced by incremental decision expansion.
- **Section 2.2 (Compound Move Completion)**: Still needed but as a kernel-level fix to `legalChoicesDiscover()`, not MCTS-level.
- **Section 2.6 (Budget Tuning)**: `materializationRetriesPerCompletion` config field is unnecessary. Decision nodes eliminate the need for retry budgets.
- **No observability**: Spec 61 had no visitor architecture. All changes were blind. This spec puts observability first.

## 10. Risks

| Risk | Mitigation |
|------|------------|
| Tree depth explodes (5-15 decision nodes per game move) | Progressive widening bounds width. Visitor events + `decisionDepthMax` diagnostic expose depth. Tune `maxSimulationDepth` to account for decision depth. |
| Node pool exhaustion from many decision nodes | Concrete formula: `max(iterations * decisionDepthMultiplier + 1, legalMoves.length * 4)`. Graceful degradation: skip expansion, backpropagate, emit `poolExhausted` event, continue remaining iterations. Decision nodes are lightweight (no state computation). |
| chooseN combinatorial explosion | Atomic sampling via Fisher-Yates avoids iterative `n * (n-1) * ... ` branching. Progressive widening bounds the number of sampled combinations. Sorted keys deduplicate equivalent selections. |
| `legalChoicesDiscover()` doesn't handle compound SAs | MCTSINCDEC-014 investigates and fixes at the kernel level. |
| `legalChoicesDiscover()` performance | Already used by agents in interactive play. Profile. If hot, cache prepared context. |
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
