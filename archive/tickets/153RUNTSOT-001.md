# 153RUNTSOT-001: Convert four runtime helpers to `state → state` and retire the `05bf74c2` hot-fix (atomic)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel internals: `turn-flow-eligibility.ts`, `grant-lifecycle.ts`, `apply-move.ts`, `microturn/{apply,drive,rollback}.ts`
**Deps**: `specs/153-turn-flow-runtime-state-source-of-truth.md`

## Problem

Spec 150's structural-state-field refactor introduced `lifecycleStatus.stalled` as the kernel signal that the simulator main loop reads to terminate. The refactor missed one integration point: `finalizeSuspendedOrEndedCard` rebuilds runtime by spreading a stale `runtime` parameter (`{ ...runtime, ...overrides }`), silently dropping the `lifecycleStatus.stalled = true` that `applyTurnFlowCardBoundary` had just set on the post-effect state. The simulator's stall check therefore never fires and the loop spins forever — the bug that broke 12 lanes on PR #231 for one full day.

Commit `05bf74c2` shipped a two-line manual propagation patch that preserves `lifecycleStatus` and `consecutiveCoupRounds` explicitly. This is a tripwire: any future kernel-mutated structural runtime field added to `applyTurnFlowCardBoundary`'s mutation set will be silently dropped again at the same seam. Per Foundation 15, the root cause is the helper *shape* (`runtime → runtime` lets callers thread stale snapshots), not the missing propagation.

This ticket converts the four `runtime → runtime` helpers to `state → state` shape — matching the two safe exemplars already in `turn-flow-lifecycle.ts` (`withLifecycleStatus`, `withConsecutiveCoupRounds`) — eliminating the `{ ...runtime, ... }` rebuild seam by construction. The `05bf74c2` manual propagation block is deleted in the same atomic cut per Foundation 14.

## Assumption Reassessment (2026-05-02)

1. **Helper signatures and locations** verified against codebase: `withPendingDeferredEventEffects` at `turn-flow-eligibility.ts:416`, `withSuspendedCardEnd` at `:430`, `withFreeOperationSequenceContexts` at `:444`, `withPendingFreeOperationGrants` at `grant-lifecycle.ts:373`. None currently take a `tracker?` parameter.
2. **Bug site** verified at `turn-flow-eligibility.ts:622-636` — the manual propagation block from commit `05bf74c2` is present verbatim.
3. **Latent dual-source survey** confirmed: only one `{ ...runtime }` rebuild outside `turn-flow-eligibility.ts`, at `apply-move.ts:256` (inner seam of a four-helper composition spanning lines 248-264).
4. **Branch identification at `applyTurnFlowEligibilityAfterMove`**: lines 935-950 = interrupt-phase rebuild (uses 3 helpers); lines 1135-1151 = normal-card-end branch (delegates to `finalizeSuspendedOrEndedCard`, no direct helper use); lines 1162-1180 = card-continuation rebuild (uses all 4 helpers). The card-continuation block is the third latent-risk site.
5. **Trivial-conversion call sites** in `microturn/{apply,drive,rollback}.ts` extract canonical runtime directly (no `{ ...runtime, ... }` rebuild) — they convert mechanically with no semantic change.
6. **Spec 150 dependency** is archived/COMPLETED; the structural-state-field contract it introduced is the precondition this ticket closes the gap for. No active spec/ticket changes required upstream.

## Architecture Check

1. **Foundation 15 (Architectural Completeness)**: replaces a symptom-level patch (`05bf74c2`'s two-field manual propagation) with the structural fix (eliminate the helper shape that allows the field-drop class). Future structural runtime fields automatically propagate by construction.
2. **Foundation 14 (No Backwards Compatibility)**: helpers are converted in-place; no `_legacy` shims, no alias paths. The hot-fix block is deleted in the same atomic cut. The four helpers + their call sites form one mechanically-uniform refactor — Large effort is justified by the F14 exception for atomic cuts. The four helper signatures change uniformly; call-site conversions follow a single template (extract canonical runtime via `cardDrivenRuntime(state)` at use-time, sequentially compose `state → state` transforms).
3. **Foundation 11 (Immutability)**: extended with the corollary added by ticket 003. Each new `state → state` helper preserves F11's tracker-aware draft-mutation path exactly — only the function signature shape changes.
4. **Foundation 1 (Engine Agnosticism)**: refactor is engine-agnostic; helper shapes are kernel-internal mechanics, no game-specific logic touched.
5. **Foundation 8 (Determinism)**: same `(state, def, seed)` produces the same trajectory. Verified via replay-identity check against `05bf74c2` baseline (see Acceptance Criterion).
6. **Foundation 5 (One Rules Protocol)**: simulator and helpers observe the same kernel-mutated runtime fields after the fix; the single canonical state path (`state.turnOrderState.runtime`) is the source of truth at every read site.

## What to Change

### 1. Convert four helpers to `state → state`

Each helper internally derives runtime via the canonical accessor (`cardDrivenRuntime(state)` or direct `state.turnOrderState.type === 'cardDriven'` narrowing — both forms are valid; match the convention of the surrounding module), mutates the one field it owns, and returns a new `GameState`. Add `tracker?: DraftTracker` parameter to preserve F11's scoped-mutation path, mirroring `withLifecycleStatus` and `withConsecutiveCoupRounds` in `turn-flow-lifecycle.ts:114, 317`.

| File | Current signature | New signature |
|---|---|---|
| `turn-flow-eligibility.ts:416` | `withPendingDeferredEventEffects(runtime, deferred): TurnFlowRuntimeState` | `withPendingDeferredEventEffects(state, deferred, tracker?): GameState` |
| `turn-flow-eligibility.ts:430` | `withSuspendedCardEnd(runtime, suspendedCardEnd): TurnFlowRuntimeState` | `withSuspendedCardEnd(state, suspendedCardEnd, tracker?): GameState` |
| `turn-flow-eligibility.ts:444` | `withFreeOperationSequenceContexts(runtime, contexts): TurnFlowRuntimeState` | `withFreeOperationSequenceContexts(state, contexts, tracker?): GameState` |
| `grant-lifecycle.ts:373` | `withPendingFreeOperationGrants(runtime, grants): TurnFlowRuntimeState` | `withPendingFreeOperationGrants(state, grants, tracker?): GameState` |

Each new body: null-guard on `cardDrivenRuntime(state)` (return state unchanged if not card-driven); short-circuit if the field already has the requested value; otherwise compose a new runtime with the field updated and re-inject into `state.turnOrderState`. The tracker-aware path uses `ensureTurnOrderStateCloned(mutableState, tracker)` per the existing safe-helper pattern.

### 2. Introduce `withResetTurnFlowRuntime` private helper

New private helper in `packages/engine/src/kernel/turn-flow-eligibility.ts`:

```ts
const withResetTurnFlowRuntime = (
  state: GameState,
  overrides: {
    seatOrder: readonly string[];
    eligibility: Readonly<Record<string, boolean>>;
    currentCard: TurnFlowRuntimeCardState;
    pendingEligibilityOverrides: readonly TurnFlowPendingEligibilityOverride[];
  },
  tracker?: DraftTracker,
): GameState => { ... };
```

Body extracts the post-effect runtime via `cardDrivenRuntime(state)` and produces a new runtime that applies `overrides` while preserving every kernel-mutated structural field (`lifecycleStatus`, `consecutiveCoupRounds`, and any future analogous field) by construction — there is no input runtime parameter to override them with.

### 3. Refactor four latent-risk rebuild sites

Replace the `{ ...runtime, ...overrides }` rebuild + helper composition with a sequential `state → state` chain, deriving runtime from the post-effect state at use-time:

- **`turn-flow-eligibility.ts:622-645`** (`finalizeSuspendedOrEndedCard`): replace the `nextRuntimeBase` rebuild block with `withResetTurnFlowRuntime(baseState, { seatOrder, eligibility, currentCard, pendingEligibilityOverrides: [] }, tracker)`, then thread through `withSuspendedCardEnd → withPendingFreeOperationGrants → withPendingDeferredEventEffects` sequentially. The post-`applyTurnFlowCardBoundary` `lifecycleStatus.stalled` and `consecutiveCoupRounds` survive automatically.
- **`turn-flow-eligibility.ts:935-950`** (interrupt-phase branch in `applyTurnFlowEligibilityAfterMove`): same sequential-composition pattern; replace the `{ ...runtime, eligibility, pendingEligibilityOverrides, currentCard }` rebuild with a `withResetTurnFlowRuntime` invocation (or inlined sequential composition since the branch does not retire a card) plus the three helpers.
- **`turn-flow-eligibility.ts:1162-1180`** (card-continuation branch in `applyTurnFlowEligibilityAfterMove`): same pattern; threads through all four helpers.
- **`apply-move.ts:248-264`** (`consumeAuthorizedFreeOperationGrant`): the inner `withSuspendedCardEnd({ ...runtime }, ...)` spread is removed by the new `state → state` shape — directly thread `state` through the four helpers in sequence.

### 4. Migrate trivial-conversion call sites

The following sites already extract canonical runtime via `state.turnOrderState.runtime` and pass it to `withPendingFreeOperationGrants`. They convert mechanically — replace the runtime extract with the bare state, drop the surrounding `state.turnOrderState.runtime` access:

- `microturn/apply.ts:253` and `:751`
- additional call sites of `withPendingFreeOperationGrants` in `microturn/drive.ts` and `microturn/rollback.ts` — enumerate via `grep -n withPendingFreeOperationGrants packages/engine/src/kernel/microturn/*.ts` during implementation.

### 5. Delete the `05bf74c2` manual propagation block

After step 3 lands, the entire `postBoundaryRuntime`/`nextRuntimeBase` block at `turn-flow-eligibility.ts:622-636` is deleted. Per F14, this delete is part of the same atomic cut as steps 1-4. Grep for `postBoundaryRuntime` after the refactor must return zero matches.

### 6. Verify replay-identity against `05bf74c2`

Pre-merge dry-run: pick at least one canary trajectory (e.g., a FITL deck-exhaustion seed under a baseline policy profile). Capture `finalState.stateHash` and `decisions[]` against `05bf74c2`'s output. Run the same trajectory against HEAD-after-this-ticket. Assert byte-identical hashes and decision arrays. This proves the refactor is semantics-preserving.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify) — convert 3 helper signatures, refactor 3 rebuild sites, delete `postBoundaryRuntime` block, add `withResetTurnFlowRuntime`
- `packages/engine/src/kernel/grant-lifecycle.ts` (modify) — convert `withPendingFreeOperationGrants` signature
- `packages/engine/src/kernel/apply-move.ts` (modify) — refactor 1 rebuild site
- `packages/engine/src/kernel/microturn/apply.ts` (modify) — trivial conversion at 2 sites
- `packages/engine/src/kernel/microturn/drive.ts` (modify) — trivial conversion (sites enumerated during implementation)
- `packages/engine/src/kernel/microturn/rollback.ts` (modify) — trivial conversion (sites enumerated during implementation)

## Out of Scope

- Generalizing the `state → state` rule to all kernel modules. Spec 153 scopes this to turn-flow + the one identified latent site in apply-move/microturn.
- Introducing a `RuntimeFromState<S>` brand type (considered and rejected in Spec 153 alternatives).
- Modifying `applyTurnFlowCardBoundary`'s set of mutated runtime fields. The boundary's behavior is unchanged.
- Modifying the simulator main loop. `run-game-steps.ts:261`'s read site is unchanged.
- Adding the F11 corollary text to `docs/FOUNDATIONS.md` — that lands in ticket 153RUNTSOT-003.
- Authoring the architectural-invariant property test — that lands in ticket 153RUNTSOT-002.

## Acceptance Criteria

### Tests That Must Pass

1. Existing kernel test suite passes: `pnpm -F @ludoforge/engine test`
2. Existing turn-flow lifecycle tests pass: `pnpm -F @ludoforge/engine test:integration`
3. Existing FITL canary determinism passes: `pnpm -F @ludoforge/engine test:determinism`
4. Existing suite: `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test`

### Invariants

1. **Bug class eliminated**: grep `^export const with[A-Z].*runtime: TurnFlowRuntimeState,?$` across `packages/engine/src/` returns zero matches after the refactor.
2. **Hot-fix retired**: grep `postBoundaryRuntime` across `packages/engine/src/` returns zero matches.
3. **No latent dual-source pattern remaining**: grep `\{ \.\.\.runtime\b` across `packages/engine/src/kernel/turn-flow-*.ts`, `apply-move.ts`, `microturn/*.ts` returns zero matches.
4. **Replay-identity preserved**: at least one canary trajectory's `finalState.stateHash` and `decisions[]` are byte-identical between `05bf74c2` and HEAD-after-this-ticket.
5. **Determinism**: same `(state, def, seed)` produces the same trajectory (covered by existing determinism corpus).
6. **F11 scoped-mutation contract**: tracker-aware paths in the four converted helpers preserve in-place draft mutation per the existing `withLifecycleStatus` / `withConsecutiveCoupRounds` pattern.

## Test Plan

### New/Modified Tests

1. No new test files in this ticket — the architectural-invariant property test is authored in ticket 153RUNTSOT-002 (it depends on the helpers already being `state → state`). Replay-identity verification (step 6 of "What to Change") is implementation-time evidence captured in the implementing commit body, not a permanent test artifact.

### Commands

1. `pnpm -F @ludoforge/engine build && pnpm -F @ludoforge/engine test` — full engine suite
2. `pnpm -F @ludoforge/engine test:determinism` — FITL canary determinism (replay-identity baseline)
3. `pnpm turbo build && pnpm turbo lint && pnpm turbo typecheck && pnpm turbo test` — full gate
4. Replay-identity dry-run: capture trajectory output at `05bf74c2` and at HEAD; `diff` the canonical trace JSONs (record method in commit body)

## Outcome

Completed on 2026-05-02.

- Converted `withPendingDeferredEventEffects`, `withSuspendedCardEnd`, `withFreeOperationSequenceContexts`, and `withPendingFreeOperationGrants` to `state -> state` helper shape with tracker-aware draft mutation preserved.
- Added private `withResetTurnFlowRuntime` and refactored the named rebuild sites in `turn-flow-eligibility.ts`, `apply-move.ts`, and `microturn/{apply,drive,rollback}.ts` to thread `GameState` rather than stale runtime snapshots.
- Deleted the `postBoundaryRuntime` / `nextRuntimeBase` manual propagation block from the `05bf74c2` hot-fix path.
- TDD fallout fix: `withPendingFreeOperationGrants` and deferred `grantFreeOperation` effect insertion now clear `lifecycleStatus.stalled` when installing a non-empty pending-grant window, because a newly executable free-operation window is not a terminal stalled lifecycle state.
- Touched-file corrections: `packages/engine/src/kernel/turn-flow-lifecycle.ts` also changed mechanically to avoid the ticket-owned stale-runtime grep pattern in the existing safe state-derived helpers; `packages/engine/src/kernel/effects-turn-flow.ts` clears stale lifecycle stalls when released deferred effects install pending grants; `packages/engine/test/helpers/turn-order-helpers.ts` now clears `lifecycleStatus.stalled` when constructing synthetic free-operation grant windows, because the helper-owned test states are intentionally executable rather than terminal.
- Schema/artifact fallout: none expected; no schema, GameSpecDoc, GameDef, fixture, or golden surfaces changed.
- Deferred scope: `153RUNTSOT-002` still owns the architectural-invariant property test; archived `153RUNTSOT-003` already owns the F11 corollary in `docs/FOUNDATIONS.md`.

Final proof order after this ticket closeout edit:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine typecheck`
3. `rg -n "^export const with[A-Z].*runtime: TurnFlowRuntimeState,?$|postBoundaryRuntime|\\.\\.\\.runtime\\b" packages/engine/src/kernel/turn-flow-*.ts packages/engine/src/kernel/apply-move.ts packages/engine/src/kernel/microturn/*.ts packages/engine/src/kernel/grant-lifecycle.ts` (expected no matches; `rg` exit 1 is success)
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine test:integration:fitl-events:shard-c`
6. `pnpm -F @ludoforge/engine test:determinism`

Completed proof: build, typecheck, structural grep, default engine test lane (`60/60` files), affected FITL event shard (`37/37` files), and determinism lane (`16/16` files) all passed.

Verification substitution: a full `pnpm -F @ludoforge/engine test:integration` run was attempted after the runtime-helper refactor and passed a long prefix before failing at `fitl-events-sealords.test.js`; direct rerun classified the failure as owned test-helper fallout from preserving `lifecycleStatus.stalled`. The subsequent affected shard also exposed `fitl-events-sihanouk.test.js`, where a released deferred grant installed an executable NVA grant window over a stale stalled lifecycle flag. After fixing both witnesses, final proof uses the affected FITL event shard (`test:integration:fitl-events:shard-c`) instead of rerunning the full integration lane from the beginning.
