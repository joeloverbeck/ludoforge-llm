# Spec 153: Turn-Flow Runtime State Source-Of-Truth Contract

**Status**: PROPOSED
**Priority**: P2 (closes the architectural hot-fix gap shipped in commit `05bf74c2` on PR #231; lands before any further turn-flow work to prevent the same class of bug from recurring as new structural runtime fields are added — but is not P1 because the hot-fix has already unblocked CI)
**Complexity**: M (kernel-internal helper-shape refactor across four `runtime -> runtime` exports + their three to five call sites in `turn-flow-eligibility.ts` and `apply-move.ts`; deletes the manual propagation lines added by `05bf74c2`; adds one architectural-invariant property test; one corollary added to the project's living architectural-completeness convention. No GameSpecDoc YAML change, no compiler IR change, no public-API change.)
**Dependencies**:
- Foundation 5 (One Rules Protocol, Many Clients) — the simulator, helpers, evolution probes, and direct-`applyMove` callers MUST observe the same kernel-mutated runtime fields. The fix preserves that contract by ensuring no caller seam can silently drop a field.
- Foundation 10 (Bounded Computation) — the gap this spec closes is the one that re-broke termination boundedness on PR #231 after Spec 150 was supposed to make it structural.
- Foundation 11 (Immutability) — extended with a corollary specifying that internal helpers MUST source kernel-mutated structural state fields from the post-effect state, not from a separately-parameterized runtime snapshot.
- Foundation 14 (No Backwards Compatibility) — the `runtime -> runtime` helper shape is deleted in the same atomic change that introduces the `state -> state` shape; no alias, no shim, no deprecation window. The manual propagation lines from `05bf74c2` are deleted as part of the same cut.
- Foundation 15 (Architectural Completeness) — the spec exists because commit `05bf74c2` is itself a hot-fix at the architectural level: it propagates two specific fields and remains fragile to any third field added in the future. This spec replaces the hot-fix with a structural fix.
- Foundation 16 (Testing as Proof) — the property test introduced in Section B is the architectural invariant that makes the source-of-truth contract a proven property rather than an assumed convention. It is the test that would have caught the PR #231 regression at commit `ddcf3ef9` (Spec 150's main commit).
- Spec 150 [card-driven-lifecycle-termination-contract] (archived/COMPLETED) — completes Spec 150's structural-state-field contract by enforcing field-propagation across every internal helper that rebuilds runtime. Spec 150 introduced `lifecycleStatus.stalled` as the kernel signal; this spec ensures the signal survives every reachable code path between `applyTurnFlowCardBoundary` and the simulator's stall check.
- Spec 152 [shared-simulation-loop-primitive] (archived/COMPLETED) — interaction note: the shared loop primitive (`run-game-steps.ts:261`) reads `cardDrivenRuntime(state)?.lifecycleStatus.stalled === true` from the canonical state. The refactor preserves this read site exactly; the change is upstream of the loop's view.

**Source**:
- PR #231 hot-fix commit `05bf74c2` (`fix(kernel): preserve lifecycleStatus through finalizeSuspendedOrEndedCard runtime rebuild`). Eight-line manual propagation patch in `packages/engine/src/kernel/turn-flow-eligibility.ts:622-636`. Its commit body documents how Spec 150's structural-state-field refactor missed one integration point and how the simulator therefore spun forever past turn 1 on every FITL game.
- `reports/ci-failures-pr-231-2026-04-28.md` (prior cluster, different root cause: `refreshCachedTokenStateIndexEntries` perf — already addressed by `b362038a`). The PR #231 lifecycle hang is a *new* regression introduced by Spec 150 between the prior report and the May 2 push.
- Explore subagent survey (recorded inline in the PR #231 diagnostic conversation): one definite latent instance of the same dual-source pattern at `packages/engine/src/kernel/apply-move.ts:256` (`consumeAuthorizedFreeOperationGrant`), currently safe because `withSuspendedCardEnd` only mutates one field — but a tripwire for any field added to that helper.
- Spec 150 itself, archived as `archive/specs/150-card-driven-lifecycle-termination-contract.md`, whose Foundation-15 motivation explicitly was "consolidate two paths for the same condition into one structural state." The Spec 150 implementation delivered the structural state field but did not enforce the propagation invariant across every internal helper that rebuilds runtime — the gap this spec closes.

## Brainstorm Context

**Original framing.** When Spec 150 introduced `lifecycleStatus.stalled` as a structural field on `TurnFlowRuntimeState`, it relied on every kernel function that returns a new `GameState` to thread that field through its internal computation. `applyTurnFlowCardBoundary` (the boundary function that owns the field's mutation) does this correctly — it calls `withLifecycleStatus(nextState, !progressed, tracker)` at the end, which is a `state -> state` helper that derives runtime internally from the state and writes the field through the canonical state.turnOrderState.runtime path.

But `finalizeSuspendedOrEndedCard` — the function that wraps `applyTurnFlowCardBoundary` and then resets eligibility / current-card / pending-overrides for the next card — is not `state -> state`. It accepts both `rewardState: GameState` AND `runtime: TurnFlowRuntimeState` as separate parameters. Inside, it calls `applyTurnFlowCardBoundary(def, rewardState)` and binds the result to `baseState`. `baseState.turnOrderState.runtime.lifecycleStatus.stalled` now correctly reflects the boundary's signal.

Then it builds the next runtime by spreading the input `runtime` parameter (`{ ...runtime, seatOrder, eligibility, currentCard, pendingEligibilityOverrides: [] }`), threads that through `withSuspendedCardEnd`, `withPendingFreeOperationGrants`, `withPendingDeferredEventEffects` (all `runtime -> runtime` helpers), and finally writes the result back into `baseState`'s `turnOrderState.runtime` slot — overwriting `lifecycleStatus.stalled = true` with the original `false` from the input parameter.

The simulator's stall check at `run-game-steps.ts:261` (`if (cardDrivenRuntime(state)?.lifecycleStatus.stalled === true)`) therefore never fires, because by the time the state propagates back to the loop, the field has been silently reset.

**Motivation.**
1. **F15 enforcement.** Commit `05bf74c2` ships two manual propagation lines (`lifecycleStatus: postBoundaryRuntime.lifecycleStatus, ...consecutiveCoupRounds`). These are the minimum patch for the two structural fields known today. Any future field added to `applyTurnFlowCardBoundary`'s mutation set will not be covered, and the bug will recur. F15 says solutions must address root causes; the root cause is the helper shape, not the missing propagation.
2. **F10 enforcement.** Spec 150 was supposed to make termination boundedness derivable from state shape. The commit `05bf74c2` hot-fix re-establishes the property locally but does not eliminate the class of bug that broke it. Until the helper shape is fixed, any contributor refactoring `finalizeSuspendedOrEndedCard` (or any sibling that grows up to look the same) can re-introduce the hang trivially — a single `{ ...runtime, ... }` is enough.
3. **F11 corollary needed.** F11 mandates immutability and authorizes scoped internal mutation. It does not currently enumerate the runtime-rebuild seams where field drops can occur. A short corollary aligned to F11 closes the gap: helpers that rebuild structural state MUST source kernel-mutated fields from the post-effect state.
4. **F16 enforcement.** The Spec 150 test suite (`turn-flow-lifecycle-status.test.ts`, `lifecycle-stalled-deck-exhaustion.test.ts`) all pass even with the bug present, because they exercise `applyTurnFlowCardBoundary` in isolation or through call paths that don't go through `finalizeSuspendedOrEndedCard`'s rebuild. There is no architectural-invariant test that proves "stall set by the boundary survives the rebuild and is observable to the simulator." A property test of that shape would have failed CI immediately at commit `ddcf3ef9`.

**Prior art surveyed.**
- **Spec 150 itself, F18 pass-fallback recovery (Spec 144).** Both established the principle that the kernel embeds recovery / termination signals in kernel-owned state artifacts (a field, a fallback action, a trace event) rather than caller-side conventions. This spec extends the principle one layer down: the artifacts only work if every internal helper that touches them preserves them through the immutable-rebuild pattern.
- **Foundation 11's "Scoped internal mutation" exception.** That clause already establishes the precedent that mutation rules govern internal helper shapes, not just public API contracts. The corollary added by this spec extends the same kind of helper-shape rule to the immutable case.
- **The two existing `state -> state` helpers in `turn-flow-lifecycle.ts`** (`withLifecycleStatus`, `withConsecutiveCoupRounds`) are private and demonstrate the safe shape: take state, derive runtime via the canonical runtime accessor (`withConsecutiveCoupRounds` uses `cardDrivenRuntime(state)`; `withLifecycleStatus` narrows directly via `state.turnOrderState.type === 'cardDriven'` — both are valid forms of the same pattern), mutate one field, return state. Callers cannot drop fields they don't know about because the helper does the runtime-extraction and reassembly itself. The four `runtime -> runtime` helpers (`withPendingDeferredEventEffects`, `withSuspendedCardEnd`, `withFreeOperationSequenceContexts` in `turn-flow-eligibility.ts`; `withPendingFreeOperationGrants` in `grant-lifecycle.ts`) are the asymmetric pattern. Convergence onto the safe shape is the architectural fix.

**Synthesis.** Convert the four `runtime -> runtime` helpers to `state -> state` form, matching the two helpers that already live in `turn-flow-lifecycle.ts`. Refactor the three call sites in `turn-flow-eligibility.ts` (`finalizeSuspendedOrEndedCard`, the interrupt-phase branch in `applyTurnFlowEligibilityAfterMove`, the normal card-end branch in `applyTurnFlowEligibilityAfterMove`) and the one call site in `apply-move.ts` (`consumeAuthorizedFreeOperationGrant`) to thread state through these helpers instead of rebuilding `nextRuntimeBase` from a parameter snapshot. Delete the manual propagation lines from commit `05bf74c2`. Add an architectural-invariant property test that proves any future kernel-mutated runtime field automatically propagates through every reachable simulator path. Add a one-paragraph corollary to the project's F11 documentation block (or to a project-internal architectural conventions doc, depending on where the team prefers to land it) so the principle is discoverable by future contributors.

**Alternatives explicitly considered (and rejected).**
- **Keep the `05bf74c2` manual propagation as the final answer.** Two-line patch, low risk. Rejected: F15 violation. Any third field added to `applyTurnFlowCardBoundary`'s mutation set silently breaks again; the bug class is not eliminated.
- **Brand `RuntimeFromState<S>` as a typed wrapper that ties a runtime extract to its source state.** Forces callers to use `RuntimeFromState<S>` rather than bare `TurnFlowRuntimeState` parameters; compiler catches the misuse. Rejected: adds compile-time noise across many call sites and the brand still doesn't prevent `{ ...runtime, ... }` reassembly when the caller has the right brand. The `state -> state` refactor solves the bug architecturally with simpler code.
- **Add a runtime-level invariant assertion (`assertLifecycleStatusPreserved(prevState, nextState)`) that every internal helper must call.** Defensive. Rejected: assertions are reactive, not preventive; F16 prefers structural proofs.
- **Forbid `runtime -> runtime` helpers entirely as a global lint rule.** Generalizes beyond turn-flow to all kernel state. Rejected for this spec's scope (the bug is concretely in turn-flow); the corollary in Section C captures the general principle without forcing a lint-rule audit across the kernel. A separate spec can extend the rule kernel-wide if the corollary proves insufficient over time.
- **Promote `RuntimeMutator<S>` (a class with a fluent API) for runtime updates inside helpers.** Object-oriented version of the codec idea. Rejected: violates the codebase's functional update style (per `.claude/rules/coding-style.md` and existing kernel idioms).

**User constraints reflected.**
- F1 ✅: the refactor is engine-agnostic; helper shapes are kernel-internal mechanics, not game-specific.
- F5 ✅: simulator and helpers observe the same kernel-mutated runtime fields after the fix.
- F8 ✅: deterministic; same `(state, def)` → same post-effect state.
- F10 ✅: this is the principle the spec exists to honor; closes the regression that broke termination boundedness on PR #231.
- F11 ✅: extended with the new corollary.
- F14 ✅: deletes the four `runtime -> runtime` helpers and the manual propagation lines in the same atomic cut.
- F15 ✅: replaces the hot-fix with the structural fix.
- F16 ✅: introduces the property test that makes the invariant proven.
- F19 (Decision-Granularity Uniformity): unaffected.

## Overview

Refactor signature target:

```ts
// kernel/turn-flow-eligibility.ts (current — the runtime -> runtime shape)
export const withSuspendedCardEnd = (
  runtime: TurnFlowRuntimeState,
  suspendedCardEnd: TurnFlowRuntimeState['suspendedCardEnd'] | undefined,
): TurnFlowRuntimeState => { ... };

// After Spec 153 (the state -> state shape, mirroring withLifecycleStatus
// in turn-flow-lifecycle.ts):
export const withSuspendedCardEnd = (
  state: GameState,
  suspendedCardEnd: TurnFlowRuntimeState['suspendedCardEnd'] | undefined,
  tracker?: DraftTracker,
): GameState => { ... };
```

All four runtime-shaped helpers convert. Call-site shape transforms accordingly:

```ts
// Current (turn-flow-eligibility.ts:629-645):
const nextRuntime = withPendingDeferredEventEffects(
  withPendingFreeOperationGrants(
    withSuspendedCardEnd(nextRuntimeBase, undefined),
    normalizedPendingFreeOperationGrants,
  ),
  normalizedPendingDeferredEventEffects,
);
const stateWithTurnFlow: GameState = { ...baseState, turnOrderState: { type: 'cardDriven', runtime: nextRuntime } };

// After Spec 153:
let nextState = withResetTurnFlowRuntime(baseState, {
  seatOrder: nextSeatOrder,
  eligibility: nextEligibility,
  currentCard: nextTurn,
  pendingEligibilityOverrides: [],
}, tracker);
nextState = withSuspendedCardEnd(nextState, undefined, tracker);
nextState = withPendingFreeOperationGrants(nextState, normalizedPendingFreeOperationGrants, tracker);
nextState = withPendingDeferredEventEffects(nextState, normalizedPendingDeferredEventEffects, tracker);
```

`withResetTurnFlowRuntime` is a new private helper (also `state -> state`) that captures the bulk-reset operation `finalizeSuspendedOrEndedCard` performs. It explicitly preserves `lifecycleStatus`, `consecutiveCoupRounds`, and any other field NOT in the override map by deriving them from `state.turnOrderState.runtime` directly — there is no input-parameter snapshot to override them with.

The manual propagation lines added by `05bf74c2` (the `lifecycleStatus: postBoundaryRuntime.lifecycleStatus, ...consecutiveCoupRounds` block) are deleted; the `state -> state` refactor preserves these fields by construction.

## Problem Statement

### Defect class: silent structural-field drops on runtime-rebuild seams

The `runtime -> runtime` helper shape forces callers to construct or thread a `TurnFlowRuntimeState` value through helper composition. Whenever the caller starts that thread from a stale snapshot — typically a function parameter that predates a kernel call returning a new state — any field that the kernel call mutated on the new state is silently dropped at the rebuild seam.

Today the dropped fields are `lifecycleStatus.stalled` and `consecutiveCoupRounds`, both of which `applyTurnFlowCardBoundary` mutates. Tomorrow, when (for example) a future spec adds a structural `pendingCoupTransition` field or a `lifecycleProgressLog` for evolution-quality witnesses, the same seam will drop those too — because the helper signature does not couple the input runtime to the post-effect state.

The Explore subagent survey of the kernel found one additional latent instance at `apply-move.ts:248-264` (`consumeAuthorizedFreeOperationGrant`), where the four-helper composition wraps a `withSuspendedCardEnd({ ...runtime }, runtime.suspendedCardEnd)` inner seam. Today every helper-owned field at this site (`pendingDeferredEventEffects`, `freeOperationSequenceContexts`, `pendingFreeOperationGrants`, `suspendedCardEnd`) is explicitly threaded by the caller, so no helper-owned field is dropped — the latent risk is the `{ ...runtime }` spread itself: any future kernel call upstream of this rebuild whose mutated runtime field is NOT explicitly threaded by the caller would be silently dropped, exactly as in `finalizeSuspendedOrEndedCard`. The structural fix removes the spread by making the helpers `state -> state`.

### Why TypeScript can't catch this

`{ ...staleRuntime, ...overrides }` is type-correct. `TurnFlowRuntimeState` has many optional fields; spreading a value whose `lifecycleStatus.stalled` is `false` and overriding nothing yields a `TurnFlowRuntimeState` whose `lifecycleStatus.stalled` is `false` — a valid value. There is no way for the compiler to know that `applyTurnFlowCardBoundary` just set the field to `true` on a different state value the caller chose to ignore.

The structural fix removes the option to ignore: when the helpers are `state -> state`, there is no separate runtime snapshot to override with. The runtime's lifecycle field is read from the canonical state path at use-time.

### Why this is not "premature defensive engineering"

The bug shipped to CI on commit `ddcf3ef9` (Spec 150's main commit, May 1) and broke 12 lanes for one full day before being diagnosed. The hot-fix at `05bf74c2` is itself a tripwire — manual propagation that is two specific fields wide and one depth deep. The next contributor refactoring `finalizeSuspendedOrEndedCard` in any way (e.g., to extract `consumeAuthorizedFreeOperationGrant`'s pattern into shared code, or to merge with a sibling) can break it again with a single careless `{ ...runtime, ... }`. The defect class has been demonstrated; the spec is anchored on direct evidence, not speculation.

### Why the simulator side of the contract is correct as-is

`run-game-steps.ts:261` reads `cardDrivenRuntime(state)?.lifecycleStatus.stalled === true` from the canonical state — single source of truth. No change required on the simulator side. Spec 152's design correctly embedded the read at the canonical path; the bug is upstream of the read.

## Design

### D1. Convert the four `runtime -> runtime` helpers to `state -> state`

Helpers to convert (file location given per helper):

| Current signature | Current file | New signature |
|---|---|---|
| `withPendingDeferredEventEffects(runtime, deferred): TurnFlowRuntimeState` | `packages/engine/src/kernel/turn-flow-eligibility.ts:416` | `withPendingDeferredEventEffects(state, deferred, tracker?): GameState` |
| `withSuspendedCardEnd(runtime, suspendedCardEnd): TurnFlowRuntimeState` | `packages/engine/src/kernel/turn-flow-eligibility.ts:430` | `withSuspendedCardEnd(state, suspendedCardEnd, tracker?): GameState` |
| `withFreeOperationSequenceContexts(runtime, contexts): TurnFlowRuntimeState` | `packages/engine/src/kernel/turn-flow-eligibility.ts:444` | `withFreeOperationSequenceContexts(state, contexts, tracker?): GameState` |
| `withPendingFreeOperationGrants(runtime, grants): TurnFlowRuntimeState` | `packages/engine/src/kernel/grant-lifecycle.ts:373` | `withPendingFreeOperationGrants(state, grants, tracker?): GameState` |

Each helper internally derives runtime via `cardDrivenRuntime(state)`, mutates the one field it owns, and returns a new `GameState` (or, with a tracker, mutates the in-place draft per F11's scoped-mutation exception, identical to how `withLifecycleStatus` and `withConsecutiveCoupRounds` already operate). This mirrors the two existing safe helpers in `turn-flow-lifecycle.ts`; the convention becomes uniform across the turn-flow module.

### D2. Refactor the call sites

**Latent-risk `{ ...runtime, ... }` rebuilds (the sites the structural fix actually eliminates):**

Three rebuild sites in `packages/engine/src/kernel/turn-flow-eligibility.ts`:
- Lines 622-645 — `finalizeSuspendedOrEndedCard`'s rebuild block (the immediate bug surface; deleted per D3 below).
- Lines 935-950 — the interrupt-phase branch in `applyTurnFlowEligibilityAfterMove` (rebuilds `{ ...runtime, eligibility, pendingEligibilityOverrides, currentCard }` and threads the result through `withPendingFreeOperationGrants` → `withFreeOperationSequenceContexts` → `withPendingDeferredEventEffects`).
- Lines 1162-1180 — the **card-continuation branch** in `applyTurnFlowEligibilityAfterMove` (the path taken when the card has not ended after the move; rebuilds `{ ...runtime, eligibility, pendingEligibilityOverrides, currentCard }` and threads through `withSuspendedCardEnd` → `withPendingFreeOperationGrants` → `withFreeOperationSequenceContexts` → `withPendingDeferredEventEffects`). Note: the actual normal-card-end branch at lines 1135-1151 delegates to `finalizeSuspendedOrEndedCard` and does NOT call the four helpers directly — its risk is captured by the first bullet above.

One rebuild site in `packages/engine/src/kernel/apply-move.ts`:
- Lines 248-264 (`consumeAuthorizedFreeOperationGrant`) — composes all four helpers around an inner `withSuspendedCardEnd({ ...runtime }, runtime.suspendedCardEnd)` spread.

**Trivial-conversion call sites (no `{ ...runtime, ... }` rebuild — already extract the canonical runtime path; convert to the new `state -> state` shape with no semantic change):**

- `packages/engine/src/kernel/microturn/apply.ts:253` and `:751` — call `withPendingFreeOperationGrants(state.turnOrderState.runtime, ...)`.
- Additional call sites of `withPendingFreeOperationGrants` in `packages/engine/src/kernel/microturn/drive.ts` and `packages/engine/src/kernel/microturn/rollback.ts` — verified by blast-radius grep; same pattern (canonical-runtime extract, no rebuild). The implementing ticket enumerates exact lines.

For each rebuild site, replace the runtime-rebuild composition with a sequential state-transformation chain. The new private helper `withResetTurnFlowRuntime(state, overrides, tracker)` captures the bulk-reset shape used by `finalizeSuspendedOrEndedCard` (reset eligibility, currentCard, pendingEligibilityOverrides, seatOrder); other rebuild sites use direct sequential composition. Trivial-conversion sites are mechanical signature updates.

### D3. Delete the `05bf74c2` manual propagation patch

`packages/engine/src/kernel/turn-flow-eligibility.ts` lines 622-636 currently read:

```ts
const postBoundaryRuntime =
  baseState.turnOrderState.type === 'cardDriven'
    ? baseState.turnOrderState.runtime
    : runtime;
const nextRuntimeBase: TurnFlowRuntimeState = {
  ...runtime,
  seatOrder: nextSeatOrder,
  eligibility: nextEligibility,
  currentCard: nextTurn,
  pendingEligibilityOverrides: [],
  lifecycleStatus: postBoundaryRuntime.lifecycleStatus,
  ...(postBoundaryRuntime.consecutiveCoupRounds === undefined
    ? {}
    : { consecutiveCoupRounds: postBoundaryRuntime.consecutiveCoupRounds }),
};
```

After Spec 153 lands, this entire block is deleted. The `state -> state` refactor replaces it with a sequential-composition chain that derives the post-boundary runtime from `baseState` directly at use-time. The `lifecycleStatus` and `consecutiveCoupRounds` fields survive by construction; no manual propagation is required.

Per F14, this delete is part of the same atomic cut as Section D1's helper conversions.

### D4. Architectural-invariant property test

New test file: `packages/engine/test/determinism/turn-flow-runtime-field-propagation-property.test.ts`. Marker: `@test-class: architectural-invariant`.

Property statement (in test prose):
> For every reachable trajectory of the FITL canary seed corpus × baseline policy-profile variants under `runGameSteps`, every kernel-mutated structural runtime field set by `applyTurnFlowCardBoundary` (`lifecycleStatus.stalled`, `consecutiveCoupRounds`, and any future addition) is observable to the next iteration of the simulator loop body. Specifically: if `applyTurnFlowCardBoundary` ever sets `lifecycleStatus.stalled = true` on its returned state, the simulator's next iteration MUST observe that field as `true` and terminate with `stopReason='noLegalMoves'` within K = 1 iteration. If `consecutiveCoupRounds` is mutated, the next iteration's read of `cardDrivenRuntime(state).consecutiveCoupRounds` MUST equal the post-boundary value.

Implementation sketch:

```ts
// Wrap applyTurnFlowCardBoundary with an instrumentation tap that records
// every (call, post-boundary-runtime-snapshot) pair to a per-trajectory log.
// After the trajectory completes, walk the log and assert that for each
// recorded mutation, the simulator's next-iteration state-runtime read
// reflects the mutation (matched by stateHash continuity).
```

Test corpus selection criterion: a deliberately-chosen set of FITL `(seed, policy-profile-set)` pairs such that **at least one trajectory triggers `applyTurnFlowCardBoundary` setting `lifecycleStatus.stalled = true`** AND **at least one trajectory triggers a `consecutiveCoupRounds` mutation** (the two structural fields the boundary mutates today). A stall-blind corpus would pass even if the helpers regressed in a way that didn't happen to trigger stalls, defeating the test's purpose. Concrete seeds are selected at implementation time and the selection rationale is recorded in the implementing commit body.

Candidate starting points (neither is guaranteed to satisfy the criterion; the implementing ticket extends or replaces as needed):
- `FITL_CANARY_SEEDS = [1002, 1005, 1010, 1013]` × `FITL_PROFILE_VARIANTS` (2 profile sets) at `packages/engine/test/integration/spec-140-foundations-conformance.test.ts:17-20`.
- The post-126FREOPEBIN grant-determinism inline corpus `[1020, 1040, 1049, 1054, 2046]` at `packages/engine/test/determinism/fitl-policy-agent-canary-determinism.test.ts:51`.

Bounded `maxTurns=200`. Each `(seed, profile-set)` pair contributes one property-checked trajectory. The property holds when the assertion passes for every recorded mutation across every pair; failure produces a deterministic counterexample with seed, profile, turn count, and the dropped field.

Witness check: the test, applied to commit `ddcf3ef9` (immediately before the bug), MUST fail with a deterministic counterexample. The test, applied to HEAD after Spec 153 lands, MUST pass. This dual-direction check is the proof that the test would have caught the regression at the time it was introduced.

### D5. F11 corollary

Add the following paragraph to `docs/FOUNDATIONS.md` Section 11, immediately after the "Exception — Scoped internal mutation" paragraph:

> **Corollary — Single source of truth for kernel-mutated structural state fields**: When a kernel function returns a new `GameState` whose internal runtime structure has been mutated (e.g., `state.turnOrderState.runtime.lifecycleStatus`, `state.turnOrderState.runtime.consecutiveCoupRounds`, or any future analogous field), internal helpers that further transform that state MUST source the mutated fields from the post-effect state, not from a separately-parameterized snapshot of the runtime taken before the kernel call. The canonical helper shape for state-mutating internal helpers is `state -> state`: take state, derive runtime via the canonical accessor at use-time, mutate one or more fields, return state. The `runtime -> runtime` (or analogous) helper shape is forbidden in kernel internals because it allows callers to thread a stale runtime snapshot through helper composition and silently drop fields the caller does not know about. This corollary MUST be enforced by an architectural-invariant test for each kernel-mutated structural field, asserting that the field's value is observable to every reachable downstream code path.

This is a one-paragraph addition to F11; it does not warrant a new principle (#20) because it is a direct consequence of immutability + the scoped-mutation exception's "external contract" clause: "no aliasing that can leak outside the scope, and no observation before finalization." The corollary makes the converse explicit: no observation of pre-mutation runtime AS IF it were post-mutation runtime, either.

### D6. ABI and migration

- The four helper exports migrate (3 in `packages/engine/src/kernel/turn-flow-eligibility.ts`, 1 in `packages/engine/src/kernel/grant-lifecycle.ts`). All callers migrate in the same atomic change: the four latent-risk rebuild sites enumerated in D2 (3 in `turn-flow-eligibility.ts`, 1 in `apply-move.ts`) plus the trivial-conversion call sites across `packages/engine/src/kernel/microturn/{apply,drive,rollback}.ts`. Total call-site count is ticket-time enumerable via grep on each helper's name; the latent-risk sites are the four bullets in D2 and the trivial-conversion sites are mechanical signature updates.
- No public API changes: `applyTurnFlowEligibilityAfterMove`, `applyMove`, `runGame`, `runGameSteps`, etc., all retain their existing signatures.
- No GameSpecDoc YAML, GameDef JSON, or compiler IR change.
- The engine `dist/` rebuild is a normal `pnpm -F @ludoforge/engine build`.
- Determinism: same `(state, def, seed)` → same trajectory. The refactor is semantics-preserving by construction (each `runtime -> runtime` helper has an exactly equivalent `state -> state` form because the helpers' bodies already wrap their mutations in `cardDrivenRuntime` extract / re-inject; the new shape just inlines that wrapping).
- Per F11's scoped-mutation clause, the helpers preserve their tracker-aware draft-mutation paths exactly; only the function signature shape changes.

### D7. Verification scaffolding

Acceptance verification per Section "Acceptance Criteria" below uses the property test from D4 plus the standard CI gates (`pnpm turbo test`, `lint`, `typecheck`).

A pre-merge dry-run on the `05bf74c2` baseline (the current hot-fixed HEAD that is green) proves the refactor is semantics-preserving: replay-identity of one canary trajectory before and after the refactor must produce identical `finalState.stateHash` and identical `decisions[]`. (The pre-Spec-150 commit `343912bc` is not a valid baseline — it predates `lifecycleStatus`, so the state shape isn't comparable.)

## Acceptance Criteria

1. **Bug class eliminated**: All four `runtime -> runtime` helpers in `packages/engine/src/kernel/turn-flow-eligibility.ts` are converted to `state -> state` shape. Grep `^export const with[A-Z].*runtime: TurnFlowRuntimeState,?$` against the engine source returns zero matches after the refactor.
2. **Hot-fix retired**: The manual propagation block in `packages/engine/src/kernel/turn-flow-eligibility.ts:622-636` (added by commit `05bf74c2`) is deleted. Grep for `postBoundaryRuntime` returns zero matches.
3. **Architectural-invariant test passes**: `pnpm -F @ludoforge/engine test:determinism` includes the new `turn-flow-runtime-field-propagation-property.test.ts` (located under `packages/engine/test/determinism/`) and it passes against HEAD. The broader `pnpm turbo test` also covers it.
4. **Architectural-invariant test catches the historical regression**: The same test, when checked out and run against commit `ddcf3ef9` (Spec 150's main commit, before commit `05bf74c2`), MUST fail with a deterministic counterexample naming `lifecycleStatus.stalled` as the dropped field. (This is verified once during the spec's implementation as evidence the test is load-bearing; it is not a recurring CI gate.)
5. **F11 corollary added**: `docs/FOUNDATIONS.md` Section 11 contains the corollary paragraph from D5. The corollary is referenced by the new property test's marker comment.
6. **Replay-identity preserved**: For every `(seed, policy-profile-set)` pair in the property test's selected corpus (per D4's selection criterion), the canonical-trace `finalState.stateHash` and `decisions[]` produced by HEAD-after-Spec-153 must be byte-identical to the trace produced by HEAD-before-Spec-153 (i.e., commit `05bf74c2`'s output). This proves the refactor is semantics-preserving.
7. **Full gate**: `pnpm turbo build`, `pnpm turbo lint`, `pnpm turbo typecheck`, `pnpm turbo test` all pass on the same CI infrastructure that ships the spec.
8. **No latent dual-source pattern remaining in turn-flow / apply-move / microturn**: Explore-style audit (recorded in the implementing commit's body) confirms zero `{ ...runtime, ...overrides }` rebuilds remain in `packages/engine/src/kernel/turn-flow-*.ts`, `packages/engine/src/kernel/apply-move.ts`, `packages/engine/src/kernel/microturn/*.ts`.

## Risks

- **Refactor surface is wider than the bug**: The spec converts four helpers + ~7 call sites in a single atomic cut. Mitigated by D6's atomic-migration constraint (per F14) and by D7's replay-identity check (the refactor must produce byte-identical traces against the pre-refactor baseline; any divergence is a refactor bug, not a semantics change).
- **Property test cost**: The new property test runs the canary corpus × profiles. Estimated cost: ~30-90s per run on CI (similar to existing canary tests). Mitigated by sharding into the existing `determinism (grant-canary)` shard if cost is significant; the test is architectural-invariant class so it must run on every push.
- **F11 corollary text might be over-broad if applied literally outside turn-flow**: The corollary's wording mentions "kernel-mutated structural state fields" generally. Risk: a future contributor reads the corollary and misinterprets it as forbidding all `runtime -> runtime` helpers across the entire kernel (including tracker-internal helpers, performance-hot ID-codec lookups, etc.). Mitigated by the corollary's anchoring on "internal helpers that further transform that state" — kernel-internal helpers, not all kernel functions. If the corollary proves to need narrowing in practice, a follow-up spec can refine it.
- **Future kernel-mutated runtime fields may need explicit listing in the property test**: The property test is parameterized by the set of fields applyTurnFlowCardBoundary mutates. Adding a new mutated field (e.g., a future `pendingCoupTransition`) requires extending the test to assert observability of that field too. Mitigated by Acceptance Criterion #5's reference from the property test marker to the F11 corollary; the corollary documents the obligation, and the test class taxonomy enforces visibility for new fields. A reflective walk over `applyTurnFlowCardBoundary`'s before/after diff at trajectory time is also feasible if manual maintenance proves brittle; the spec defers that elaboration to a follow-up if needed.

## Out Of Scope

- Generalizing the `state -> state` rule to ALL kernel modules. This spec scopes the rule to turn-flow + the one identified latent site in apply-move/microturn. A separate spec may extend the rule kernel-wide if the corollary proves insufficient in practice.
- Introducing a `RuntimeFromState<S>` brand type. Considered and rejected in the alternatives section.
- Modifying `applyTurnFlowCardBoundary`'s public-API contract or its set of mutated runtime fields. The spec is upstream-of-boundary; the boundary's behavior is unchanged.
- Modifying the simulator main loop. `run-game-steps.ts:261`'s read site is unchanged; the spec ensures the read is reliable across all reachable paths.
- Updating Spec 150 or Spec 152's archived spec files. They are archived/COMPLETED. Spec 153 is the follow-up; cross-references are recorded here, not in the archive.
- Any GameSpecDoc YAML, GameDef JSON, or compiler IR change.
- Any change to the `tracker` semantics or to F11's scoped-mutation exception language.

## Follow-On Tickets

Proposed namespace: `153RUNTSOT` (Runtime Source-Of-Truth).

Anticipated decomposition (finalized by `/spec-to-tickets`):

- **153RUNTSOT-001 — Helper conversion + call-site migration (atomic)**: convert the four `runtime -> runtime` helpers per D1 to `state -> state`; refactor the four latent-risk rebuild sites in D2 to sequential composition; introduce `withResetTurnFlowRuntime`; migrate trivial-conversion sites in `microturn/{apply,drive,rollback}.ts`; delete the `05bf74c2` manual propagation block per D3. Per F14 this is a single atomic cut. Verify replay-identity against `05bf74c2` per D7.
- **153RUNTSOT-002 — Architectural-invariant property test**: add `packages/engine/test/determinism/turn-flow-runtime-field-propagation-property.test.ts` per D4 with marker `@test-class: architectural-invariant`. Select the seed corpus per D4's criterion (must include at least one stall-triggering and one coupRound-mutating trajectory). Verify it fails against `ddcf3ef9` and passes against HEAD-after-001 per AC#4.
- **153RUNTSOT-003 — F11 corollary in `docs/FOUNDATIONS.md`**: add the corollary paragraph from D5 immediately after F11's "Exception — Scoped internal mutation" paragraph; reference it from the property test's marker comment per AC#5.

## Tickets

Decomposed via `/spec-to-tickets` on 2026-05-02:

- [`archive/tickets/153RUNTSOT-001.md`](../archive/tickets/153RUNTSOT-001.md) — Convert four runtime helpers to `state → state` and retire the `05bf74c2` hot-fix (atomic) (covers D1–D3, D6, D7; AC#1, AC#2, AC#6, AC#7, AC#8)
- [`tickets/153RUNTSOT-002.md`](../tickets/153RUNTSOT-002.md) — Architectural-invariant property test for runtime field propagation (covers D4; AC#3, AC#4)
- [`archive/tickets/153RUNTSOT-003.md`](../archive/tickets/153RUNTSOT-003.md) — Add F11 corollary for runtime-mutated structural state field source-of-truth (covers D5; AC#5)
