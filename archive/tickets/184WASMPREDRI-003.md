# 184WASMPREDRI-003: Phase 3 — Document (b)-classified unsupported reasons + extend reason-coverage

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (header comments near each unsupported call), `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` (enumeration extension), `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (per-reason parity entries)
**Deps**: `archive/tickets/184WASMPREDRI-001.md`

## Problem

Spec 184 §4 Phase 3 requires documenting each `(b)-classified` action × profile shape from the Phase 0 inventory as legitimately unsupported, then extending the Spec 174 reason-coverage enforcement so every new unsupported reason has both a documented rationale in the production drive and a parity fixture asserting the null-return → TS-fallback path yields the canonical answer.

This ticket complements ticket 002. Where 002 makes shapes supported by extending the Rust drive, 003 makes shapes formally and verifiably-unsupported: the production drive emits `recordProductionPolicyWasmPreviewDrive('unsupported', ...)` with a documented rationale, and the Spec 174 architectural-invariant test (`policy-wasm-preview-drive-equivalence-reason-coverage.test.ts`) enumerates every such reason against a parity fixture.

Ticket 002's 2026-05-19 implementation reassessment split out one additional same-seam unsupported shape: `$seat` seat-matrix `victoryCurrentMargin` refs inside FITL `seatAgg` candidate features. The current dynamic-candidate-feature ABI carries one value per candidate/ref; it cannot represent one value per candidate/ref/seat-context. This ticket owns documenting that unsupported reason and adding parity/coverage for the null-return → TS-fallback path before ticket 004 removes the defensive aggregate fallback.

## Assumption Reassessment (2026-05-19)

1. `policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` enumerates 5 unsupported reasons via deepEqual against `unsupportedPreviewDriveReasonFixtures` in `policy-wasm-preview-drive-equivalence-fixtures.ts` — confirmed during spec reassessment on 2026-05-19. Spec 174 introduced this enforcement.
2. Each `recordProductionPolicyWasmPreviewDrive('unsupported', { unsupportedDriveClass, unsupportedOwner, reason })` call in `policy-wasm-production-preview-drive.ts` is the production-drive site where the rationale header comment belongs. The call shape is verified at `policy-wasm-score-routing.ts:265` and analogous sites in `policy-wasm-production-preview-drive.ts`.
3. The `expectedEnumeration` array in `policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` is the single-source-of-truth list of unsupported reasons; adding a new reason requires a matching row here AND a matching fixture entry.
4. (b)-classified entries from ticket 001 define the new reasons to enumerate; the inventory must include the per-entry `unsupportedDriveClass`, `unsupportedOwner`, and `reason` strings the production drive emits.
5. Ticket 002 proved non-seat-matrix `surface.victoryCurrentMargin.<role-or-seat>` preview slots in the supported parity fixture, but the 15-seed decomposition still reports 264 `unsupported preview surface "victoryCurrentMargin"` rows. The remaining production shape is the `$seat` seat-matrix case from `preview.victory.currentMargin.$seat` inside FITL `seatAgg` candidate features.

## Architecture Check

1. The reason-coverage test is the architectural-invariant gate Spec 174 introduced — extending it preserves the enforcement contract that every unsupported reason has a parity fixture proving the null-return → TS-fallback path is correct (Foundation #16 Testing as Proof).
2. Header comments are documentation-only; no behavioral change. They contextualize each `recordProductionPolicyWasmPreviewDrive('unsupported', ...)` call so future readers understand why the shape is legitimately unsupported rather than a drive bug.
3. Each (b) entry's parity fixture asserts the null-return → TS-fallback path runs and yields the canonical answer (Spec 175 contract). This preserves Foundation #20 Preview Signal Integrity: an unsupported shape is explicitly tagged via `recordProductionPolicyWasmPreviewDrive('unsupported', ...)`, not silently coerced.
4. No backwards-compatibility shim (Foundation #14) — additions only.
5. Treating `$seat` as explicitly unsupported is Foundation-aligned until the ABI grows a seat-context dimension: it avoids publishing a single scalar as if it were seat-specific evidence (Foundations #8, #15, #20).

## What to Change

### 1. Production-drive rationale comments

For each (b)-classified entry from ticket 001, add a header comment near the relevant `recordProductionPolicyWasmPreviewDrive('unsupported', { ... })` call in `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` explaining why the shape is legitimately unsupported (e.g., references the kernel effect class that has no analogue in the bounded preview drive, or names the design boundary the shape sits beyond).

Also document the `$seat` seat-matrix `victoryCurrentMargin` unsupported path at the preview-state-slot unsupported site. The rationale must name the missing candidate/ref/seat-context dimension so future work does not confuse it with the non-seat-matrix `victoryCurrentMargin` path proven by ticket 002.

### 2. Reason-coverage enumeration extension

Extend the `expectedEnumeration` array in `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` with one row per new (b) reason. Each row uses the `${unsupportedDriveClass}\u0000${unsupportedOwner}\u0000${reason}` key format already established. Update the `ownerSlug` deepEqual list correspondingly.

### 3. Per-reason parity fixtures

For each new (b) reason, add a fixture entry to `unsupportedPreviewDriveReasonFixtures` in `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts`. Each fixture asserts the null-return → TS-fallback path runs on a deterministic capture and produces the canonical answer. Include the `$seat` seat-matrix `victoryCurrentMargin` shape if it is represented as a distinct unsupported reason.

## Files to Touch

**Likely surface — refined against ticket 001 output.** The exact set of per-shape call sites and fixture entries depends on the Phase 0 classification.

- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify — header comments near each new unsupported call site)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (modify — per-reason fixture entries)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` (modify — `expectedEnumeration` array + `ownerSlug` list extension)

## Out of Scope

- Non-seat-matrix drive extensions/proof for `victoryCurrentMargin` shapes (ticket 002).
- Defensive `previewFeatureRowsExerciseAggregate` fallback removal (ticket 004).
- New kinds of unsupported sentinels in the engine protocol — per spec §2, this phase preserves the existing `unsupported` shape.
- Modifying the Spec 175 null-return contract.

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` — passes with the extended enumeration matching the extended fixtures.
2. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` — no regression; new (b)-fixture entries pass the null-return → TS-fallback parity check.
3. `pnpm turbo test` — full engine + runner suite.

### Invariants

1. Every (b)-classified entry from ticket 001 has a fixture entry in `unsupportedPreviewDriveReasonFixtures` AND a matching row in `expectedEnumeration`.
2. The `$seat` seat-matrix `victoryCurrentMargin` unsupported path is either represented as a distinct reason with a matching fixture/enumeration row, or the ticket records why the existing `previewStateSlots` reason remains the correct stable key and how the parity fixture distinguishes the `$seat` case.
3. Every `recordProductionPolicyWasmPreviewDrive('unsupported', ...)` call in `policy-wasm-production-preview-drive.ts` has a rationale comment.
4. The `ownerSlug` deepEqual list in the reason-coverage test stays in sync with the fixture set.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` — one new fixture entry per (b)-classified reason. Rationale: each fixture asserts the null-return → TS-fallback path produces the canonical answer for that shape.
2. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` — one new row per (b) reason in `expectedEnumeration` and `ownerSlug`. Rationale: extends the Spec 174 architectural-invariant enforcement to cover the newly-documented reasons.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:integration` — confirm reason-coverage and equivalence tests pass
3. `pnpm turbo test`, `pnpm turbo lint`, `pnpm turbo typecheck`

## Outcome

Completed: 2026-05-19

What changed:

- Added a distinct unsupported-reason fixture for the residual `$seat` seat-matrix `victoryCurrentMargin` surface: `unsupported-effect / production-preview-drive.previewStateSlots / unsupported preview surface "victoryCurrentMargin"`.
- Added `policy-wasm-preview-drive-equivalence-victoryCurrentMarginSeatMatrix.test.ts`, proving the production WASM unsupported path falls back to byte-equivalent TypeScript scores for `seatAgg` `$seat` victory-margin refs.
- Extracted unsupported-reason parity helpers into `policy-wasm-preview-drive-unsupported-fixtures.ts` so the touched fixture files remain under the repository source-size cap.
- Extended `policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` so `expectedEnumeration` and `ownerSlug` coverage include `victoryCurrentMarginSeatMatrix`.
- Added rationale comments at the documented unsupported boundaries for card-event actions, non-shared action-batch bindings, seat-matrix preview surfaces, non-origin-seat `chooseN`, projected-state terminal boundaries, and generic unsupported effects including `popInterruptPhase`.
- Replaced an actual NUL separator in this ticket's prose with the literal `\u0000` spelling so markdown searches no longer treat the ticket as binary.

Deviations from original plan:

- The five Phase 1 `(b)` families from ticket 001 already had fixture rows and dedicated parity tests. This ticket verified and retained them rather than duplicating coverage.
- The residual `$seat` seat-matrix shape is represented by the existing stable production-drive key `production-preview-drive.previewStateSlots / unsupported preview surface "victoryCurrentMargin"` and distinguished by the new `victoryCurrentMarginSeatMatrix` fixture/test.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- From `packages/engine`: `node --test dist/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.js` — passed, 1 test.
- From `packages/engine`: `node --test dist/test/integration/policy-wasm-preview-drive-equivalence-victoryCurrentMarginSeatMatrix.test.js` — passed, 1 test.
- From `packages/engine`: `node --test dist/test/integration/policy-wasm-preview-drive-equivalence.test.js dist/test/integration/policy-wasm-preview-drive-equivalence-actionBatch.test.js dist/test/integration/policy-wasm-preview-drive-equivalence-cardEventAction.test.js dist/test/integration/policy-wasm-preview-drive-equivalence-chooseN.test.js dist/test/integration/policy-wasm-preview-drive-equivalence-popInterruptPhase.test.js dist/test/integration/policy-wasm-preview-drive-equivalence-projectedState.test.js dist/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.js dist/test/integration/policy-wasm-preview-drive-equivalence-victoryCurrentMarginSeatMatrix.test.js` — passed, 9 tests.
- `pnpm -F @ludoforge/engine test:integration` — passed, 311/311 files.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm turbo test` — passed, 5/5 tasks successful.

Source-size ledger:

- `packages/engine/src/agents/policy-preview-inner-deepening.ts` — 446 lines; below cap.
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` — 893 lines; preexisting oversize production preview-drive file, active growth was rationale comments only. No extraction warranted for this documentation/test-coverage ticket.
- `packages/engine/src/agents/policy-wasm-score-routing.ts` — 638 lines; below cap.
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` — 337 lines after extracting unsupported-reason parity helpers; below cap.
- `packages/engine/test/integration/policy-wasm-preview-drive-unsupported-fixtures.ts` — 523 lines; below cap.
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` — 30 lines; below cap.
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-victoryCurrentMarginSeatMatrix.test.ts` — 12 lines; below cap.

Post-review: run by `$implement-spec-tickets` on 2026-05-19; archived after review.
