# 184WASMPREDRI-004: Phase 4 — Remove defensive aggregate-coverage fallback

**Status**: BLOCKED by prerequisite
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-score-routing.ts` (delete `previewFeatureRowsExerciseAggregate` and inline its call site)
**Deps**: `archive/tickets/184WASMPREDRI-002.md`, `archive/tickets/184WASMPREDRI-003.md`, `archive/tickets/184WASMPREDRI-005.md`, `tickets/184WASMPREDRI-006.md`

## Problem

Spec 184 §4 Phase 4 requires removing the defensive `previewFeatureRowsExerciseAggregate` fallback introduced in commit `a651c3a41` ("fix: route preview-classed candidate features through TS when feeding plan aggregates", 2026-05-19). The fallback was a documented temporary workaround pending Spec 184: it forces `materializePreviewDynamicRowsWithWasm` to return `null` for any preview-classed candidate feature that feeds a plan aggregate, routing those features to the Spec 175 TS evaluator instead of letting the WASM preview drive produce a (potentially divergent) projected value.

After tickets 002 and 003 landed, live proof showed one prerequisite was still missing: `$seat` seat-matrix `victoryCurrentMargin` refs inside aggregate-fed preview candidate features were intentionally documented as unsupported by ticket 003 and covered by TS fallback parity, but removing this aggregate fallback made `arvn-tournament-wasm-equivalence.test.ts` red at decision 47. `archive/tickets/184WASMPREDRI-005.md` added seat-context dynamic-row support, but the 2026-05-20 fallback-removal probe still reproduced the same decision-47 aggregate score divergence. `tickets/184WASMPREDRI-006.md` now owns the remaining preview-drive parity gap.

## Assumption Reassessment (2026-05-19)

1. The defensive fallback ternary is at `packages/engine/src/agents/policy-wasm-score-routing.ts:493-498` (the `previewFeatureRowsExerciseAggregate(...) ? null : materializePreviewDynamicRowsWithWasm(...)` expression). Confirmed during spec reassessment.
2. The fallback function definition lives at `policy-wasm-score-routing.ts:412-427`. It has exactly one call site (line 493) — verified via grep during spec reassessment.
3. After removal, the WASM preview drive is engaged for candidate features that feed plan aggregates. Tickets 002 and 003 are prerequisites: 002 supplies drive coverage for (a) shapes (WASM returns `ready`), and 003 supplies parity coverage for (b) shapes (WASM returns `null` → routes to TS per Spec 175). Ticket 006 is now also a prerequisite because ticket 005's seat-context dynamic-row support did not make the removal proof green.
4. `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` is the trigger test. It currently passes because the defensive fallback diverts the divergent path; after removal it must still pass with the WASM drive engaged on the previously-divergent paths.
5. The defensive-fallback commit (`a651c3a41`) lands on the same branch as the spec; this ticket's diff is the inverse cleanup.

## Boundary Reset (2026-05-19)

User approved option 1 after the removal probe failed: keep the aggregate fallback until `$seat` dynamic-row ABI support exists, and create a successor ticket for the real prerequisite instead of weakening the oracle or widening this cleanup ticket.

Evidence:

1. `pnpm -F @ludoforge/engine build` — passed after the temporary source deletion.
2. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — failed at decision 47 with the original aggregate score divergence: WASM and TypeScript both selected `rally`, but WASM candidate scores were 500 lower for the non-`tax` candidates that depend on the aggregate-fed preview margin.
3. The deletion probe was restored; no source change is retained by this ticket.

Corrected boundary:

1. This ticket remains the owner for deleting `previewFeatureRowsExerciseAggregate`.
2. `archive/tickets/184WASMPREDRI-005.md` owns and has landed the prerequisite `$seat` dynamic-row ABI support for aggregate-fed preview refs.
3. The defensive fallback remains in place only until this ticket deletes it and revalidates the byte-equivalence oracle.

## Boundary Reset (2026-05-20)

User approved option 1 after a second removal probe failed despite archived ticket 005: restore the aggregate fallback, keep this ticket blocked, and create a successor for the remaining parity gap instead of weakening the WASM/TS score-row oracle or widening this cleanup ticket.

Evidence:

1. `pnpm -F @ludoforge/engine build` — passed after the temporary source deletion.
2. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — failed at decision 47 with the original aggregate score divergence: WASM and TypeScript both selected `rally`, but WASM candidate scores were 500 lower than TypeScript for aggregate-fed margin candidates.
3. The deletion probe was restored; the production fallback remains active.

Corrected boundary:

1. This ticket remains the owner for deleting `previewFeatureRowsExerciseAggregate`.
2. `tickets/184WASMPREDRI-006.md` owns diagnosing and fixing the remaining preview-drive parity gap that still appears when the fallback is removed.
3. This ticket is not archive-ready until ticket 006 lands and this ticket's trigger oracle passes with the fallback removed.

## Architecture Check

1. Removal will restore root-cause architectural completeness (Foundation #15) only after ticket 006 lands the remaining preview-drive parity fix.
2. Determinism preserved (Foundation #8) — WASM/TS equivalence must remain the acceptance gate; the failed 2026-05-20 removal probe is the proof that this ticket must stay blocked.
3. Foundation #14 (No Backwards Compatibility) — the fallback function is deleted, not deprecated; no shim retained.
4. Foundation #20 (Preview Signal Integrity) — preview refs must resolve via a contract chain that preserves byte-equivalent candidate scores. Ticket 005 supplies per-seat dynamic rows; this ticket must prove the fallback can now be removed without score divergence.

## What to Change

### 1. Inline the materialization call

At `packages/engine/src/agents/policy-wasm-score-routing.ts:493-498`, replace the ternary with the unconditional `materializePreviewDynamicRowsWithWasm(input, collectPreviewDynamicRefs(feature.expr))` call. The `null` branch of the original ternary still happens — it's now driven by the WASM drive itself when a (b)-classified unsupported shape is encountered.

### 2. Delete the gating function

Delete `previewFeatureRowsExerciseAggregate` (definition at `policy-wasm-score-routing.ts:412-427`). Verify via grep that no other call sites exist (the spec reassessment confirmed exactly one call site at line 493).

### 3. Trigger-test verification

Run `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` and confirm it passes with the WASM drive engaged on the previously-divergent paths. The 80-decision deepEqual at seed 1000 (4 seats) is the architectural-invariant proof.

### 4. 15-seed report regression check

Run `node packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` and confirm:
- `wasmProductionPreviewDriveRouteCount` is ≥ baseline (proving the drive is engaged on the previously-bypassed paths)
- `wasmProductionPreviewDriveUnsupportedCount` shows zero new unsupported reasons (proving tickets 002 and 003 covered the surface)

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — delete function definition + inline its call site)

## Out of Scope

- Any further drive extension or reason-coverage authoring. Ticket 005 now owns the missing `$seat` dynamic-row prerequisite; tickets 002 and 003 cover the already-landed supported/unsupported proof surface.
- Spec 175 contract changes — the null-return → TS-fallback architecture stays unchanged; this ticket relies on it.
- Texas profile-fingerprint stability under schema-empty renames — explicitly out-of-scope per spec §8 and the spec's Non-Goals.
- Defensive WASM-vs-TS spot-check at preview-drive boundaries — explicitly out-of-scope per spec §8 (future watchdog if drive coverage stays partial).

## Acceptance Criteria

### Tests That Must Pass

The prerequisite chain includes `archive/tickets/184WASMPREDRI-005.md` and the active residual owner `tickets/184WASMPREDRI-006.md`. The following gates are required after ticket 006 lands:

1. `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` — passes with the defensive fallback removed and the WASM drive engaged on the previously-divergent paths.
2. `pnpm -F @ludoforge/engine test:integration:policy-canaries` — passes.
3. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` — no regression (per spec §5).
4. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` — no regression (per spec §5).
5. `pnpm turbo test` — full engine + runner suite.

### Invariants

1. `grep -rn "previewFeatureRowsExerciseAggregate" packages/engine/` returns zero matches after this ticket lands.
2. The 15-seed report records `wasmProductionPreviewDriveRouteCount` ≥ baseline and zero new unsupported reasons.
3. WASM/TS equivalence is the active oracle on every previously-divergent path; no silent fallback intercepts preview candidate features that feed plan aggregates.

## Test Plan

### New/Modified Tests

None — this ticket relies on existing tests passing under the new code path. The architectural proof is the existing `arvn-tournament-wasm-equivalence.test.ts` continuing to pass with the WASM drive engaged.

### Commands

Run:

1. `pnpm -F @ludoforge/engine test:integration:policy-canaries` — primary regression gate
2. `pnpm -F @ludoforge/engine test:integration` — broader equivalence sweep including bytecode and preview-drive equivalence tests
3. `node packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` — manual route-count and unsupported-count comparison against baseline
4. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck` — full repo quality gate

## Prior Blocked Probe

Blocked: 2026-05-19

What landed:

- No source change. The attempted deletion of `previewFeatureRowsExerciseAggregate` was restored after the trigger proof failed.
- Ticket/spec ownership was corrected so this deletion waits on `archive/tickets/184WASMPREDRI-005.md`.

Why blocked:

- Removing the fallback before `$seat` dynamic-row ABI support exists makes `arvn-tournament-wasm-equivalence.test.ts` fail at decision 47 with the original aggregate score divergence.
- Archived ticket 003 intentionally documents the residual `$seat` `victoryCurrentMargin` shape as unsupported with TS fallback parity. That is not enough for this ticket's acceptance criterion, because this ticket removes the aggregate-level fallback that makes the score row byte-equivalent.

Verification:

- `pnpm -F @ludoforge/engine build` — passed before the deletion probe.
- `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — failed at decision 47 after fallback removal; source deletion restored.

Next workflow:

- `$implement-ticket tickets/184WASMPREDRI-004.md . Rely on specs/184-wasm-preview-drive-aggregate-coverage.md`

Readiness update: 2026-05-19 (superseded on 2026-05-20)

- `archive/tickets/184WASMPREDRI-005.md` has landed the prerequisite seat-context dynamic-row support. A 2026-05-20 removal probe proved this was insufficient; this ticket is blocked again by `tickets/184WASMPREDRI-006.md`.

Blocked again: 2026-05-20

What landed:

- No source deletion. The attempted removal of `previewFeatureRowsExerciseAggregate` was restored after the trigger proof failed.
- Ticket/spec ownership was corrected so the remaining preview-drive parity gap is owned by `tickets/184WASMPREDRI-006.md`.

Why blocked:

- Removing the fallback after ticket 005 still makes `arvn-tournament-wasm-equivalence.test.ts` fail at decision 47 with the original aggregate score divergence.
- Proceeding would violate the byte-equivalence oracle required by Foundations #8, #16, and #20.

Verification:

- `pnpm -F @ludoforge/engine build` — passed before the deletion probe.
- `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — failed at decision 47 after fallback removal; source deletion restored.

Next workflow:

- `$implement-ticket tickets/184WASMPREDRI-006.md . Rely on specs/184-wasm-preview-drive-aggregate-coverage.md`
