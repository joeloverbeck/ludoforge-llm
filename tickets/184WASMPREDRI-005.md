# 184WASMPREDRI-005: Add seat-matrix dynamic rows for aggregate-fed preview refs

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — production preview-drive dynamic-row ABI, JS marshaling, and parity tests
**Deps**: `archive/tickets/184WASMPREDRI-002.md`, `archive/tickets/184WASMPREDRI-003.md`

## Problem

`tickets/184WASMPREDRI-004.md` cannot safely remove the defensive `previewFeatureRowsExerciseAggregate` fallback yet. A live removal probe on 2026-05-19 rebuilt the engine and ran `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js`; the test failed at decision 47 with the original aggregate score divergence. WASM and TypeScript both selected `rally`, but WASM candidate scores were 500 lower for the non-`tax` candidates whose scores depend on `minMarginScore` / `maxMarginScore` aggregates fed by `preview.victory.currentMargin.$seat`.

Archived ticket 003 correctly documented the residual `$seat` seat-matrix `victoryCurrentMargin` shape as unsupported and covered by TS fallback parity. That is not enough for ticket 004, because removing the aggregate fallback routes aggregate-fed preview candidate features through a dynamic-row ABI that currently carries one value per candidate/ref, not one value per candidate/ref/seat-context. The missing seat-context dimension must land before the fallback can be deleted.

## Assumption Reassessment (2026-05-19)

1. `archive/tickets/184WASMPREDRI-002.md` proves non-seat-matrix `victoryCurrentMargin` slots through the supported preview-drive fixture, but explicitly delegates `$seat` seat-matrix refs.
2. `archive/tickets/184WASMPREDRI-003.md` documents `unsupported preview surface "victoryCurrentMargin"` for the residual `$seat` seat-matrix case and proves the null-return → TS-fallback path.
3. `tickets/184WASMPREDRI-004.md` attempted removal is still red: the ARVN tournament equivalence trigger fails at decision 47 when the aggregate fallback is deleted.
4. The current dynamic-row shape is insufficient for `seatAgg` expressions because it cannot represent per-candidate/per-ref/per-seat-context values. A single scalar row would silently collapse distinct seat-context evidence, violating Foundation #20.

## Architecture Check

1. The fix must remain engine-agnostic: add a generic seat-context dimension for preview dynamic rows rather than hardcoding FITL, VC, `tax`, or victory-margin behavior.
2. Foundation #8 and Foundation #20 require byte-equivalent candidate-score rows. Unsupported `$seat` refs may fall back to TypeScript, but ticket 004 cannot delete the aggregate fallback until the dynamic-row path itself can preserve the same evidence.
3. Foundation #15 favors fixing the missing ABI surface over weakening `arvn-tournament-wasm-equivalence.test.ts` or accepting aggregate score divergence.
4. Foundation #14: do not add compatibility aliases or parallel legacy row formats. Migrate the owned JS/WASM/test contracts atomically.

## What to Change

### 1. Add a seat-context dimension to preview dynamic rows

Extend the production preview-drive dynamic-row representation so refs like `preview.victory.currentMargin.$seat` inside `seatAgg` can materialize one value per candidate/ref/seat-context. The representation must preserve deterministic ordering and must not rely on object key iteration order.

### 2. Update JS marshaling and WASM score-row consumption

Update `materializePreviewDynamicRowsWithWasm`, the encoded row payloads passed into `evaluateWasmCandidateFeatureRow`, and the score-row reader so aggregate-fed preview candidate features consume the correct seat-context value instead of a collapsed scalar or `undefined`.

### 3. Prove ARVN trigger equivalence

Add or extend focused parity coverage for the decision-47 shape, then rerun the ARVN tournament equivalence trigger with the aggregate fallback still present. The proof should demonstrate the dynamic-row path can represent the `$seat` shape before ticket 004 deletes the fallback.

### 4. Preserve unsupported-reason coverage

If the `unsupported preview surface "victoryCurrentMargin"` reason no longer applies after this change, update the unsupported reason coverage and ticket/spec prose so no stale reason remains. If a narrower unsupported branch remains, keep its fixture and rationale exact.

## Files to Touch

- `packages/engine/src/agents/policy-wasm-score-routing.ts` (modify — dynamic-row materialization/marshaling)
- `packages/engine/src/agents/policy-wasm-production-preview-drive.ts` (modify if slot classification or rationale changes)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-fixtures.ts` (modify or add fixture coverage)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-victoryCurrentMarginSeatMatrix.test.ts` (modify or replace with supported-path coverage)
- `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` (modify if unsupported reason coverage changes)

## Out of Scope

- Removing `previewFeatureRowsExerciseAggregate` (ticket 004).
- Texas profile-fingerprint stability.
- New engine protocol semantics beyond the generic dynamic-row payload needed for seat-context preview refs.
- Game-specific FITL branches in engine or WASM code.

## Acceptance Criteria

### Tests That Must Pass

1. Focused supported-path test for `preview.victory.currentMargin.$seat` inside `seatAgg` aggregate-fed candidate features.
2. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js` — passes with the aggregate fallback still present.
3. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence.test.ts` — no regression.
4. `packages/engine/test/integration/policy-wasm-preview-drive-equivalence-reason-coverage.test.ts` — updated and passing if unsupported reason coverage changes.
5. `pnpm -F @ludoforge/engine test:integration` — integration sweep.

### Invariants

1. Seat-context dynamic-row ordering is deterministic and explicitly encoded.
2. No game-specific identifiers are introduced into generic engine/WASM code.
3. Aggregate-fed preview candidate features do not silently coerce unavailable `$seat` evidence into scalar fallback values.
4. Ticket 004 remains blocked until this ticket's proof shows the dynamic-row path can carry the previously-divergent evidence.

## Test Plan

### New/Modified Tests

1. A focused preview-drive equivalence fixture/test for `$seat` seat-matrix `victoryCurrentMargin` in an aggregate-fed candidate feature. Rationale: proves the missing ABI dimension directly.
2. Update unsupported-reason coverage only if this ticket removes or narrows the existing unsupported reason. Rationale: keeps Spec 174 coverage exact.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/policy-wasm-preview-drive-equivalence-victoryCurrentMarginSeatMatrix.test.js`
3. `node --test packages/engine/dist/test/integration/arvn-tournament-wasm-equivalence.test.js`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
