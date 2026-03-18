# Spec 65 — MCTS `chooseN` Decision Tree Architecture

**Status**: PENDING

**Depends on**: Spec 62 (MCTS search visitor & incremental decisions), Spec 64 (cost-aware MCTS)

## 0. Problem Statement

### 0.1 The Bug

All FITL MCTS competence tests (interactive, turn, background) fail with:

```
chooseN move param must be an array: $targetSpaces
  context={"reason":"choiceRuntimeValidationFailed","effectType":"chooseN",
  "bind":"$targetSpaces","actualType":"string","value":"binh-tuy-binh-thuan:none"}
```

The kernel's `applyChooseN` (`effects-choice.ts:865`) requires `move.params[bind]` to be an **array**. MCTS decision expansion stores it as a **scalar**.

### 0.2 Root Cause

There are two code paths for resolving `chooseN` decisions, and they produce structurally different move params:

| Path | Code | Wraps to array? | Move param shape |
|------|------|-----------------|------------------|
| RandomAgent / `completeTemplateMove` | `move-completion.ts` → `selectFromChooseN()` | Yes — picks N items, returns `picked[]` | `params.$targetSpaces = ['zone1', 'zone2']` |
| MCTS decision expansion | `decision-expansion.ts` → `advancePartialMove()` | **No** — stores each option as a raw scalar | `params.$targetSpaces = 'zone1'` |

The MCTS decision tree creates one child node per individual `chooseN` option using `advancePartialMove(partialMove, decisionKey, option.value)`, which calls `advanceMainParams`:

```typescript
function advanceMainParams(
  partialMove: Move,
  decisionKey: string,
  value: MoveParamValue,  // scalar for chooseN option
): Move {
  return {
    ...partialMove,
    params: { ...partialMove.params, [decisionKey]: value },
  };
}
```

When `postCompleteSelectedMove` walks the deepest decision node and extracts the move, the `chooseN` binding is still a bare string. The kernel rejects it.

### 0.3 This Is Not a Simple Wrapping Bug

A naive fix — wrapping scalars in arrays at materialization time — would only work for `chooseN` selections of exactly 1 item. The real problem is deeper:

1. **The decision tree cannot represent multi-item `chooseN` selections.** Each child node represents picking one option. There is no mechanism to combine multiple children into a single array-valued move param. A `chooseN` with `min: 2` (e.g., "pick 2 target spaces") is fundamentally unrepresentable in the current tree.

2. **No type metadata survives to materialization.** When `postCompleteSelectedMove` extracts a move from the deepest decision node, it has no knowledge of whether a binding came from `chooseOne` (correctly a scalar) or `chooseN` (should be an array). The `ChoicePendingRequest.type` field is available during expansion but not stored in the tree.

3. **The combinatorial space is different.** `chooseOne` with K options has K children. `chooseN` with K options and `min: 0, max: M` has `sum(C(K,i) for i in 0..M)` possible selections — potentially exponential. The expansion strategy must account for this.

### 0.4 Scope of Impact

FITL uses 176 `chooseN` decisions across its game spec (macros, rules, events). Typical cardinality ranges:

- `min: 0, max: 3` — optional multi-target selections (most common)
- `min: 1, max: 2` — required binary-or-more selections
- `min: 0, max: unbounded` — variable-count selections limited only by available options

The `chooseOne` path works correctly end-to-end (the MCTS E2E tests that pass use `chooseOne` decisions). Only `chooseN` is broken.

### 0.5 Goal

Make MCTS decision expansion correctly handle `chooseN` decisions with arbitrary `min`/`max` cardinality, producing array-valued move params that pass kernel validation.

### 0.6 Non-Goals

- Do not change `chooseN` semantics in the kernel or compiler.
- Do not add game-specific logic to MCTS or the kernel.
- Do not optimize the combinatorial explosion of `chooseN` selections in this spec (that is a future search-quality concern, not a correctness concern).

## 1. Design Constraints

1. **Kernel correctness**: `applyChooseN` requires `Array.isArray(move.params[bind])` with cardinality in `[min, max]`. This is non-negotiable.
2. **Game agnosticism**: The solution must work for any game's `chooseN` decisions, not just FITL's.
3. **Decision tree consistency**: The tree must represent `chooseN` decisions in a way that is structurally sound — not a post-hoc patch on top of a `chooseOne`-shaped tree.
4. **Type awareness at materialization**: When extracting a move from the decision tree, the code must know whether a binding is `chooseOne` (scalar) or `chooseN` (array) to produce the correct param shape.

## 2. Architecture

### 2.1 Store Decision Type Metadata in Decision Nodes

Add a `decisionType` field to `MctsNode` (or to the decision-node subset):

```typescript
/** Type of decision at this node. Null for state nodes. */
decisionType: 'chooseOne' | 'chooseN' | null;
```

This field is populated during `expandDecisionNode` from `request.type` and survives into the tree for use at materialization time.

### 2.2 Array-Valued Move Params for `chooseN` Decision Nodes

When expanding a `chooseN` decision, `advancePartialMove` must produce an **array-valued** move param, not a scalar. Each child node represents adding one option to the selection:

```typescript
// Current (broken):
params[decisionKey] = option.value;  // scalar

// Corrected:
if (request.type === 'chooseN') {
  const existing = partialMove.params[decisionKey];
  const currentArray = Array.isArray(existing) ? existing : [];
  params[decisionKey] = [...currentArray, option.value];  // array
} else {
  params[decisionKey] = option.value;  // scalar
}
```

### 2.3 Incremental `chooseN` Tree Structure

A `chooseN` with `min: 0, max: M` from K options is modeled as an incremental selection tree:

```
Root (partial move, $targets = [])
├── "confirm" child ($targets = [], if min == 0)
├── Child A ($targets = ['zoneA'])
│   ├── "confirm" child ($targets = ['zoneA'], if len >= min)
│   ├── Child B ($targets = ['zoneA', 'zoneB'])
│   │   ├── "confirm" child ($targets = ['zoneA', 'zoneB'])
│   │   └── Child C ($targets = ['zoneA', 'zoneB', 'zoneC'])
│   └── Child C ($targets = ['zoneA', 'zoneC'])
├── Child B ($targets = ['zoneB'])
│   └── ...
└── Child C ($targets = ['zoneC'])
    └── ...
```

Key properties:
- Each level adds one option to the growing array.
- A "confirm" (completion) child is available at any depth where `len(selected) >= min`.
- To avoid duplicate selections (e.g., `['A','B']` vs `['B','A']`), children at each level only include options with index > parent's last-selected index (lexicographic ordering).
- Maximum tree depth for one `chooseN` decision is `max` (or `K` if `max > K`).

**Important**: This tree structure is the sound representation. However, for high-cardinality `chooseN` (many options, large max), the search will naturally be limited by progressive widening — only a few children per node are expanded. The tree structure must be _correct_, but does not need to be _exhaustive_.

### 2.4 Confirm Nodes

When `selected.length >= min`, the decision can be confirmed with the current selection. This is modeled as a special child node that advances to the next decision (or to a state node if no more decisions remain).

The confirm node's move param is the current accumulated array. This is the value that ultimately reaches `applyChooseN`.

The `ChoicePendingChooseNRequest` already carries a `canConfirm: boolean` field that indicates when confirmation is valid. The expansion code should use this.

### 2.5 Materialization: Type-Aware Move Extraction

When `postCompleteSelectedMove` walks the decision subtree to extract a move:

1. If the deepest node's `decisionType === 'chooseN'`, the move param for that binding is already an array (from the corrected expansion).
2. If decisions remain incomplete (the walk didn't reach a confirm/state node), `completeTemplateMove` handles remaining decisions — and its `selectFromChooseN` already produces correct arrays.

No special wrapping logic is needed at materialization time if the tree stores arrays correctly from expansion.

### 2.6 Discovery Re-Query After Each Selection

After each item is added to a `chooseN` selection, the available options may change (e.g., "pick 2 different provinces" — once province A is picked, it's removed from options). The expansion must re-query `legalChoicesDiscover` with the updated partial move to get the remaining valid options.

This is already the pattern for chained decisions — each decision node calls discover on its partial move. For `chooseN`, the partial move's param grows with each level, and the kernel's discovery logic filters already-selected items.

## 3. Files to Change

| File | Change |
|------|--------|
| `packages/engine/src/agents/mcts/node.ts` | Add `decisionType: 'chooseOne' \| 'chooseN' \| null` to `MctsNode` |
| `packages/engine/src/agents/mcts/decision-expansion.ts` | Array-valued params for `chooseN`; incremental selection tree with confirm nodes; re-discover after each selection; pass `request.type` to node creation |
| `packages/engine/src/agents/mcts/mcts-agent.ts` | Update `postCompleteSelectedMove` to handle confirm nodes; ensure array params are preserved during post-completion |
| `packages/engine/src/agents/mcts/node.ts` | Update `createDecisionChildNode` to accept and store `decisionType` |
| `packages/engine/src/agents/mcts/search.ts` | Any selection/backpropagation changes needed for confirm nodes (likely minimal) |

## 4. Out of Scope

- **Combinatorial explosion mitigation**: For `chooseN` with large option counts and high max, the search tree is exponential. Progressive widening already limits expansion. Further optimization (e.g., representative subset sampling, family grouping over `chooseN` selections) is a future search-quality concern.
- **Rollout path**: `completeTemplateMove` already handles `chooseN` correctly via `selectFromChooseN`. No changes needed.
- **Kernel changes**: `applyChooseN` validation is correct. No kernel changes.
- **Compiler changes**: `chooseN` compilation is correct. No compiler changes.

## 5. Verification

### 5.1 Correctness Gates

All tests must pass after implementation:

```bash
pnpm turbo build
pnpm turbo test
pnpm turbo typecheck
pnpm turbo lint
```

### 5.2 Comprehensive Testing Requirements

#### Unit Tests (new file: `packages/engine/test/unit/agents/mcts/decision-expansion-choosen.test.ts`)

1. **Array param storage**: Expand a `chooseN` decision node → verify `partialMove.params[bind]` is an array, not a scalar.
2. **Incremental selection**: Expand `chooseN` with 3 options, max 2 → verify tree structure has correct depth and array accumulation at each level.
3. **Confirm node availability**: `chooseN` with `min: 0` → confirm node available at root level. `chooseN` with `min: 2` → confirm node not available until 2 items selected.
4. **Duplicate prevention**: Children at level 2 only include options with index > parent's selected index (no `['B','A']` when `['A','B']` exists).
5. **Min/max cardinality**: `chooseN` with `min: 1, max: 3` → no confirm at 0 selections, confirm available at 1-3 selections, no further expansion beyond 3.
6. **Empty selection**: `chooseN` with `min: 0` → confirm with empty array `[]` is a valid child.
7. **Single option**: `chooseN` with 1 option, `min: 1, max: 1` → one child with `[option]`, immediate confirm.
8. **Decision type metadata**: Verify `MctsNode.decisionType` is `'chooseN'` for chooseN nodes and `'chooseOne'` for chooseOne nodes. Verify state nodes have `null`.

#### Integration Tests (new file: `packages/engine/test/integration/agents/mcts/mcts-choosen-integration.test.ts`)

9. **End-to-end chooseN via MctsAgent**: Create a minimal game def with a `chooseN` action (pick 1-2 targets from 3 zones). Run `MctsAgent.chooseMove()` → verify returned move has array param, verify `applyMove` succeeds without validation error.
10. **End-to-end chooseN with min:0**: Same game def with `min: 0` → verify MCTS can return a move with empty array `[]`.
11. **Mixed decisions**: Game def with `chooseOne` followed by `chooseN` → verify both decision types resolve correctly in the same move tree.
12. **Post-completion correctness**: Verify `postCompleteSelectedMove` produces a move with array params that pass `legalChoicesEvaluate` validation.
13. **Determinism**: Same seed + same game state → identical chooseN move selection.

#### FITL MCTS E2E (existing tests, must pass)

14. **`fitl-mcts-interactive.test.ts`**: All 19 tests pass (currently 18 fail).
15. **`fitl-mcts-turn.test.ts`**: All 10 tests pass (currently 9 fail).
16. **`fitl-mcts-background.test.ts`**: All 10 tests pass (currently 9 fail).

#### Regression Tests

17. **`chooseOne` unchanged**: Verify existing `chooseOne` decision expansion still produces scalar params and all existing decision-expansion tests pass.
18. **Node pool**: Verify node pool allocation accounts for the deeper trees produced by incremental `chooseN` expansion.
19. **Solver mode**: If solver mode interacts with decision nodes, verify `chooseN` nodes are handled correctly (or explicitly excluded from solver).

### 5.3 Test Fixtures

Create a minimal `chooseN` game def fixture for unit/integration tests:

```typescript
function createChooseNGameDef(): GameDef {
  // 2-player game with one action that has a chooseN decision:
  // "pick 1-2 target zones from 3 available"
  // This is the minimal fixture for testing chooseN decision expansion.
}
```

This fixture must be game-agnostic (no FITL-specific logic) and self-contained.

## 6. Risks and Mitigations

### 6.1 Tree Depth Explosion

**Risk**: `chooseN` with `max: 10` from 20 options creates a tree up to depth 10 per decision, vs depth 1 for `chooseOne`.

**Mitigation**: Progressive widening already limits child expansion at each node. The tree structure is correct but sparse. Monitor node pool exhaustion in FITL stress scenarios.

### 6.2 Confirm Node Semantics

**Risk**: Confirm nodes are a new node type concept that must interact correctly with selection, backpropagation, and solver.

**Mitigation**: Model confirm nodes as ordinary decision nodes whose partial move advances to the next decision (or to a state node). They do not require new node kinds — just a different `advancePartialMove` call that "closes" the `chooseN` binding.

### 6.3 Re-Discovery Cost

**Risk**: Calling `legalChoicesDiscover` at each level of the `chooseN` tree adds classification cost.

**Mitigation**: This is the same pattern used for chained decisions. The cost-aware lazy classification from Spec 64 applies. If profiling reveals this as a bottleneck, caching can be added later.

## 7. Implementation Order

1. Add `decisionType` to `MctsNode` and `createDecisionChildNode`.
2. Modify `advancePartialMove` / `advanceMainParams` to produce array params for `chooseN`.
3. Implement incremental selection tree with confirm nodes in `expandDecisionNode`.
4. Update `postCompleteSelectedMove` to handle the new tree structure.
5. Write unit test fixtures and tests.
6. Write integration tests.
7. Run FITL MCTS E2E tests.
8. Run full verification suite.
