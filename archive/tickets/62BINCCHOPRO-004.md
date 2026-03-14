# 62BINCCHOPRO-004: Create `advanceChooseN` pure kernel function

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — new kernel module plus focused discovery/runtime plumbing and unit tests
**Deps**: archive/tickets/62BINCCHOPRO-001.md, archive/tickets/62BINCCHOPRO-002.md, archive/tickets/62BINCCHOPRO-003.md

## Problem

The kernel has no mechanism for callers to drive `chooseN` selection incrementally. The only contract today is one-shot array submission. This prevents the kernel from recomputing legality between individual selection steps, blocks per-step tier-admissibility enforcement for `prioritized` queries, prevents per-piece animation in the runner, and forces interaction state into the UI layer.

## Assumption Reassessment (2026-03-14)

1. `legalChoicesDiscover` returns `ChoicePendingRequest` which already includes the `chooseN` incremental-state surface from ticket 001: `options`, `min`, `max`, `decisionKey`, `selected`, and `canConfirm`. Confirmed.
2. `resolveMoveDecisionSequence` is the outer decision loop — it stays unchanged. The `chooseN` sub-loop is the caller's responsibility. Confirmed by spec design principle C.
3. The `choose` callback in `resolveMoveDecisionSequence` returns full arrays for `chooseN` — this AI fast-path must be preserved. Confirmed.
4. `ChoicePendingRequest` already has `selected` and `canConfirm`; this is no longer future work gated on ticket 001. Confirmed.
5. The shared `computeTierAdmissibility` helper already exists from ticket 002, and ticket 003 already wired it into initial empty-selection legality plus final submitted-array validation. Confirmed.
6. Ticket 003 intentionally did not implement incremental `chooseN` progression. It only wired prioritized tier-admissibility into:
   - initial empty-selection legality, and
   - final submitted-array validation.
   Genuine per-step legality recomputation remains the responsibility of this ticket.
7. There is currently no `advanceChooseN`, no worker/store bridge for incremental commands, and no discovery-time mechanism to re-materialize a pending `chooseN` request for a transient in-progress selection without pretending the move param is already finalized. That missing seam is the real architectural gap.

## Architecture Check

1. `advanceChooseN` is a pure function — no side effects, no GameState mutation, deterministic.
2. It operates as a sub-loop within the existing decision sequence model. The outer `resolveMoveDecisionSequence` loop and `Move.params` accumulation are untouched.
3. It must reuse the existing discovery/effect path, not re-implement authored `chooseN` traversal in a parallel codepath. The clean seam is a discovery-only transient selection overlay that lets `effects-choice.ts` re-materialize a pending `chooseN` request for an in-progress selection.
4. It uses the shared tier-admissibility helper for `prioritized` queries, ensuring parity with apply-time validation.
5. The AI fast-path is preserved — agents continue returning full arrays through the `choose` callback without going through `advanceChooseN`.
6. This ticket is now the sole owner of true stepwise legality recomputation after each add/remove. That behavior must not be assumed to exist elsewhere in the kernel.

## What to Change

### 1. Add discovery-only transient `chooseN` selection plumbing

Update the discovery pipeline so callers can ask the kernel to evaluate a pending `chooseN` request against a transient in-progress selection without writing that array into `Move.params`.

This should be discovery-only runtime plumbing, not a new persisted state model:

- `packages/engine/src/kernel/effect-context.ts`
- `packages/engine/src/kernel/legal-choices.ts`
- any test helpers that construct discovery contexts directly

The intent is architectural: `effects-choice.ts` remains the single owner of how authored `chooseN` effects turn into pending requests.

### 2. Refactor `effects-choice.ts` chooseN discovery to build pending state from any current selection

Refactor the `chooseN` discovery path so it can:

- validate a transient current selection
- compute `selected` and `canConfirm`
- recompute option legality after add/remove
- keep duplicates and post-`max` additions illegal
- preserve prioritized tier-admissibility via the existing shared helper

This should replace ad hoc “initial empty selection only” construction with a reusable pending-request builder, not bolt on a second implementation.

### 3. Create `advance-choose-n.ts`

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

### 4. Export from kernel public API

Ensure `advanceChooseN`, `ChooseNCommand`, and `AdvanceChooseNResult` are exported through the kernel barrel.

### 5. Add focused unit tests

New public-surface tests should live at `packages/engine/test/unit/kernel/advance-choose-n.test.ts`.
If the new discovery-only plumbing exposes a fragile invariant more directly in lower-level tests, strengthen the relevant existing engine unit test file instead of forcing everything into one large test file.

## Files to Touch

- `tickets/62BINCCHOPRO-004.md` (modify — correct assumptions/scope first)
- `packages/engine/src/kernel/advance-choose-n.ts` (new)
- `packages/engine/src/kernel/effect-context.ts` (modify — discovery-only transient selection plumbing)
- `packages/engine/src/kernel/effects-choice.ts` (modify — reusable chooseN pending-state builder)
- `packages/engine/src/kernel/legal-choices.ts` (modify — thread transient selection into discovery/evaluation)
- `packages/engine/src/kernel/index.ts` (modify — export new function and types)
- `packages/engine/test/helpers/effect-context-test-helpers.ts` (modify if needed for new discovery context shape)
- `packages/engine/test/unit/kernel/advance-choose-n.test.ts` (new)
- existing engine unit test files as needed for low-level invariants

## Out of Scope

- `resolveMoveDecisionSequence` changes — the outer loop is untouched
- `chooseOne` handling — already works correctly as atomic step
- AI agent changes — fast-path preserved unchanged
- `GameState` changes — no new fields (in-progress state is transient)
- `Move` type changes — finalized array still written to `Move.params`
- Runner bridge/store/UI changes (tickets 62BINCCHOPRO-005, -006, -007)
- Card 87 re-authoring (ticket 62BINCCHOPRO-008)
- The shared prioritized helper itself or ticket 003's initial empty-selection/final-array validation work
- Any attempt to preserve the old runner-owned array-submission path by aliasing or compatibility shims

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
7. `advanceChooseN` does not duplicate authored-effect traversal; it reuses discovery-time kernel semantics through the shared plumbing

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/advance-choose-n.test.ts` — public `advanceChooseN` add/remove/confirm behavior, prioritized recomputation, and AI fast-path regression coverage
2. Existing engine unit test file(s) if needed — direct coverage for discovery-time transient selection invariants that are easier to pin below the public wrapper

### Commands

1. `pnpm turbo build`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-03-14
- What actually changed:
  - Added [`advanceChooseN`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/advance-choose-n.ts) as the public pure kernel wrapper for incremental `chooseN` add/remove/confirm commands.
  - Added discovery-only transient `chooseN` selection plumbing in [`effect-context.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effect-context.ts) and [`legal-choices.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-choices.ts) so in-progress selections can be re-evaluated without pretending `Move.params` is already finalized.
  - Refactored [`effects-choice.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/effects-choice.ts) so the existing chooseN discovery path can materialize pending state from any current selection, preserving prioritized tier-admissibility, uniqueness, and max-capacity rules in one place.
  - Exported the new API from [`index.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/index.ts).
  - Added focused public coverage in [`advance-choose-n.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/advance-choose-n.test.ts) and strengthened lower-level discovery coverage in [`effects-choice.test.ts`](/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/effects-choice.test.ts).
- Deviations from original plan:
  - Did not duplicate authored-effect traversal inside `advanceChooseN`. The cleaner long-lived architecture was to reuse the existing discovery/effect pipeline through a transient in-progress selection overlay.
  - Expanded scope slightly beyond the original file list to touch discovery plumbing and test helpers, because that was required to avoid a parallel legality implementation.
- Verification results:
  - `pnpm turbo build --filter=@ludoforge/engine`
  - `node --test packages/engine/dist/test/unit/kernel/advance-choose-n.test.js packages/engine/dist/test/unit/effects-choice.test.js`
  - `pnpm turbo lint --filter=@ludoforge/engine`
  - `pnpm -F @ludoforge/engine test`
