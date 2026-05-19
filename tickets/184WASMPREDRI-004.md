# 184WASMPREDRI-004: Phase 4 — Remove defensive aggregate-coverage fallback

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-score-routing.ts` (delete `previewFeatureRowsExerciseAggregate` and inline its call site)
**Deps**: `tickets/184WASMPREDRI-002.md`, `tickets/184WASMPREDRI-003.md`

## Problem

Spec 184 §4 Phase 4 requires removing the defensive `previewFeatureRowsExerciseAggregate` fallback introduced in commit `a651c3a41` ("fix: route preview-classed candidate features through TS when feeding plan aggregates", 2026-05-19). The fallback was a documented temporary workaround pending Spec 184: it forces `materializePreviewDynamicRowsWithWasm` to return `null` for any preview-classed candidate feature that feeds a plan aggregate, routing those features to the Spec 175 TS evaluator instead of letting the WASM preview drive produce a (potentially divergent) projected value.

After tickets 002 and 003 land, every action × profile shape the FITL production tournament exercises is either supported by the WASM drive (a — proven via parity fixture) or formally documented as unsupported with parity coverage (b — proven via reason-coverage fixture). The defensive fallback's reason for existing — silent WASM divergence on preview-aggregate features for unmodeled shapes — no longer applies. Removing it restores Foundation #15 architectural completeness: the WASM drive is engaged on the previously-divergent paths, and Foundation #20 Preview Signal Integrity holds via the documented contract chain.

## Assumption Reassessment (2026-05-19)

1. The defensive fallback ternary is at `packages/engine/src/agents/policy-wasm-score-routing.ts:493-498` (the `previewFeatureRowsExerciseAggregate(...) ? null : materializePreviewDynamicRowsWithWasm(...)` expression). Confirmed during spec reassessment.
2. The fallback function definition lives at `policy-wasm-score-routing.ts:412-427`. It has exactly one call site (line 493) — verified via grep during spec reassessment.
3. After removal, the WASM preview drive is engaged for candidate features that feed plan aggregates. Tickets 002 and 003 are prerequisites: 002 supplies drive coverage for (a) shapes (WASM returns `ready`), and 003 supplies parity coverage for (b) shapes (WASM returns `null` → routes to TS per Spec 175).
4. `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` is the trigger test. It currently passes because the defensive fallback diverts the divergent path; after removal it must still pass with the WASM drive engaged on the previously-divergent paths.
5. The defensive-fallback commit (`a651c3a41`) lands on the same branch as the spec; this ticket's diff is the inverse cleanup.

## Architecture Check

1. Removal restores root-cause architectural completeness (Foundation #15) — the defensive workaround was a documented temporary measure pending Spec 184; tickets 002 and 003 supply the architectural fix.
2. Determinism preserved (Foundation #8) — WASM/TS equivalence is now guaranteed by tickets 002 and 003 for every shape the FITL production tournament exercises.
3. Foundation #14 (No Backwards Compatibility) — the fallback function is deleted, not deprecated; no shim retained.
4. Foundation #20 (Preview Signal Integrity) — preview refs now resolve via the documented contract chain: WASM drive `ready` → projected value; WASM drive `unsupported` → null-return → TS evaluator (Spec 175). No silent coercion paths remain.

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

- Any further drive extension or reason-coverage authoring (tickets 002, 003 are prerequisites that must already cover the surface).
- Spec 175 contract changes — the null-return → TS-fallback architecture stays unchanged; this ticket relies on it.
- Texas profile-fingerprint stability under schema-empty renames — explicitly out-of-scope per spec §8 and the spec's Non-Goals.
- Defensive WASM-vs-TS spot-check at preview-drive boundaries — explicitly out-of-scope per spec §8 (future watchdog if drive coverage stays partial).

## Acceptance Criteria

### Tests That Must Pass

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

1. `pnpm -F @ludoforge/engine test:integration:policy-canaries` — primary regression gate
2. `pnpm -F @ludoforge/engine test:integration` — broader equivalence sweep including bytecode and preview-drive equivalence tests
3. `node packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` — manual route-count and unsupported-count comparison against baseline
4. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck` — full repo quality gate
