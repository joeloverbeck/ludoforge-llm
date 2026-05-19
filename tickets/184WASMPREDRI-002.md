# 184WASMPREDRI-002: Phase 2 — Extend WASM preview drive for (a)-classified action shapes

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `packages/engine-wasm/policy-vm/src/preview_drive.rs` (Rust state-mutation handlers), `packages/engine/src/agents/policy-wasm-preview-drive.ts` (marshaling, if required), parity fixtures under `packages/engine/test/integration/`
**Deps**: `archive/tickets/184WASMPREDRI-001.md`

## Problem

Spec 184 §4 Phase 2 requires implementing Rust-side preview-drive extensions for each `(a)-classified` action × profile shape from the Phase 0 inventory authored in ticket 001. Each extension adds the missing state-mutation handler to `preview_drive.rs` so the drive returns `ready` (or `stochastic`) for that shape rather than `failed` / `unresolved`. Each extension lands with a parity-oracle fixture proving WASM-on produces byte-equivalent candidate-score rows to WASM-off (the Spec 175 TS-evaluator oracle).

Per Spec 184 §6, this phase carries the highest scope risk: if the (a)-classification share is large in ticket 001's output, this ticket may need to be re-decomposed at `/implement-ticket` time. The risk is acknowledged and bounded by the inventory.

## Assumption Reassessment (2026-05-19)

1. `materializePreviewDynamicRowsWithWasm` (`packages/engine/src/agents/policy-wasm-score-routing.ts:246`) delegates to `evaluateProductionPreviewDriveBatchWithWasm` in `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`, which calls the Rust export `ludoforge_policy_vm_evaluate_preview_drive_batch` — confirmed.
2. The Rust drive enumerates outcomes `OUTCOME_COMPLETED`, `OUTCOME_STOCHASTIC`, `OUTCOME_DEPTH_CAP`, `OUTCOME_FAILED`. The TS-side mapping (`packages/engine/src/agents/policy-wasm-preview-drive.ts:682-685`) translates these to `ready`, `stochastic`, `unresolved`/`gated`, `failed`. `previewValueFromWasmRow` returns `undefined` for outcomes ∉ {`ready`, `stochastic`} (`policy-wasm-production-preview-drive.ts:358-362`).
3. `tax` (the failing-case anchor in Spec 184 §3.1) and analogous (a) shapes currently outcome to `OUTCOME_FAILED` because state-mutation handlers for them are absent in `preview_drive.rs`. The exact shape inventory is in ticket 001's report.
4. The parity fixture registry lives at `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts`; the equivalence test that consumes it is `policy-wasm-preview-drive-equivalence.test.ts` (architectural-invariant).

## Architecture Check

1. Drive extensions stay engine-agnostic — `preview_drive.rs` operates on the generic compiled state representation; no game-specific identifiers (Foundation #1).
2. WASM/TS equivalence is the oracle for correctness (Foundation #8 Determinism, plus the Spec 175 null-return contract). Each extension proves equivalence via a parity fixture; absent equivalence, the contract demands null-return (which routes to TS), not silent divergence.
3. Foundation #20 (Preview Signal Integrity): for supported shapes the drive now returns `ready` with the projected value, so consideration expressions like `coalesce(preview.victory.currentMargin.self, feature.selfMargin)` resolve to the actual projected value rather than silently falling back to the state-feature (which was the Spec 184 root cause).
4. No backwards-compatibility shim — extensions are net-new code paths in the drive; no deprecated alternatives retained (Foundation #14).

## What to Change

### 1. Per-shape Rust state-mutation handlers

For each (a)-classified entry from `reports/184-phase-0-wasm-preview-drive-divergence-inventory.md`, add the missing state-mutation handler in `packages/engine-wasm/policy-vm/src/preview_drive.rs`. The handler models the kernel-side effect on the encoded preview state so the drive can compute the candidate-feature's preview value without falling back.

### 2. JS marshaling, if required

If a new shape requires additional state words or new input fields in the WASM call payload, extend the marshaling in `packages/engine/src/agents/policy-wasm-preview-drive.ts` correspondingly. The expectation per spec §2 is that no engine-protocol changes are needed — most extensions should be pure Rust additions.

### 3. Per-shape parity fixtures

For each (a) shape, append a fixture entry to `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts`. Each entry produces a deterministic capture (seed, profile, decision) where the WASM drive's output and the TS evaluator's output can be deepEqual'd. The fixture pattern follows the existing entries in that file.

### 4. WASM rebuild

After Rust changes, rebuild the WASM artifacts (`packages/engine-wasm` build pipeline; check `packages/engine-wasm/package.json` for the canonical command) and confirm `policy-wasm-preview-drive-equivalence.test.ts` consumes the rebuilt module.

## Files to Touch

**Likely surface — refined against ticket 001 output.** The exact path set per shape depends on the Phase 0 inventory and classification.

- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify — per-shape state-mutation handlers)
- `packages/engine/src/agents/policy-wasm-preview-drive.ts` (modify — marshaling additions, if any new state words are required)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (modify — per-shape parity fixture entries)
- `packages/engine-wasm/pkg/**` (rebuild artifacts; do not hand-edit)

## Out of Scope

- Documenting (b)-classified unsupported reasons (ticket 003).
- Removing the defensive `previewFeatureRowsExerciseAggregate` fallback (ticket 004).
- Spec 175 contract changes — the null-return → TS-fallback architecture stays unchanged.
- Engine-protocol changes — per spec §2, this phase only widens the set of supported shapes; no new return values, new unsupported sentinels, or new caller branches.
- PolicyAgent / consideration / aggregate semantics changes — TS evaluator behavior is the oracle.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` — every new (a)-classified fixture entry passes the WASM-on vs WASM-off deepEqual.
2. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` — no regression.
3. `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` — still passes (the defensive fallback at line 493 still routes around uncovered shapes until ticket 004 removes it; this ticket's role is to widen drive coverage, not yet remove the fallback).
4. `pnpm turbo test` — full engine + runner suite.

### Invariants

1. Every (a)-classified entry from ticket 001's classification table has a corresponding parity fixture in `policy-wasm-preview-drive-equivalence-fixtures.ts`.
2. The 15-seed report (`profile-fitl-arvn-15-seed-report-rendering.mjs`) records lower `wasmProductionPreviewDriveUnsupportedCount` totals for the per-reason keys newly supported by this ticket.
3. Drive output remains deterministic by construction (same encoded state + same bytecode = same result) — Foundation #8.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` — one new fixture entry per (a)-classified shape. Rationale: each fixture asserts WASM-on byte-equals WASM-off for that shape, proving the Spec 175 oracle is satisfied.

### Commands

1. `pnpm -F @ludoforge/engine build` — rebuild engine TS
2. WASM rebuild via the canonical `packages/engine-wasm` build command (check `packages/engine-wasm/package.json`)
3. `pnpm -F @ludoforge/engine test:integration` — run the equivalence suites
4. `node packages/engine/scripts/profile-fitl-arvn-15-seed-report-rendering.mjs` — confirm `wasmProductionPreviewDriveUnsupportedCount` decreased for newly-supported reasons
5. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`
