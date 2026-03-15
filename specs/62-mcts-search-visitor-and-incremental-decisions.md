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
         (console)       (counters)      (postMessage)
              │               │               │
              │               │          Runner Store
              │               │               │
              │               │          AITurnOverlay
              │               │          "Considering rally
              │               │           in Saigon..."
              │               │
         Test Assertions  Tuning Data
```

1. **`MctsSearchVisitor`** — A game-agnostic callback interface on `MctsConfig` that receives structured events during search. Zero overhead when not provided.

2. **Incremental decision expansion** — Treats each decision step as a separate MCTS tree node using `legalChoicesDiscover()`, with visitor callbacks at each step for full observability.

3. **Runner integration** — The worker bridge translates visitor events into `postMessage` calls that the Zustand store surfaces to the `AITurnOverlay` component as human-readable "thinking" text.

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
  | MctsIterationStartEvent
  | MctsIterationCompleteEvent
  | MctsExpansionEvent
  | MctsDecisionNodeCreatedEvent
  | MctsDecisionCompletedEvent
  | MctsDecisionIllegalEvent
  | MctsApplyMoveFailureEvent
  | MctsPoolExhaustedEvent
  | MctsRolloutCompleteEvent
  | MctsSearchCompleteEvent
  | MctsRootCandidatesEvent;

export interface MctsIterationStartEvent {
  readonly type: 'iterationStart';
  readonly iteration: number;
}

export interface MctsIterationCompleteEvent {
  readonly type: 'iterationComplete';
  readonly iteration: number;
  readonly rootChildCount: number;
  readonly elapsedMs: number;
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
}
```

The `visitor` field is excluded from `validateMctsConfig()` validation (it's a callback, not a tuneable parameter) and from `Object.freeze()` on the config (callbacks are inherently mutable references). It is not included in preset definitions.

## 3. Incremental Decision Expansion

### 3.1 Rationale (Superseding Spec 61 Section 2.1)

Spec 61 proposed retry logic for `completeTemplateMove()`. This is mathematically insufficient for deep decision trees. The correct approach is **incremental decision expansion**: each decision step becomes a tree node, and MCTS learns which early decisions are good through standard tree search.

This is the standard MCTS technique for games with compound actions (Browne et al. survey, Arimaa sub-move integration).

### 3.2 Decision Node Architecture

Add optional fields to `MctsNode` rather than a new type:

```typescript
export interface MctsNode {
  // ... existing fields unchanged ...

  /** Non-null for decision nodes: the partial move being built. */
  partialMove: Move | null;

  /** Non-null for decision nodes: the binding name chosen to reach this node. */
  decisionBinding: string | null;
}
```

- `partialMove === null` -> state node (current behavior)
- `partialMove !== null` -> decision node (mid-decision, game state unchanged)

### 3.3 Decision Expansion Module

Create `decision-expansion.ts` that wraps `legalChoicesDiscover()`:

- Given a decision node + game state, call `legalChoicesDiscover(def, state, partialMove)`
- Handle `pending` -> each `ChoiceOption` becomes a child candidate
- Handle `complete` -> apply the fully-resolved move -> state node child
- Handle `illegal` -> prune this path (backpropagate loss)
- Handle `pendingStochastic` -> chance node with weighted outcomes
- Handle `chooseN` as iterative selection (add item / confirm)

### 3.4 Decision Key Module

Create `decision-key.ts` for MoveKey generation at decision nodes:

- Encode `actionId + binding name + binding value` so UCB deduplication works
- Template root key encodes action category (e.g., `D:rally`) so all rally decision subtrees share UCB statistics

### 3.5 Search Loop Integration

Modify `search.ts` selection loop:

1. **State nodes with template moves**: Partition `legalMoves()` into concrete (state node children) and templates (decision root children). Templates get `legalChoicesDiscover()` for first decision.
2. **Decision nodes**: Use `expandDecisionNode()` instead of `legalMoves()` + materialization. Progressive widening applies identically.
3. **Decision completion**: When `legalChoicesDiscover()` returns `complete`, apply the move -> create state node child -> proceed to simulation.
4. **Decision node at simulation boundary**: If selection ends on a decision node, complete remaining decisions randomly via `completeDecisionIncrementally()` before rollout.

### 3.6 Rollout Integration

Modify `rollout.ts`:

- When `materializeConcreteCandidates()` returns 0 candidates (template completion failed), fall back to `completeDecisionIncrementally()` which uses step-by-step `legalChoicesDiscover()`.
- This replaces `completeTemplateMove()` as the primary completion strategy for template moves in rollout.

### 3.7 Visitor Integration in Decision Expansion

Every decision step emits visitor events:

- `decisionNodeCreated` when a new decision node is allocated
- `decisionCompleted` when a decision sequence resolves to a complete move
- `decisionIllegal` when a path is pruned
- `applyMoveFailure` when a completed move fails at `applyMove()`

This gives full visibility into the decision expansion process, enabling test assertions like "MCTS explored at least 3 rally subtrees" or "no decision paths were illegally pruned."

### 3.8 Post-Completion for Decision Nodes

When `selectRootDecision()` returns a decision node child (template move was the best root action), `postCompleteSelectedMove()` must:

1. Follow the highest-visit path through the decision subtree
2. Find the deepest explored partial move
3. Complete remaining decisions via `completeDecisionIncrementally()`
4. Fall back to `completeTemplateMove()` on original legal moves if needed

## 4. Runner Integration

### 4.1 Worker Bridge

The worker creates a visitor that batches events and sends them to the main thread via `postMessage`:

```typescript
// In createGameWorker().requestAgentMove():
const visitor: MctsSearchVisitor = {
  onEvent(event) {
    // Throttle: only forward meaningful events at ~4 Hz
    if (shouldForward(event)) {
      self.postMessage({ type: 'mcts-event', event });
    }
  },
};

const agent = new MctsAgent({ ...resolvePreset(preset), visitor });
```

Throttling ensures the main thread isn't flooded. Forward:
- `iterationComplete` every ~50 iterations
- `expansion` events for the root level only
- `searchComplete` always
- `rootCandidates` once at the start

### 4.2 Bridge Adapter

The game bridge (`packages/runner/src/bridge/`) listens for `mcts-event` messages and updates the Zustand store:

```typescript
// New store slice: aiThinking
interface AiThinkingState {
  /** Current human-readable thinking text, or null when not thinking. */
  readonly thinkingText: string | null;
  /** Iteration progress (0-1). */
  readonly progress: number;
  /** Most-visited root actions with visit percentages. */
  readonly topActions: readonly { actionId: string; displayName: string; visitPct: number }[];
}
```

### 4.3 AITurnOverlay Enhancement

The existing `AITurnOverlay` component gains a thinking text display:

```
┌──────────────────────────────────┐
│           AI Turn                │
│        NVA (Player 3)            │
│                                  │
│   Considering: Rally (45%)       │
│   Also exploring: March (30%)    │
│   Progress: ████████░░ 80%       │
│                                  │
│  ● ● ●                          │
│                                  │
│         [ Skip ]                 │
└──────────────────────────────────┘
```

The display names come from `GameDef.actions[].id` mapped through the runner's display name utilities. This is game-agnostic — every game's actions get human-readable names based on the GameDef metadata.

### 4.4 Comlink Considerations

The visitor runs inside the Web Worker. Comlink does not support streaming callbacks for an in-progress `requestAgentMove()` call. Two options:

**Option A (recommended)**: Use raw `postMessage` / `addEventListener` alongside Comlink for the streaming event channel. The `requestAgentMove()` call remains a Comlink RPC that returns the final result; thinking events flow through a separate channel.

**Option B**: Expose a `subscribeToMctsEvents(callback)` method on the worker API that the bridge calls before `requestAgentMove()`. This is cleaner but requires Comlink proxy support for callbacks.

The spec recommends Option A for simplicity and proven reliability.

## 5. Implementation Plan

### Phase 1: Search Visitor Foundation

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-001 | Create `MctsSearchVisitor` interface and `MctsSearchEvent` discriminated union. | `visitor.ts` (new) |
| MCTSINCDEC-002 | Add `visitor?: MctsSearchVisitor` to `MctsConfig`. Update `validateMctsConfig()` to pass it through without validation. | `config.ts` |
| MCTSINCDEC-003 | Wire visitor into `runSearch()` and `runOneIteration()`: emit `iterationStart`, `iterationComplete`, `searchComplete`. | `search.ts` |
| MCTSINCDEC-004 | Wire visitor into `selectExpansionCandidate()` defensive catch: emit `applyMoveFailure`. Wire into existing search.ts defensive catches from Phase 1. | `expansion.ts`, `search.ts` |
| MCTSINCDEC-005 | Create `ConsoleVisitor` test helper that logs events with timestamps. Use it in FITL MCTS test helpers to see what the search is doing. | `test/helpers/mcts-console-visitor.ts` (new), `fitl-mcts-test-helpers.ts` |
| MCTSINCDEC-006 | Run FITL MCTS fast tests with `ConsoleVisitor`. Record output. Diagnose why scenarios crash or fail. This establishes the observability baseline. | test run + analysis |

### Phase 2: Decision Node Architecture

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-007 | Extend `MctsNode` with `partialMove` and `decisionBinding` fields. Update `createRootNode()`, `createChildNode()`, pool reset. Add `createDecisionChildNode()` factory. | `node.ts`, `node-pool.ts` |
| MCTSINCDEC-008 | Create `decision-expansion.ts`: `expandDecisionNode()` using `legalChoicesDiscover()`. Handle `pending`, `complete`, `illegal`, `pendingStochastic`. Include `completeDecisionIncrementally()` for rollout. | `decision-expansion.ts` (new) |
| MCTSINCDEC-009 | Create `decision-key.ts`: `decisionNodeKey()` and `templateDecisionRootKey()` for MoveKey generation. | `decision-key.ts` (new) |
| MCTSINCDEC-010 | Modify `search.ts` selection loop: detect decision nodes, use decision expansion, handle template -> decision creation, decision -> state completion. Emit visitor events (`decisionNodeCreated`, `decisionCompleted`, `decisionIllegal`). | `search.ts` |
| MCTSINCDEC-011 | Modify `rollout.ts`: fall back to `completeDecisionIncrementally()` when materialization returns 0 candidates. Emit `decisionCompletionsInRollout` diagnostic. | `rollout.ts` |
| MCTSINCDEC-012 | Update `mcts-agent.ts`: adjust pool capacity formula for decision nodes. Update `postCompleteSelectedMove()` to handle decision node children at root. | `mcts-agent.ts` |
| MCTSINCDEC-013 | Wire `rootCandidates` visitor event at the start of each iteration (concrete vs template partitioning). | `search.ts` |

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
| MCTSINCDEC-020 | Final verification: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`. | all |

### Phase 5: Runner Integration

| Ticket | Deliverable | Files |
|--------|-------------|-------|
| MCTSINCDEC-021 | Add `mcts-event` postMessage channel in `createGameWorker()`. Create visitor that throttles and forwards events. | `game-worker-api.ts` |
| MCTSINCDEC-022 | Add `aiThinking` state slice to Zustand store. Bridge listens for `mcts-event` messages and updates store. | `store-types.ts`, `game-store.ts` |
| MCTSINCDEC-023 | Create display name mapping utility: `actionId` -> human-readable name from `GameDef.actions`. | `utils/action-display-names.ts` (new) |
| MCTSINCDEC-024 | Enhance `AITurnOverlay` to show thinking text, progress bar, top action candidates. | `AITurnOverlay.tsx`, `AITurnOverlay.module.css` |
| MCTSINCDEC-025 | Verify visual play with FITL. MCTS should show meaningful thinking text during search. | manual test |

## 6. Files to Modify

| File | Changes |
|------|---------|
| `packages/engine/src/agents/mcts/visitor.ts` | **NEW**: `MctsSearchVisitor`, `MctsSearchEvent` types |
| `packages/engine/src/agents/mcts/config.ts` | Add `visitor` field |
| `packages/engine/src/agents/mcts/node.ts` | Add `partialMove`, `decisionBinding` fields |
| `packages/engine/src/agents/mcts/node-pool.ts` | Reset new fields |
| `packages/engine/src/agents/mcts/decision-expansion.ts` | **NEW**: Decision expansion via `legalChoicesDiscover()` |
| `packages/engine/src/agents/mcts/decision-key.ts` | **NEW**: MoveKey for decision nodes |
| `packages/engine/src/agents/mcts/search.ts` | Selection loop: decision nodes, visitor events |
| `packages/engine/src/agents/mcts/expansion.ts` | Visitor events for expansion failures (already has Phase 1 try/catch) |
| `packages/engine/src/agents/mcts/rollout.ts` | Incremental decision fallback |
| `packages/engine/src/agents/mcts/mcts-agent.ts` | Pool sizing, decision node post-completion |
| `packages/engine/src/agents/mcts/diagnostics.ts` | Decision node counters (Phase 1 prep already in place) |
| `packages/engine/src/agents/mcts/index.ts` | Re-export new modules |
| `packages/runner/src/worker/game-worker-api.ts` | Visitor -> postMessage bridge |
| `packages/runner/src/store/store-types.ts` | `aiThinking` state slice |
| `packages/runner/src/store/game-store.ts` | Bridge listener for mcts-event |
| `packages/runner/src/ui/AITurnOverlay.tsx` | Thinking text, progress, top actions |

## 7. Existing Infrastructure to Reuse

| What | Where | How |
|------|-------|-----|
| `legalChoicesDiscover()` | `kernel/legal-choices.ts:893` | Primary API for decision expansion |
| `ChoiceRequest` types | `kernel/types-core.ts:675` | `complete`, `pending`, `pendingStochastic`, `illegal` |
| Progressive widening | `agents/mcts/expansion.ts` | Reuse `shouldExpand()` / `maxChildren()` for decision nodes |
| ISUCT selection | `agents/mcts/isuct.ts` | Works unchanged — decision nodes are just tree nodes |
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
| Node pool exhaustion from many decision nodes | Visitor emits `poolExhausted` event. Adjust pool formula based on observed decision depth. Decision nodes are lightweight (no state computation). |
| `legalChoicesDiscover()` doesn't handle compound SAs | MCTSINCDEC-014 investigates and fixes at the kernel level. |
| `legalChoicesDiscover()` performance | Already used by agents in interactive play. Profile. If hot, cache prepared context. |
| Texas Hold'em regression | Simple 1-decision moves create 1-deep decision subtrees. Functionally equivalent to current behavior. MCTSINCDEC-018 validates. |
| Worker postMessage flooding | Throttle to ~4 Hz. Only forward root-level and milestone events. |
| Visitor callbacks slow down search | Synchronous, no allocation. Single `if (visitor)` guard. Benchmark with/without visitor. |

## 11. Success Criteria

1. **Observability**: FITL MCTS tests produce structured visitor output showing what the search explored, how decision trees expanded, and why moves were selected or pruned.
2. **Competence**: `RUN_MCTS_FITL_E2E=1` — all 10 FITL scenarios pass (no crashes, reasonable move categories).
3. **Regression**: Texas Hold'em MCTS tests still pass.
4. **Diagnostics**: Decision node counters show successful completions (low `decisionIllegalPruned`, high `decisionCompletionsInTree`).
5. **Visual play**: AITurnOverlay shows meaningful thinking text during MCTS search.
6. **Clean build**: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test` — all green.

## 12. Non-Goals

- Game-specific MCTS heuristics or evaluation functions
- NPC/bot AI that follows FITL faction rules (Spec 30 scope)
- Backward compatibility with old MCTS config shapes
- Changes to `legalMoves()` enumeration (templates are the intended output)
- GameSpecDoc or visual-config.yaml changes
