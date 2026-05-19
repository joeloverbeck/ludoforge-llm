# 184WASMPREDRI-002: Phase 2 — Extend WASM preview drive for (a)-classified action shapes

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — production preview-drive parity fixture/proof surface under `packages/engine/test/integration/`; source changes only if live proof still exposes a missing generic drive path
**Deps**: `archive/tickets/184WASMPREDRI-001.md`

## Problem

Spec 184 §4 Phase 2 requires making each `(a)-classified` action × profile shape from ticket 001's Phase 0 inventory a supported production preview-drive shape with a parity-oracle fixture proving WASM-on produces byte-equivalent candidate-score rows to WASM-off (the Spec 175 TS-evaluator oracle).

Live reassessment found that the generic Rust preview-drive already supports arbitrary preview-state slots via `addPreviewSlot` / `setPreviewSlot`, and the TypeScript production preview-drive compiler already evaluates non-seat-matrix `surface.victoryCurrentMargin.<role-or-seat>` slots through `evalPolicyWasmPreviewSurfaceSlot`. Therefore the current Phase 2 gap is proof/coverage for the non-seat-matrix `(a)` `victoryCurrentMargin` surface, not a mandatory new Rust state-mutation handler. This boundary reset was approved on 2026-05-19 after reassessing options against `docs/FOUNDATIONS.md`: forcing a no-op Rust edit would weaken Foundations #15/#16 proof clarity, while narrowing to the live missing proof preserves Foundations #8 and #20.

A second approved 2026-05-19 boundary split keeps `$seat` seat-matrix preview refs out of this ticket. The current dynamic-candidate-feature ABI carries one value per candidate/ref and cannot faithfully represent one value per candidate/ref/seat-context for `seatAgg` expressions such as `preview.victory.currentMargin.$seat`. Ticket 003 owns documenting and parity-covering that unsupported reason before ticket 004 removes the defensive aggregate fallback.

## Assumption Reassessment (2026-05-19)

1. `materializePreviewDynamicRowsWithWasm` (`packages/engine/src/agents/policy-wasm-score-routing.ts:246`) delegates to `evaluateProductionPreviewDriveBatchWithWasm` in `packages/engine/src/agents/policy-wasm-production-preview-drive.ts`, which calls the Rust export `ludoforge_policy_vm_evaluate_preview_drive_batch` — confirmed.
2. The Rust drive enumerates outcomes `OUTCOME_COMPLETED`, `OUTCOME_STOCHASTIC`, `OUTCOME_DEPTH_CAP`, `OUTCOME_FAILED`. The TS-side mapping (`packages/engine/src/agents/policy-wasm-preview-drive.ts:682-685`) translates these to `ready`, `stochastic`, `unresolved`/`gated`, `failed`. `previewValueFromWasmRow` returns `undefined` for outcomes ∉ {`ready`, `stochastic`} (`policy-wasm-production-preview-drive.ts:358-362`).
3. Ticket 001's report classifies the sole `(a)` family as `victoryCurrentMargin` preview-state slots: I012, I017, I019, I020, I022, I025, I026, and I032, totaling 264 unsupported contributions.
4. Live code already has the generic implementation path for non-seat-matrix surfaces: `previewGlobalSlotsForRef` requests `surface.victoryCurrentMargin.<seatToken>` slots, `classifyPolicyWasmPreviewStateSlots` recognizes `victoryCurrentMargin`, `evalPolicyWasmPreviewSurfaceSlot` computes the projected margin from the materialized preview state, and Rust round-trips arbitrary preview-state slots. The missing owned artifact is a parity fixture that exercises this surface under the production preview-drive.
5. The 15-seed decomposition run still reports 264 `unsupported preview surface "victoryCurrentMargin"` rows after the non-seat-matrix fixture because the remaining production witness includes `$seat` seat-matrix refs inside FITL `seatAgg` candidate features. That residual is delegated to ticket 003 under the approved split.
6. The parity fixture registry lives at `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts`; the equivalence test that consumes it is `policy-wasm-preview-drive-equivalence.test.ts` (architectural-invariant).

## Architecture Check

1. The supported path stays engine-agnostic — the production preview-drive models generic compiled state and generic victory surfaces, with no game-specific identifiers (Foundation #1).
2. WASM/TS equivalence is the oracle for correctness (Foundation #8 Determinism, plus the Spec 175 null-return contract). The `victoryCurrentMargin` surface must be proven by a parity fixture; absent equivalence, the contract demands null-return (which routes to TS), not silent divergence.
3. Foundation #20 (Preview Signal Integrity): for supported shapes the drive returns `ready` with the projected margin, so consideration expressions like `coalesce(preview.victory.currentMargin.self, feature.selfMargin)` resolve to the actual projected value rather than silently falling back to the state-feature (which was the Spec 184 root cause).
4. Foundation #15/#16: the ticket now targets the live missing proof surface instead of forcing a misleading Rust edit when the generic implementation already exists.
5. No backwards-compatibility shim — additions prove the existing generic path; no deprecated alternatives retained (Foundation #14).

## What to Change

### 1. `victoryCurrentMargin` parity fixture

Extend `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` so the supported preview-drive fixture includes non-seat-matrix `surface.victoryCurrentMargin.self` and a direct seat token, and asserts the WASM row's `previewStateValues` match the TypeScript preview-state oracle.

### 2. Source fix only if parity still fails

If the fixture proves the live generic path still returns unsupported or divergent output, fix the narrow generic drive layer that owns the mismatch. Do not add game-specific branches.

### 3. Acceptance proof and report check

Run the focused preview-drive equivalence test and the required regression lanes. Run the 15-seed decomposition producer, not the renderer-only module, when checking route and unsupported counts.

## Files to Touch

- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (modify — supported parity fixture includes non-seat-matrix `victoryCurrentMargin`)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` or related generic preview-drive source (modify only if the new parity fixture exposes a real mismatch)
- `packages/engine-wasm/policy-vm/src/preview_drive.rs` (modify only if live proof exposes a missing generic Rust opcode/slot path; no forced no-op edit)

## Out of Scope

- Documenting (b)-classified unsupported reasons and the `$seat` seat-matrix `victoryCurrentMargin` unsupported reason (ticket 003).
- Removing the defensive `previewFeatureRowsExerciseAggregate` fallback (ticket 004).
- Spec 175 contract changes — the null-return → TS-fallback architecture stays unchanged.
- Engine-protocol changes — per spec §2, this phase only widens the set of supported shapes; no new return values, new unsupported sentinels, or new caller branches.
- PolicyAgent / consideration / aggregate semantics changes — TS evaluator behavior is the oracle.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` — the supported fixture covers non-seat-matrix `surface.victoryCurrentMargin.self` plus a direct seat-token margin and passes the WASM-on vs WASM-off deepEqual.
2. `packages/engine/test/integration/policy-bytecode-equivalence.test.ts` — no regression.
3. `packages/engine/test/integration/arvn-tournament-wasm-equivalence.test.ts` — still passes (the defensive fallback at line 493 still routes around uncovered shapes until ticket 004 removes it; this ticket's role is to widen drive coverage, not yet remove the fallback).
4. `pnpm turbo test` — full engine + runner suite.

### Invariants

1. The non-seat-matrix portion of the `(a)` classification family from ticket 001 (`victoryCurrentMargin`, rows I012/I017/I019/I020/I022/I025/I026/I032) has a corresponding parity fixture in `policy-wasm-preview-drive-equivalence-fixtures.ts`.
2. The 15-seed decomposition producer (`profile-fitl-arvn-15-seed-decomposition.mjs`) is run and classified: remaining `unsupported preview surface "victoryCurrentMargin"` rows are delegated to ticket 003 because they require `$seat` seat-matrix dynamic rows, not because the non-seat-matrix surface path is unsupported.
3. Drive output remains deterministic by construction (same encoded state + same bytecode = same result) — Foundation #8.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` — extend the supported fixture with non-seat-matrix `victoryCurrentMargin` surfaces. Rationale: the fixture asserts WASM-on byte-equals WASM-off for this portion of the `(a)` surface, proving the Spec 175 oracle is satisfied.

### Commands

1. `pnpm -F @ludoforge/engine build` — rebuild engine TS
2. WASM rebuild via the canonical `packages/engine-wasm` build command only if Rust/WASM source or artifacts change
3. `pnpm -F @ludoforge/engine test:integration` — run the equivalence suites
4. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --output-dir /tmp/ludoforge-184 --date 2026-05-19` — confirm `wasmProductionPreviewDriveUnsupportedCount` handling for newly-supported reasons
5. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`

## Outcome (2026-05-19)

Completed under the 2026-05-19 Foundations-aligned option 1 boundary reset.

The supported preview-drive parity fixture now requests and asserts three preview-state slots:

1. `global.score`
2. `surface.victoryCurrentMargin.self`
3. `surface.victoryCurrentMargin.1`

The synthetic fixture definition now declares terminal margins for seats `0` and `1`, so the WASM preview-drive row must preserve the projected self margin and direct seat-token opponent margin in `previewStateValues`. This proves the non-seat-matrix `victoryCurrentMargin` preview surface through the same WASM-on vs WASM-off oracle used for the rest of the supported production preview-drive fixture.

No Rust/WASM source change was required. The live generic Rust path already round-trips arbitrary preview-state slots, and the TypeScript production compiler already evaluates non-seat-matrix `surface.victoryCurrentMargin.<role-or-seat>` slots. Adding a forced Rust no-op would have made the proof weaker and less aligned with `docs/FOUNDATIONS.md` #15/#16.

The 15-seed decomposition still reports 264 `unsupported preview surface "victoryCurrentMargin"` rows. Those rows are the approved out-of-scope `$seat` seat-matrix shape from FITL `seatAgg` candidate features, where the current dynamic-row ABI lacks a candidate/ref/seat-context dimension. `archive/tickets/184WASMPREDRI-003.md` now owns documenting and parity-covering that unsupported reason before ticket 004 removes the defensive aggregate fallback.

### Verification

1. `pnpm -F @ludoforge/engine build` — pass.
2. `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence.test.js` — pass, 2 tests.
3. `node --test packages/engine/dist/test/integration/policy-bytecode-equivalence.test.js` — pass, 9 tests.
4. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — pass, 1 test.
5. `node packages/engine/scripts/profile-fitl-arvn-15-seed-decomposition.mjs --output-dir /tmp/ludoforge-184 --date 2026-05-19` — pass; 15/15 seeds completed, 3,808 per-decision rows, 3,163 WASM production preview-drive route count, 2,936 unsupported count, with the residual 264 `victoryCurrentMargin` rows delegated to ticket 003.
6. `pnpm -F @ludoforge/engine test:integration` — pass, 310/310 files.
7. `pnpm turbo lint` — pass.
8. `pnpm turbo typecheck` — pass.
9. `pnpm turbo test` — pass, 5/5 tasks.
