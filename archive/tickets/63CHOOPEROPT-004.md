# 63CHOOPEROPT-004: Budgeted witness search for unresolved chooseN options

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — choose-n-option-resolution.ts
**Deps**: 63CHOOPEROPT-001, 63CHOOPEROPT-002, 63CHOOPEROPT-003

## Problem

After the singleton probe pass, some options remain unresolved (satisfiable but not yet confirmable). The witness search finds one confirmable completion per option to prove it `legal`, or exhausts the subtree to prove it `illegal`, or exhausts the budget and marks it `provisional`.

## Assumption Reassessment (2026-03-15)

1. A "witness" is a selection S where: `currentSelected` is subset, the target option is in S, `|S|` is in `[min, max]`, and probing S yields a legal completion surface.
2. The search needs only ONE witness per option — stop as soon as found.
3. `MAX_CHOOSE_N_TOTAL_WITNESS_NODES` is the global budget across all options.
4. Search order must be deterministic (spec 4.6): active tier order, smaller continuation domain first, normalized domain order as tiebreaker.

## Architecture Check

1. The witness search is a bounded depth-first search over subset space. Each node probes a concrete selected set.
2. Reuses the discover-only probe helper from 63CHOOPEROPT-003.
3. Probe memoization via `Map<SelectionKey, ProbeSummary>` — same key format used later by session caches.
4. No game-specific logic. Pure kernel optimization.

## What to Change

### 1. Implement `runWitnessSearch()` in `choose-n-option-resolution.ts`

For each unresolved option from the singleton pass:
- Build root: `[...currentSelected, option]`
- If root is already confirmable at this size → `legal`, `resolution: 'exact'` (should have been caught by singleton, but defensive)
- Else: enumerate admissible extensions deterministically
  - At each node: recompute remaining admissible options from template (tier filtering, qualifier mode)
  - Drop statically illegal options
  - Check probe cache before probing
  - Stop descending when selection is confirmable and satisfiable
  - Decrement `MAX_CHOOSE_N_TOTAL_WITNESS_NODES` budget per node visited
- Outcomes:
  - Witness found → `legal`, `resolution: 'exact'`
  - Subtree exhausted, no witness → `illegal`, `resolution: 'exact'`
  - Budget exhausted → `unknown`, `resolution: 'provisional'`

### 2. Implement deterministic search ordering

Per spec 4.6:
1. Active tier order (tier 0 before tier 1, etc.)
2. Smaller continuation domain first (prefer branches with fewer remaining options)
3. Normalized domain order as final tiebreaker (stable string/numeric sort)

### 3. Add probe cache

`Map<string, ProbeSummary>` keyed by canonical selection key (sorted option values joined). Shared across all options within a single `mapChooseNOptions` call.

### 4. Wire into strategy dispatcher

Update the large-domain branch:
```
1. Static filtering
2. Singleton probe pass (003)
3. NEW: Witness search for unresolved candidates
4. Remaining unresolved → unknown/provisional
```

## Files to Touch

- `packages/engine/src/kernel/choose-n-option-resolution.ts` (modify — add witness search)
- `packages/engine/src/kernel/legal-choices.ts` (modify — wire witness search into dispatcher)

## Out of Scope

- Bigint bitset canonical keys (simple string key is sufficient for now; optimize in 008 if needed)
- Worker-local session (Phase B)
- Selected-sequence validation on removal (63CHOOPEROPT-005)
- `advance-choose-n.ts` changes
- UI changes
- Performance benchmarking harness (63CHOOPEROPT-010)

## Acceptance Criteria

### Tests That Must Pass

1. New test: small domain where witness search finds a witness for every option → all `legal`, `resolution: 'exact'` (matches exhaustive oracle)
2. New test: domain with pairwise conflict (A and B cannot both be chosen) → witness search correctly resolves each as `legal` individually but the conflict is not surfaced until confirm
3. New test: budget exhaustion — domain large enough to exceed `MAX_CHOOSE_N_TOTAL_WITNESS_NODES` → some options `provisional`, others exact
4. New test: probe cache hit — repeated selection sets are not re-probed (assert cache hit count > 0)
5. New test: deterministic ordering — same inputs always produce same resolution order and results
6. New test: option with no valid completion → `illegal`, `resolution: 'exact'` after subtree exhaustion
7. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Every `legal` option has a concrete witness (existential proof).
2. Every `illegal` option has an exhausted subtree (universal proof).
3. Budget is count-based (nodes visited), not time-based.
4. Search is deterministic: same state + same options = same resolution.
5. Probe cache is local to a single `mapChooseNOptions` invocation — no cross-call leakage.
6. `enumerateCombinations()` and `countCombinationsCapped()` are NOT deleted — kept as oracle.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choose-n-witness-search.test.ts` — witness search correctness, budget behavior, cache behavior, deterministic ordering
2. Modify `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` — integration of singleton + witness pipeline
3. Add large-domain fixtures (20 options cardinality 1-8, 30 options cardinality 1-5) per spec 11.2

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`

## Outcome

- **Completion date**: 2026-03-15
- **What changed**:
  - `packages/engine/src/kernel/choose-n-option-resolution.ts` — added `runWitnessSearch()`, `WitnessSearchBudget`, `WitnessSearchStats`, `probeAndClassifySelection()`, `witnessSearchForOption()`, `selectionCacheKey()`. Bounded DFS over subset space with probe cache and count-based budget.
  - `packages/engine/src/kernel/legal-choices.ts` — wired witness search after singleton probe pass in `mapChooseNOptions` large-domain branch.
  - `packages/engine/test/unit/kernel/choose-n-witness-search.test.ts` — new test file (14 tests): witness correctness, budget exhaustion, cache behavior, deterministic ordering, subtree exhaustion, spec 11.2 large-domain fixtures, invariants.
  - `packages/engine/test/unit/kernel/choose-n-option-resolution.test.ts` — updated high-min test to expect `legal`+`exact` (witness resolves what singleton left unresolved).
  - `packages/engine/test/unit/kernel/legal-choices.test.ts` — updated overflow cap test to expect `legal`+`exact` (no blanket all-unknown).
- **Deviations**: None. All deliverables implemented as specified.
- **Verification**: 1607/1607 engine tests pass, 0 failures. Typecheck clean.
