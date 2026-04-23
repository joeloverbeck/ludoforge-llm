# 143BOURUNMEM-004: Scope-boundary enforcement for decision-local-transient helpers

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel (chooseN session, microturn types/apply/publish), agents (policy preview, granted-operation helpers). Exact surface refined against 002's authoritative classification.
**Deps**: `archive/tickets/143BOURUNMEM-002.md`

## Problem

Spec 143 Design Section 3: "Preview and witness-search helpers must be scope-bounded. Any helper used for chooseN witness search, granted-operation preview, policy candidate preview/evaluation, or legality/constructibility support probing must declare owner scope, key shape, maximum retained population per scope, and drop/reset rule at scope exit. The engine must not rely on 'the GC will eventually recover it' as the only boundedness mechanism for these helpers."

Spec 143 Design Section 6: "Live state should retain atomic reconstruction data only where replay/continuation actually requires it. If a field exists only for convenience of intermediate preview/search work and is not required for authoritative continuation, it should not remain embedded in long-lived state objects."

002's authoritative classification flags which helpers and fields are `decision-local-transient` but are currently retained across scope boundaries (behaving as if `run-local-structural`). This ticket enforces the correct scope-boundary contract on those flagged sites: explicit drop/reset at scope exit for helpers, and field-split for decision-stack frames (continuation-required → `persistent-authoritative`; transient preview/search → `decision-local-transient`).

## Assumption Reassessment (2026-04-23)

1. ChooseN session has explicit construction (confirmed at `packages/engine/src/kernel/choose-n-session.ts:313-314` — caches initialized on session creation); whether a symmetric drop-at-session-exit exists is a 002 finding.
2. Policy preview contexts are created per publication / preview evaluation (confirmed at `packages/engine/src/agents/policy-preview.ts:84-95`). 002 classifies whether a context is dropped at scope exit or retained into the next scope.
3. `DecisionStackFrame.accumulatedBindings` (at `packages/engine/src/kernel/microturn/types.ts:205-212`) was already reduced per Spec 143 Problem section ("child decision-stack frames were redundantly copying root `accumulatedBindings`; removing that duplication helped but did not solve the OOM"). The residual field-split work — separating continuation-required fields from transient preview/search fields — is this ticket's scope.
4. Foundation 11 (Immutability) Exception — Scoped internal mutation: in-scope drop/reset logic may mutate private draft state as long as no aliasing escapes the scope and no observation occurs before finalization. The external contract `apply(state) -> newState` is unchanged. The Foundation 11 exception is regression-tested (existing `packages/engine/test/` suite contains tests that enforce the no-aliasing guarantee).

## Architecture Check

1. **Ownership contract made explicit**: every decision-local-transient helper gets owner scope, key shape, max retained population, and drop/reset rule declared in code (typically as TSDoc on the field, plus an assertion in the scope-exit path). Foundation 15 — architectural completeness.
2. **Field-split over field-compaction**: Section 6 is about **classification**, not size reduction. A field that is "only for convenience of intermediate preview/search work" should move to a different carrier (a transient scope object) rather than shrink in-place within the long-lived carrier. This cleanly separates lifetimes.
3. **Agnostic boundaries preserved**: no FITL-specific scope-boundary logic (Foundation 1). Scope semantics are expressed over generic kernel concepts (chooseN session, microturn scope, decision-stack frame).
4. **Foundation 11 scoped-mutation exception respected**: any internal drop/reset uses the private-draft pattern; external contract unchanged. Regression test coverage is mandatory per Foundation 11.
5. **Foundation 19 alignment**: the split ensures live engine state retains atomic decision context only — transient preview/search context moves to a carrier that does not survive decision boundaries.
6. **No backwards-compatibility shims** (Foundation 14): the field split is atomic; old long-lived fields are removed, and all read sites migrate to the new transient carrier in the same commit. Test fixtures constructing the old frame shape are updated in the same ticket.

## What to Change

The exact per-structure work is refined against 002's audit findings. At minimum, expect:

### 1. ChooseN session drop/reset (`packages/engine/src/kernel/choose-n-session.ts`)

Add explicit drop-at-session-exit for `probeCache` and `legalityCache`. Declare owner scope (ChooseN session), key shape, max retained population (bounded by the session's candidate surface, not by decision count), and drop rule (cleared in the session-exit path).

### 2. Policy preview context drop (`packages/engine/src/agents/policy-preview.ts`)

Ensure the context created for one publication / preview evaluation is dropped when that evaluation scope closes. If multiple evaluations share a context via caching, the cache is itself bounded by the containing scope.

### 3. Decision-stack frame field split (`packages/engine/src/kernel/microturn/types.ts`)

Split `DecisionStackFrame` fields into two groups per 002's classification:

- **Continuation-required** (`persistent-authoritative`): fields needed to resume deterministic execution, reconstruct the next atomic decision boundary, or preserve replay/audit correctness. Stay on the frame.
- **Transient preview/search** (`decision-local-transient`): fields used only for intermediate preview or witness-search work. Move to a separate transient-scope carrier, dropped at the scope's exit path.

Migrate all read sites (likely `apply.ts`, `publish.ts`, `legal-choices.ts`, policy-preview code paths) to use the new carriers. Update frame-constructing tests atomically.

### 4. Granted-operation / decision-preview helpers

If 002 flags granted-operation helpers as retained across decision scopes, add explicit scope-exit drop. These helpers typically live near `policy-preview.ts` and `legal-choices.ts`.

### 5. Regression tests for Foundation 11 scoped-mutation exception

Add or extend tests asserting that the new in-scope mutation (for drop/reset) does not alias out of scope. If the existing no-aliasing suite covers the new mutation sites structurally, cite the covering tests in the commit; otherwise add targeted tests.

## Files to Touch

Exact list depends on 002's classification. Likely surface:

- `packages/engine/src/kernel/choose-n-session.ts` (modify) — session-exit drop of caches
- `packages/engine/src/kernel/microturn/types.ts` (modify) — DecisionStackFrame field split
- `packages/engine/src/kernel/microturn/apply.ts` (modify) — consume new transient carriers
- `packages/engine/src/kernel/microturn/publish.ts` (modify) — populate new transient carriers
- `packages/engine/src/kernel/legal-choices.ts` (modify, if flagged by 002)
- `packages/engine/src/agents/policy-preview.ts` (modify) — context-exit drop, possibly granted-op scope
- `packages/engine/test/` (modify) — migrate fixtures and tests that construct the old frame shape (blast radius from 002's audit)

## Out of Scope

- Canonical-identity compaction (covered by 003) — this ticket changes **when** state drops, not the **shape** of its keys.
- New witness tests (covered by 005/006/007). Note: the engine-generic drop/compact regression authored in 007 relies on this ticket's scope-exit contracts being in place.
- Any change to externally observable state (`GameState`, replay fixtures) — Foundation 13 preservation is mandatory.

## Acceptance Criteria

### Tests That Must Pass

1. Full determinism corpus: `pnpm -F @ludoforge/engine test:e2e` — replay identity bit-identical before and after.
2. Full engine suite: `pnpm -F @ludoforge/engine test:all`.
3. Foundation 11 no-aliasing regression suite continues to pass after the new drop/reset sites (covering sites may need extension; any gap is flagged and covered in the same commit).
4. No regression in replay fixtures.

### Invariants

1. Every decision-local-transient helper has an explicit owner scope, key shape, max retained population, and drop/reset rule documented in code (TSDoc on declaration + assertion in scope-exit path where applicable).
2. No `DecisionStackFrame` field exists purely for convenience of intermediate preview/search work — such fields live in a transient carrier that does not survive decision boundaries.
3. Foundation 11 scoped-mutation exception: internal drop/reset mutation does not alias out of the containing scope.
4. Foundation 13: externally observable state (GameState snapshots, replay fixtures, GameDef hashes) is bit-identical before and after.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/decision-local-scope-drop.test.ts` (new, partial coverage here; 007 hardens with an engine-generic determinism-tier variant) — asserts chooseN session caches are cleared on session exit.
2. `packages/engine/test/unit/kernel/decision-stack-frame-shape.test.ts` (new) — asserts the post-split frame shape retains only continuation-required fields.
3. Migrate any existing test constructing the old frame shape or reading removed fields (blast radius depends on 002).

### Commands

1. Build + targeted focused proofs: `pnpm -F @ludoforge/engine build`, then `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/decision-local-scope-drop.test.js dist/test/unit/kernel/decision-stack-frame-shape.test.js dist/test/unit/schema-artifacts-sync.test.js`
2. Full determinism-tier proof: `pnpm -F @ludoforge/engine test:e2e`
3. Full engine suite and package/workspace checks: `pnpm -F @ludoforge/engine test:all`, `pnpm turbo lint`, `pnpm turbo typecheck`

## Outcome

Completion date: 2026-04-24

- Implemented: root-only `continuationBindings` replaced child-frame `accumulatedBindings` retention in the decision stack, with runtime/schema/test migration across `packages/engine/src/kernel/microturn/*`, `packages/engine/src/kernel/schemas-core.ts`, and `packages/engine/schemas/Trace.schema.json`.
- Implemented: explicit chooseN scope-exit cleanup via `disposeChooseNSession(...)`, plus focused regression coverage in `packages/engine/test/unit/kernel/decision-local-scope-drop.test.ts` and `packages/engine/test/unit/kernel/decision-stack-frame-shape.test.ts`.
- Implemented: the remaining Foundations-aligned root-cause fix widened beyond the original local slice into policy preview/runtime ownership and bounded runtime-value hashing. The landed seam keeps generic preview state reads atomic/bounded, makes granted-operation preview lazy instead of eager, adds bounded structural fallback for chooseOne agent evaluation, and avoids interning runtime-valued Zobrist features into the run-local cache.
- Deviations from original plan: the initial bounded local implementation was not sufficient because the ticket's named broad acceptance lane still failed on isolated Spec 140 OOM witnesses. Per `docs/FOUNDATIONS.md`, the owned boundary widened in-place and the proof surface was updated to the truthful final set above rather than the draft `--test-name-pattern`/`pnpm turbo test` command mix.
- Remaining active follow-ons: `tickets/143BOURUNMEM-005.md`, `tickets/143BOURUNMEM-006.md`, and `tickets/143BOURUNMEM-007.md` still own the spec's long-run/advisory witness work. No additional production-code follow-up was evidenced during this review.
- Verification results: `pnpm -F @ludoforge/engine build`; `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/decision-local-scope-drop.test.js dist/test/unit/kernel/decision-stack-frame-shape.test.js dist/test/unit/schema-artifacts-sync.test.js`; `pnpm -F @ludoforge/engine test:e2e`; `pnpm -F @ludoforge/engine test:all`; `pnpm turbo lint`; `pnpm turbo typecheck`.
