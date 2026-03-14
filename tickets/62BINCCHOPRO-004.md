# 62BINCCHOPRO-004: Create `advanceChooseN` pure kernel function

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new kernel module + comprehensive unit tests
**Deps**: tickets/62BINCCHOPRO-001.md (type extensions), tickets/62BINCCHOPRO-002.md (tier helper), tickets/62BINCCHOPRO-003.md (wired validation)

## Problem

The kernel has no mechanism for callers to drive `chooseN` selection incrementally. The only contract today is one-shot array submission. This prevents the kernel from recomputing legality between individual selection steps, blocks per-step tier-admissibility enforcement for `prioritized` queries, prevents per-piece animation in the runner, and forces interaction state into the UI layer.

## Assumption Reassessment (2026-03-14)

1. `legalChoicesDiscover` returns `ChoicePendingRequest` which includes `options`, `min`, `max`, `decisionKey`. Confirmed.
2. `resolveMoveDecisionSequence` is the outer decision loop — it stays unchanged. The `chooseN` sub-loop is the caller's responsibility. Confirmed by spec design principle C.
3. The `choose` callback in `resolveMoveDecisionSequence` returns full arrays for `chooseN` — this AI fast-path must be preserved. Confirmed.
4. `ChoicePendingRequest` will have `selected` and `canConfirm` fields after ticket 001. Confirmed.
5. The shared `computeTierAdmissibility` helper will exist after ticket 002. Confirmed.

## Architecture Check

1. `advanceChooseN` is a pure function — no side effects, no GameState mutation, deterministic.
2. It operates as a sub-loop within the existing decision sequence model. The outer `resolveMoveDecisionSequence` loop and `Move.params` accumulation are untouched.
3. It reconstructs the discovery context for the `chooseN` decision using the same path `legalChoicesDiscover` uses.
4. It uses the shared tier-admissibility helper for `prioritized` queries, ensuring parity with apply-time validation.
5. The AI fast-path is preserved — agents continue returning full arrays through the `choose` callback without going through `advanceChooseN`.

## What to Change

### 1. Create `advance-choose-n.ts`

New file at `packages/engine/src/kernel/advance-choose-n.ts`.

Define command and result types:

```ts
type ChooseNCommand =
  | { type: 'add'; value: MoveParamScalar }
  | { type: 'remove'; value: MoveParamScalar }
  | { type: 'confirm' };

type AdvanceChooseNResult =
  | { done: false; pending: ChoicePendingRequest }
  | { done: true; value: readonly MoveParamScalar[] };
```

Implement the pure function:

```ts
function advanceChooseN(
  def: GameDef,
  state: GameState,
  partialMove: Move,
  decisionKey: DecisionKey,
  currentSelected: readonly MoveParamScalar[],
  command: ChooseNCommand,
  runtime?: GameDefRuntime,
): AdvanceChooseNResult;
```

Behavior:

- **`add`**: Validates the item is in the current options and is legal (including tier-admissibility). Rejects duplicates. Appends to `currentSelected`. Recomputes options legality for the updated selection. Returns `{ done: false, pending }` with updated `selected`, `canConfirm`, and `options`.
- **`remove`**: Validates the item is in `currentSelected`. Removes it. Recomputes options legality. Returns `{ done: false, pending }`.
- **`confirm`**: Validates `currentSelected.length >= min` and `currentSelected.length <= max`. Returns `{ done: true, value: currentSelected }` if valid. Rejects otherwise.

### 2. Export from kernel public API

Ensure `advanceChooseN`, `ChooseNCommand`, and `AdvanceChooseNResult` are exported through the kernel barrel.

### 3. Add comprehensive unit tests

Test file at `packages/engine/test/unit/kernel/advance-choose-n.test.ts`.

## Files to Touch

- `packages/engine/src/kernel/advance-choose-n.ts` (new)
- `packages/engine/src/kernel/index.ts` or barrel file (modify — export new function and types)
- `packages/engine/test/unit/kernel/advance-choose-n.test.ts` (new)

## Out of Scope

- `resolveMoveDecisionSequence` changes — the outer loop is untouched
- `chooseOne` handling — already works correctly as atomic step
- AI agent changes — fast-path preserved unchanged
- `GameState` changes — no new fields (in-progress state is transient)
- `Move` type changes — finalized array still written to `Move.params`
- Runner bridge/store/UI changes (tickets 62BINCCHOPRO-005, -006, -007)
- Card 87 re-authoring (ticket 62BINCCHOPRO-008)
- `effects-choice.ts` or `legal-choices.ts` modifications (ticket 62BINCCHOPRO-003)

## Acceptance Criteria

### Tests That Must Pass

1. Pending `chooseN` request returned by `advanceChooseN` exposes current `selected` state
2. Pending `chooseN` request returned by `advanceChooseN` exposes computed `canConfirm`
3. `add` command with a legal item: item appended, options legality recomputed
4. `add` command with an illegal item: rejected with error
5. `add` command with a duplicate item: rejected with error
6. `add` command recomputes options legality after addition (items that were legal may become illegal)
7. `remove` command: item removed, options legality recomputed (items that were illegal may become legal)
8. `remove` command with item not in `currentSelected`: rejected with error
9. `confirm` command below `min`: rejected with error
10. `confirm` command at valid cardinality: returns `{ done: true, value }` with finalized array
11. `confirm` command above `max`: rejected with error
12. Prioritized tier-admissibility updates correctly after each step with `qualifierKey`
13. Prioritized tier-admissibility updates correctly after each step without `qualifierKey`
14. Non-prioritized `chooseN`: all options remain legal regardless of selection order
15. AI fast-path: full array submission via `choose` callback still works in `resolveMoveDecisionSequence`
16. `pnpm turbo build` succeeds
17. Existing suite: `pnpm -F @ludoforge/engine test` — no regressions

### Invariants

1. `advanceChooseN` is a pure function — same inputs always produce same outputs
2. The outer decision sequence (`resolveMoveDecisionSequence`) is not modified
3. `GameState` has no new fields — in-progress selection state is transient
4. `Move` type is unchanged — finalized array still goes into `Move.params`
5. No FITL-specific identifiers in the function or its tests
6. `evalQuery` is not modified

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/advance-choose-n.test.ts` — all acceptance criteria scenarios

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`
