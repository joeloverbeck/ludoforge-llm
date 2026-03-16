# Spec 63 — MCTS Runtime Move Classification

**Depends on**: Spec 62 (decision expansion infrastructure)

## 0. Problem Statement

### 0.1 Compile-Time Classification Is Semantically Wrong

The MCTS search classifies moves using `runtime.concreteActionIds` — a compile-time set of action IDs whose definitions have `action.params.length === 0` (no declared template parameters). The search treats these moves as "ready to apply" and routes them to direct expansion via `applyMove()`.

This conflates two distinct properties:

| Property | Level | Determines |
|----------|-------|------------|
| No declared template params | Action definition (compile-time) | Whether the action has top-level template parameters |
| Ready to apply | Move + game state (runtime) | Whether the move can be passed to `applyMove()` without error |

Actions without template params can still have **inline decisions** (`chooseN`/`chooseOne`) embedded in their effect chains. These decisions are discovered at runtime by `legalChoicesEvaluate()`, which correctly returns `kind: 'pending'` — but the MCTS search never asks.

### 0.2 Impact: 9 of 10 FITL MCTS Scenarios Crash

In FITL, the core operations (`rally`, `march`, `attack`, `sweep`, `train`, `patrol`, `govern`, `transport`, `raid`, `advise`) are all "concrete" by definition (`action.params.length === 0`) but have inline decisions (e.g., `$targetSpaces`, `$targetLoCs`, `$transportOrigin`) in their effect chains.

The current search flow:

```
legalMoves() → partition by concreteActionIds
├── "concrete" (rally, march, ...) → fast-path materialization → params: {} → applyMove → CRASH
└── "template" (pivotalEvent, ...) → decision root nodes → incremental expansion → OK
```

All 9 crashing FITL MCTS fast scenarios share this root cause:
- S1–S2: `moveHasIncompleteParams` — move applied with `params: {}`
- S3–S7: `EffectRuntimeError: choiceRuntimeValidationFailed` — same root cause, different error surface
- S8: `SELECTOR_CARDINALITY` — downstream effect of empty params
- S9: Picks `pass` only — all non-pass actions crash during expansion, so only `pass` accumulates visits

The decision expansion infrastructure from Spec 62 (tickets 010–015) works correctly for template moves. The gap is that concrete-but-pending moves are never routed through it.

### 0.3 The Bug Is in Both In-Tree and Rollout Paths

The `concreteActionIds`-based classification appears in two code paths:

1. **In-tree expansion** (`search.ts` lines 319–389): Partitions moves into `concreteMoves` and `templateMoves`. Concrete moves go to `materializeOrFastPath()`. Template moves get decision root nodes.

2. **Rollout simulation** (`rollout.ts` `simulateToCutoff()` line 282–284): Uses `materializeOrFastPath()` which takes the fast path when all moves are from concrete actions — producing unresolvable candidates that crash at `applyMove()`.

The legacy `rollout()` function (line 169) uses `materializeConcreteCandidates()` which does call `legalChoicesEvaluate()` but routes pending moves through random `completeTemplateMove()` — correct for rollout but bypassed by the fast path.

### 0.4 `concreteActionIds` Has No Consumers Outside MCTS

The `concreteActionIds` field on `GameDefRuntime` is consumed exclusively by MCTS code:
- `search.ts` — 3 call sites (partition, visitor event counts, visitor event entries)
- `materialization.ts` — 1 call site (fast path bypass in `materializeOrFastPath`)

No kernel, compiler, simulator, or runner code reads `concreteActionIds`. Removing it has zero impact outside the MCTS agent.

## 1. Architecture

### 1.1 Design Principle: Runtime Classification via `legalChoicesEvaluate`

The kernel already provides the correct classification API: `legalChoicesEvaluate(def, state, move)` returns a `ChoiceRequest` whose `kind` field is the definitive answer:

| `kind` | Meaning | MCTS Treatment |
|--------|---------|----------------|
| `'complete'` | All decisions resolved, move ready to apply | Concrete candidate — direct expansion |
| `'pending'` | Next decision requires player choice | Decision root node — incremental expansion |
| `'illegal'` | Move is illegal in this state | Skip |
| `'pendingStochastic'` | Decision behind a `rollRandom` gate | Skip (unreliable in search) |

This classification is:
- **Game-agnostic**: Works for any game regardless of how actions define their decisions
- **Runtime-accurate**: Reflects the actual move readiness in the current game state
- **Already available**: No new kernel API needed
- **Consistent with Spec 62**: Decision root nodes already use `legalChoicesDiscover()` for expansion, which is the discovery counterpart of `legalChoicesEvaluate()`

### 1.2 Architectural Changes

```
BEFORE (compile-time partition):
  moves → concreteActionIds partition
  ├── concrete → materializeOrFastPath (fast path bypass) → applyMove → CRASH
  └── template → decision root children → expandDecisionNode → OK

AFTER (runtime classification):
  moves → classifyMovesForSearch (legalChoicesEvaluate per move)
  ├── 'complete' → ConcreteMoveCandidate → direct expansion → applyMove → OK
  ├── 'pending' → decision root child → expandDecisionNode → OK
  ├── 'illegal' → skip
  └── 'pendingStochastic' → skip
```

### 1.3 Component Changes

| Component | Change | Rationale |
|-----------|--------|-----------|
| `materialization.ts` | Replace `materializeOrFastPath` + `materializeConcreteCandidates` with `classifyMovesForSearch` | Single classification entry point, no fast-path bypass |
| `search.ts` | Replace `concreteActionIds` partition with `classifyMovesForSearch` call | Unified move routing based on runtime classification |
| `rollout.ts` | Replace `materializeOrFastPath` / `materializeConcreteCandidates` with rollout-specific classification | Rollout uses random completion for pending moves (correct), but must not bypass classification |
| `visitor.ts` | Rename `concreteCount`/`templateCount` → `readyCount`/`pendingCount` in event types | Semantics now reflect move readiness, not action definition structure |
| `gamedef-runtime.ts` | Remove `concreteActionIds` field | No consumers remain; the concept is architecturally misleading |

## 2. `classifyMovesForSearch` — Unified Classification

### 2.1 Interface

```typescript
// packages/engine/src/agents/mcts/materialization.ts

import type { ConcreteMoveCandidate } from './expansion.js';

export interface MoveClassification {
  /** Moves with `legalChoicesEvaluate() → 'complete'` — ready for direct expansion. */
  readonly ready: readonly ConcreteMoveCandidate[];
  /** Moves with `legalChoicesEvaluate() → 'pending'` — need decision root nodes. */
  readonly pending: readonly Move[];
}

/**
 * Classify legal moves by runtime readiness using `legalChoicesEvaluate`.
 *
 * This is the sole move classification entry point for MCTS.  All moves
 * are evaluated against the current game state — no compile-time shortcuts.
 *
 * Ready moves are deduplicated by `MoveKey`.  Pending moves are
 * deduplicated by `actionId` (each pending action gets one decision root).
 *
 * Illegal and pendingStochastic moves are silently dropped.  Moves that
 * throw during classification are dropped with an optional visitor event.
 */
export function classifyMovesForSearch(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
): MoveClassification;
```

### 2.2 Classification Logic

```
for each move in legalMoves:
  try:
    result = legalChoicesEvaluate(def, state, move, undefined, runtime)
  catch:
    emit templateDropped(move.actionId, 'unsatisfiable') if visitor
    continue

  switch result.kind:
    'complete':
      key = canonicalMoveKey(move)
      if key not in seenReadyKeys:
        add to ready
    'pending':
      if move.actionId not in seenPendingActionIds:
        add to pending
    'illegal':
      skip
    'pendingStochastic':
      emit templateDropped(move.actionId, 'stochasticUnresolved') if visitor
      skip
```

**Pending deduplication by `actionId`**: Multiple moves from the same pending action (e.g., two `rally` moves with different `actionClass` values) share the same decision tree structure. Each unique `actionId` gets one decision root. The `actionClass` and other move metadata are preserved on the decision root's `partialMove`.

**Exception**: When multiple moves from the same `actionId` have different initial params (non-empty `params` objects), they are distinct decision roots. Deduplication uses `canonicalMoveKey(move)` to distinguish them.

### 2.3 Rollout Materialization

The rollout phase needs a different treatment: pending moves should be randomly completed (not incrementally expanded), because the rollout does not build tree structure.

```typescript
/**
 * Materialize moves for rollout simulation.
 *
 * Ready moves pass through as-is.  Pending moves are completed via
 * `completeTemplateMove()` (random parameter filling) up to
 * `limitPerTemplate` attempts per move.  This is the correct behavior
 * for the simulation phase where we don't build decision tree nodes.
 */
export function materializeMovesForRollout(
  def: GameDef,
  state: GameState,
  moves: readonly Move[],
  rng: Rng,
  limitPerTemplate: number,
  runtime?: GameDefRuntime,
  visitor?: MctsSearchVisitor,
): { readonly candidates: readonly ConcreteMoveCandidate[]; readonly rng: Rng };
```

This replaces both `materializeConcreteCandidates` and `materializeOrFastPath`. It calls `legalChoicesEvaluate` for every move (no fast-path bypass) and routes:
- `'complete'` → add as concrete candidate
- `'pending'` → complete via `completeTemplateMove()` (existing random completion)
- `'illegal'` / `'pendingStochastic'` → skip

This is essentially the current `materializeConcreteCandidates` logic, minus the flawed fast-path bypass from `materializeOrFastPath`.

## 3. Search Loop Changes

### 3.1 Move Handling in `runOneIteration`

Replace the current partition + materialize + decision-root-creation block (lines 319–389) with:

```
// 1. Classify all legal moves at this state node
const classification = classifyMovesForSearch(def, currentState, movesAtNode, runtime, config.visitor);

// 2. Create decision root children for pending moves (if not already present)
for (const pendingMove of classification.pending) {
  // Same decision root wiring as current template handling (lines 353-388)
  // but now applies to ALL pending moves, not just template ones.
}

// 3. Use classification.ready as the concrete candidate list
const candidates = classification.ready;
const totalCandidateCount = candidates.length + classification.pending.length;
```

This unifies the code path: all moves go through the same classifier regardless of their action definition structure.

### 3.2 Forced-Sequence Compression

The forced-sequence compression check (current lines 401–441) changes from:

```typescript
// BEFORE: only compresses when 1 concrete candidate and 0 templates
if (candidates.length === 1 && templateMoves.length === 0)
```

to:

```typescript
// AFTER: only compresses when 1 ready candidate and 0 pending moves
if (candidates.length === 1 && classification.pending.length === 0)
```

Semantically identical but uses runtime classification instead of compile-time action ID check.

### 3.3 `selectExpansionCandidate` — No Change Needed

The expansion candidate selection (`expansion.ts`) operates on `ConcreteMoveCandidate[]`. Since `classifyMovesForSearch` only puts `'complete'` moves into the ready list, these moves are guaranteed to have all params filled. The `applyMove` call in `selectExpansionCandidate` will succeed.

### 3.4 Rollout Materialization

Replace `materializeOrFastPath` / `materializeConcreteCandidates` calls in both rollout functions with `materializeMovesForRollout`:

- `rollout()` line 169: replace `materializeConcreteCandidates`
- `simulateToCutoff()` line 282: replace `materializeOrFastPath`

## 4. `GameDefRuntime` Changes

### 4.1 Remove `concreteActionIds`

```typescript
// BEFORE
export interface GameDefRuntime {
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
  readonly zobristTable: ZobristTable;
  readonly ruleCardCache: Map<string, RuleCard>;
  readonly concreteActionIds: ReadonlySet<string>;
}

// AFTER
export interface GameDefRuntime {
  readonly adjacencyGraph: AdjacencyGraph;
  readonly runtimeTableIndex: RuntimeTableIndex;
  readonly zobristTable: ZobristTable;
  readonly ruleCardCache: Map<string, RuleCard>;
}
```

Remove the `concreteActionIds` computation from `createGameDefRuntime()`. The concept of "action with no template params" is not useful for move readiness classification and its presence on `GameDefRuntime` is misleading — it suggests that actions in this set produce moves that are ready to apply, which is false.

## 5. Visitor Event Changes

### 5.1 `MctsSearchStartEvent`

```typescript
// BEFORE
export interface MctsSearchStartEvent {
  readonly type: 'searchStart';
  readonly totalIterations: number;
  readonly legalMoveCount: number;
  readonly concreteCount: number;   // ← action-definition-based
  readonly templateCount: number;   // ← action-definition-based
  readonly poolCapacity: number;
}

// AFTER
export interface MctsSearchStartEvent {
  readonly type: 'searchStart';
  readonly totalIterations: number;
  readonly legalMoveCount: number;
  readonly readyCount: number;      // ← runtime classification
  readonly pendingCount: number;    // ← runtime classification
  readonly poolCapacity: number;
}
```

### 5.2 `MctsRootCandidatesEvent`

```typescript
// BEFORE
export interface MctsRootCandidatesEvent {
  readonly type: 'rootCandidates';
  readonly concrete: readonly { actionId: string; moveKey: MoveKey }[];
  readonly templates: readonly { actionId: string }[];
}

// AFTER
export interface MctsRootCandidatesEvent {
  readonly type: 'rootCandidates';
  readonly ready: readonly { actionId: string; moveKey: MoveKey }[];
  readonly pending: readonly { actionId: string }[];
}
```

### 5.3 `MctsTemplateDroppedEvent` — Rename

```typescript
// BEFORE
export interface MctsTemplateDroppedEvent {
  readonly type: 'templateDropped';
  readonly actionId: string;
  readonly reason: 'unsatisfiable' | 'stochasticUnresolved' | 'applyMoveFailed';
}

// AFTER
export interface MctsMoveDroppedEvent {
  readonly type: 'moveDropped';
  readonly actionId: string;
  readonly reason: 'unsatisfiable' | 'stochasticUnresolved' | 'illegal' | 'classificationError';
}
```

The event is no longer template-specific — any move can be dropped during classification.

### 5.4 Console Visitor Update

The `createConsoleVisitor` test helper must be updated to handle the renamed event types and fields. This is a test-only file.

## 6. Removed Concepts

### 6.1 `concreteActionIds` — Removed

The field, its computation in `createGameDefRuntime()`, and all MCTS consumers are removed. No replacement concept is needed — runtime classification via `legalChoicesEvaluate` is the sole source of truth.

### 6.2 `materializeOrFastPath` — Removed

The function and its flawed fast-path bypass are removed. Replaced by `classifyMovesForSearch` (in-tree) and `materializeMovesForRollout` (rollout).

### 6.3 `materializeConcreteCandidates` — Removed

Replaced by `materializeMovesForRollout` which has identical logic but without the compile-time fast-path bypass.

### 6.4 Compile-Time "concrete vs template" Vocabulary in MCTS — Removed

The MCTS codebase stops using the terms "concrete" and "template" for move classification. The new vocabulary is:
- **Ready**: move with `legalChoicesEvaluate() → 'complete'`, can be applied directly
- **Pending**: move with `legalChoicesEvaluate() → 'pending'`, needs decision expansion

The `ConcreteMoveCandidate` type name is retained (it describes a move that IS concrete, i.e., fully resolved) but all upstream classification uses the new vocabulary.

## 7. Testing

### 7.1 Unit Tests: `classifyMovesForSearch`

File: `packages/engine/test/unit/agents/mcts/classify-moves.test.ts`

| Test | Description |
|------|-------------|
| all-complete | All moves return `'complete'` → all in `ready`, none in `pending` |
| all-pending | All moves return `'pending'` → all in `pending`, none in `ready` |
| mixed | Mix of complete, pending, illegal, stochastic → correct partitioning |
| ready-dedup | Duplicate moveKeys in complete set → deduplicated |
| pending-dedup-by-action | Multiple moves from same actionId with same params → single pending entry |
| pending-distinct-params | Multiple moves from same actionId with different params → separate entries |
| classification-error | `legalChoicesEvaluate` throws → move dropped, visitor event emitted |
| empty-input | Empty move list → empty ready and pending |
| illegal-only | All moves illegal → empty ready and pending |
| stochastic-only | All moves pendingStochastic → empty ready and pending, visitor events |

### 7.2 Unit Tests: `materializeMovesForRollout`

File: `packages/engine/test/unit/agents/mcts/materialize-rollout.test.ts`

| Test | Description |
|------|-------------|
| complete-passthrough | Complete moves pass through as candidates |
| pending-completion | Pending moves are completed via `completeTemplateMove` |
| completion-dedup | Multiple completions of same template → deduplicated by moveKey |
| unsatisfiable | Unsatisfiable completions → dropped |
| stochastic-unresolved | Stochastic completions → dropped, RNG consumed |
| rng-determinism | Same seed → same candidates |
| no-fast-path | Moves from "parameterless" actions with inline decisions → correctly classified as pending and completed |

### 7.3 Unit Tests: `GameDefRuntime` Without `concreteActionIds`

File: existing `packages/engine/test/unit/kernel/gamedef-runtime.test.ts`

| Test | Description |
|------|-------------|
| construction | `createGameDefRuntime` succeeds without `concreteActionIds` |
| no-concrete-field | Runtime object has no `concreteActionIds` property |

### 7.4 Integration: FITL MCTS Fast Scenarios

File: `packages/engine/test/e2e/mcts-fitl/fitl-mcts-fast.test.ts`

After the architectural fix, rerun all 10 scenarios with `RUN_MCTS_FITL_E2E=1`:

1. All 10 scenarios complete without crashes
2. No `moveHasIncompleteParams` errors
3. No `SELECTOR_CARDINALITY` errors
4. At least 8 of 10 scenarios select a non-pass action
5. Visitor output shows `decisionNodeCreated` and `decisionCompleted` events
6. `acceptableCategories` tuned based on actual visitor output (ticket 62MCTSSEAVIS-016)

### 7.5 Regression: Existing MCTS Tests

All existing MCTS unit and integration tests must continue to pass:

```bash
pnpm -F @ludoforge/engine test
```

No behavioral change for moves that were already correctly classified (e.g., `pass`, simple events, template moves like `pivotalEvent`).

### 7.6 Edge Cases

| Edge Case | Expected Behavior |
|-----------|-------------------|
| State with only `pass` (complete) moves | All in `ready`, no pending, no decision roots |
| State with all pending moves | All in `pending`, no ready, only decision root children |
| Mixed ready + pending at root | Both concrete and decision root children coexist |
| Single-option forced decision | Decision expansion compresses (no node allocation) |
| Pool exhaustion during decision root creation | Graceful degradation — remaining pending moves skipped |
| Pending move whose first decision has 0 legal options | `expandDecisionNode` returns `'illegal'`, backprop loss |
| Pending move becomes complete after state change (belief sampling) | Classification is per-iteration via sampled state — correct |

## 8. Migration

### 8.1 No Backwards Compatibility

This spec removes `concreteActionIds` from `GameDefRuntime` and renames visitor event fields. No backwards-compatibility shims are provided. All consumers must be updated in the same change.

### 8.2 Affected Exports

| Module | Removed Exports | New/Renamed Exports |
|--------|----------------|---------------------|
| `materialization.ts` | `materializeConcreteCandidates`, `materializeOrFastPath`, `filterAvailableCandidates` | `classifyMovesForSearch`, `materializeMovesForRollout`, `filterAvailableCandidates` (unchanged) |
| `visitor.ts` | `MctsTemplateDroppedEvent` | `MctsMoveDroppedEvent` |
| `gamedef-runtime.ts` | `concreteActionIds` field on `GameDefRuntime` | — |
| `index.ts` (agents) | May re-export changed types | Updated re-exports |

### 8.3 Ticket Decomposition

| Ticket | Scope | Deps |
|--------|-------|------|
| 63RUNTMOVCLASS-001 | Remove `concreteActionIds` from `GameDefRuntime` | None |
| 63RUNTMOVCLASS-002 | Implement `classifyMovesForSearch` with unit tests | 001 |
| 63RUNTMOVCLASS-003 | Implement `materializeMovesForRollout` with unit tests | 001 |
| 63RUNTMOVCLASS-004 | Integrate `classifyMovesForSearch` into `search.ts` | 002 |
| 63RUNTMOVCLASS-005 | Integrate `materializeMovesForRollout` into `rollout.ts` | 003 |
| 63RUNTMOVCLASS-006 | Update visitor event types and console visitor | 004, 005 |
| 63RUNTMOVCLASS-007 | FITL MCTS fast validation + `acceptableCategories` tuning (absorbs 62MCTSSEAVIS-016) | 004, 005, 006 |
| 63RUNTMOVCLASS-008 | Full regression suite + edge case tests | 007 |

## 9. Invariants

1. **Game-agnostic**: No game-specific identifiers, branches, or rule handlers in any production code change.
2. **Single source of truth**: `legalChoicesEvaluate` is the sole API for move readiness classification in MCTS.
3. **No compile-time shortcuts**: Move classification is always based on the current game state, never on action definition metadata alone.
4. **Rollout isolation**: Rollout continues to use random completion (`completeTemplateMove`) for pending moves. Decision tree expansion is in-tree only.
5. **Determinism**: Same seed + same moves = same classification. The `classifyMovesForSearch` function is pure (no RNG consumption).
6. **Zero overhead when not needed**: States where all moves are truly complete (e.g., only `pass` available) produce the same result with slightly more work (one `legalChoicesEvaluate` call per move instead of a set lookup). This is acceptable — correctness over micro-optimization.

## 10. Out of Scope

- Decision expansion improvements (covered by Spec 62)
- Pool sizing tuning (62MCTSSEAVIS-019)
- Strong/default preset tuning (62MCTSSEAVIS-017)
- Texas Hold'em regression (62MCTSSEAVIS-018)
- Runner AI overlay integration (Spec 62 Section 4)
- Performance optimization of `legalChoicesEvaluate` (future work if profiling shows bottleneck)
