# 184WASMPREDRI-006: Phase 3.6 — Fix remaining decision-47 preview-drive parity gap

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-score-routing.ts` and `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts`
**Deps**: `archive/tickets/184WASMPREDRI-005.md`

## Problem

`archive/tickets/184WASMPREDRI-004.md` could not yet safely remove the defensive `previewFeatureRowsExerciseAggregate` fallback. A live removal probe on 2026-05-20 rebuilt the engine and ran `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js`; the test failed at decision 47 with the same aggregate score divergence seen before ticket 005. WASM and TypeScript both selected `rally`, but WASM candidate scores were 500 lower than TypeScript for aggregate-fed margin candidates.

Ticket 005's seat-context dynamic-row support was necessary but not sufficient. This ticket owns the remaining root-cause preview-drive parity gap so ticket 004 can later delete the fallback without weakening the WASM/TS byte-equivalence oracle.

## Assumption Reassessment (2026-05-20)

1. `archive/tickets/184WASMPREDRI-005.md` has landed and is no longer the active owner for the remaining red proof.
2. The trigger oracle still fails only when the aggregate fallback is removed; with the fallback restored, production routing retains the Spec 175 TS-fallback safety path.
3. The failure is architecture-relevant, not a harmless score display difference: the candidate-score rows are part of the byte-equivalence oracle required by Spec 184 and Foundations #8, #16, and #20.
4. `archive/tickets/184WASMPREDRI-004.md` remained the cleanup owner for deleting `previewFeatureRowsExerciseAggregate`; this ticket owned the prerequisite parity fix.

## Boundary Reset (2026-05-20)

User approved option 1 after a live probe confirmed that the remaining decision-47 gap is deeper than the seat-matrix row support from ticket 005 and is not fixed by a generic `chooseN` max-prefix binding model.

Evidence:

1. With the aggregate fallback temporarily bypassed, `pnpm -F @ludoforge/engine build` passed.
2. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` still failed at decision 47: WASM and TypeScript both selected `rally`, but WASM candidate scores were 500 lower for aggregate-fed margin candidates.
3. Diagnostic row probes showed the first decisive row mismatch remained `tax|{}|false|operationPlusSpecialActivity`: TypeScript fallback computed `projectedSelfMargin = -3`, while the WASM preview-drive row computed `-1`.
4. A temporary generic `chooseN` max-prefix binding probe did not make the fallback-bypassed tournament witness pass, so full gated continuation modeling is not a safe same-ticket shortcut.

Corrected boundary:

1. This ticket owns a generic row-level Spec 175 TS-oracle fallback for non-ready aggregate-fed preview candidate-feature rows, so the byte-equivalence oracle stays authoritative when the broad aggregate fallback is bypassed.
2. This ticket does not own full agent-guided gated continuation modeling in the WASM preview drive.
3. `archive/tickets/184WASMPREDRI-004.md` remained the only owner for deleting `previewFeatureRowsExerciseAggregate` after this row-level fallback was proven.

## Architecture Check

1. The TypeScript preview evaluator remains the oracle; this ticket must make the WASM preview-drive path match it rather than weakening the oracle.
2. The fix must preserve the Spec 175 null-return fallback contract for legitimately unsupported shapes.
3. Any Rust/TypeScript ABI or marshaling change must remain generic and deterministic, with no game-specific branches or FITL-only shortcuts.
4. Preview signal integrity must stay explicit: unsupported paths remain documented fallback paths, while supported paths produce byte-equivalent candidate-score rows.

## What to Change

### 1. Isolate the remaining divergence

Reproduce the decision-47 failure with the fallback temporarily disabled and identify the first non-equivalent preview-drive value, status, slot, or candidate row after ticket 005's seat-context support.

### 2. Fix the aggregate-fed row fallback path

Patch the smallest generic score-routing seam that makes aggregate-fed preview candidate-feature rows byte-equivalent to the TypeScript oracle when a WASM preview-drive row is unavailable or non-ready. The fallback must be row-local, not a broad aggregate-feature bypass, so supported rows still exercise the WASM preview-drive path.

### 3. Add focused regression coverage

Add or extend focused parity coverage so this remaining shape cannot regress without requiring a manual fallback-removal probe as the only witness.

### 4. Leave ticket 004's cleanup for ticket 004

Do not remove `previewFeatureRowsExerciseAggregate` in this ticket except as a temporary local probe. Ticket 004 owns the durable deletion and final 15-seed route-count proof after this prerequisite lands.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify only if needed for diagnostics, fixture hooks, or generic marshaling)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify if the remaining parity gap is in TS-side drive preparation or row decoding)
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify if the remaining parity gap is in Rust-side drive execution)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (modify if fixture coverage is the cleanest regression witness)
- `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` or adjacent focused integration tests (modify only if needed to expose the narrowed invariant)

## Out of Scope

- Removing `previewFeatureRowsExerciseAggregate`; that remains ticket 004.
- Weakening `arvn-tournament-wasm-equivalence.test.ts` or accepting score-row divergence.
- Spec 175 contract changes.
- Texas profile-fingerprint stability or unrelated profile-quality retargeting.

## Acceptance Criteria

### Tests That Must Pass

1. With `previewFeatureRowsExerciseAggregate` temporarily disabled or bypassed for the probe, `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` no longer fails at decision 47 with the aggregate-fed margin score divergence.
2. A focused parity fixture or integration test covers the narrowed remaining shape and fails on the pre-fix behavior.
3. `pnpm -F @ludoforge/engine test:integration:policy-canaries` passes.
4. `pnpm -F @ludoforge/engine test:integration` passes or any remaining failure is explicitly proven unrelated to this ticket's changed path.

### Invariants

1. No game-specific action or profile branching is introduced into engine or WASM production code.
2. Unsupported preview-drive shapes still return through the Spec 175 null-return fallback path.
3. Ticket 004 remains the only owner for the durable `previewFeatureRowsExerciseAggregate` deletion.
4. Full gated continuation modeling remains out of scope for this ticket unless a later user-approved boundary reset widens the ticket again.

## Test Plan

### New/Modified Tests

1. Focused parity fixture or integration test for the narrowed decision-47 shape — proves the remaining aggregate-fed margin path is byte-equivalent without relying only on the broad tournament witness.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js`
3. `pnpm -F @ludoforge/engine test:integration:policy-canaries`
4. `pnpm -F @ludoforge/engine test:integration`

## Outcome (2026-05-20)

Implemented the approved row-level Spec 175 oracle fallback for aggregate-fed preview candidate-feature rows:

1. `policy-wasm-score-routing.ts` now distinguishes candidate features that feed plan aggregates from other preview candidate-feature rows.
2. Aggregate-fed rows still attempt WASM materialization when the broad aggregate fallback is bypassed, but non-ready or unavailable preview values are replaced row-locally with the TypeScript oracle value instead of poisoning the aggregate with a fallback state value.
3. A test-only routing hook forces aggregate-fed preview rows through WASM materialization so the regression witness can prove the row-local fallback while ticket 004 still owns durable deletion of `previewFeatureRowsExerciseAggregate`.
4. `arvn-tournament-wasm-equivalence.test.ts` now includes a focused decision-47 regression test that confirms both the production score-row route and preview candidate-feature WASM materialization path were exercised.

Proof:

1. `pnpm -F @ludoforge/engine build` — passed.
2. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — passed, including the new forced-aggregate-preview-row decision-47 witness.
3. `pnpm -F @ludoforge/engine test:integration:policy-canaries` — passed.
4. `pnpm -F @ludoforge/engine test:integration` — passed, `311/311` integration files.
5. `wc -l packages/engine/src/agents/policy-wasm-score-routing.ts packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` — `policy-wasm-score-routing.ts` is 703 lines and the test file is 149 lines; both are under the 800-line cap.

Ticket 004 remains the cleanup owner for removing `previewFeatureRowsExerciseAggregate` and proving the final 15-seed route-count witness.
