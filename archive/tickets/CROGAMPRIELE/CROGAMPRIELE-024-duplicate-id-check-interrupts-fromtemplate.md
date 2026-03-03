# CROGAMPRIELE-024: Duplicate-ID check misses fromTemplate in interrupts

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — cnl validator
**Deps**: `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-005-parameterized-phase-templates.md`, `archive/tickets/CROGAMPRIELE/CROGAMPRIELE-010-texas-holdem-spec-migration.md`

## Problem

`validateDuplicateIdentifiers()` in `validate-spec-core.ts` resolves `fromTemplate` entries in `turnStructure.phases` to detect duplicate phase IDs, but does NOT process `turnStructure.interrupts`. If an interrupt uses `fromTemplate` and produces the same phase ID as a regular phase (or another interrupt), the duplicate escapes detection.

By contrast, `validateTurnStructure()` in `validate-actions.ts` correctly handles BOTH `phases` and `interrupts` for `fromTemplate` entries (lines 302-327 and 341-367), collecting all resolved IDs into a single `collectedPhaseIds` array.

Example spec that should emit a diagnostic but currently does not:
```yaml
turnStructure:
  phases:
    - fromTemplate: betting
      args: { roundId: preflop }
  interrupts:
    - fromTemplate: betting
      args: { roundId: preflop }  # produces same "preflop" ID — no diagnostic
```

## Assumption Reassessment (2026-03-03)

1. `validateDuplicateIdentifiers()` at `validate-spec-core.ts:224-256` only processes `doc.turnStructure.phases`. **Verified — line 239 reads `phases` only.**
2. `validateTurnStructure()` at `validate-actions.ts:302-367` processes both `phases` and `interrupts`. **Verified.**
3. Interrupt `fromTemplate` entries follow the same `{ fromTemplate, args }` shape as phase entries. **Verified — same `GameSpecPhaseFromTemplate` type.**
4. `pushDuplicateNormalizedIdDiagnostics` at `validate-spec-shared.ts:159` emits `CNL_VALIDATOR_IDENTIFIER_DUPLICATE_NORMALIZED` diagnostics (NOT `CNL_VALIDATOR_DUPLICATE_ID` as originally stated). **Verified and corrected.**
5. CROGAMPRIELE-023 has landed — `resolvePhaseIdFromTemplate` is available as a shared helper. **Verified.**

## Architecture Check

1. The fix is straightforward: extend the `phaseIds` collection to also iterate over `doc.turnStructure.interrupts` with the same `fromTemplate` resolution logic, then pass the combined list to `pushDuplicateNormalizedIdDiagnostics`.
2. No game-specific logic — this is pure compiler infrastructure.
3. No backwards-compatibility shims. This is a correctness fix adding a missing code path.

## What to Change

### 1. Extend `validateDuplicateIdentifiers` to include interrupts

After collecting phase IDs from `doc.turnStructure.phases`, also collect from `doc.turnStructure.interrupts` using the same `fromTemplate` resolution logic. Pass the combined array to `pushDuplicateNormalizedIdDiagnostics`.

CROGAMPRIELE-023 has landed — use the shared `resolvePhaseIdFromTemplate` helper (already imported in `validate-spec-core.ts`).

## Files to Touch

- `packages/engine/src/cnl/validate-spec-core.ts` (modify — extend `validateDuplicateIdentifiers`)

## Out of Scope

- Refactoring the resolution logic to a shared helper (done — CROGAMPRIELE-023 already landed)
- Adding new diagnostic codes — reuses existing `CNL_VALIDATOR_IDENTIFIER_DUPLICATE_NORMALIZED`
- Changes to `validateTurnStructure` (already correct)

## Acceptance Criteria

### Tests That Must Pass

1. A spec with a `fromTemplate` interrupt producing the same phase ID as a `fromTemplate` phase emits `CNL_VALIDATOR_IDENTIFIER_DUPLICATE_NORMALIZED`.
2. A spec with a `fromTemplate` interrupt producing the same phase ID as a direct phase emits `CNL_VALIDATOR_IDENTIFIER_DUPLICATE_NORMALIZED`.
3. A spec with unique `fromTemplate` interrupt IDs produces no duplicate diagnostic.
4. Existing suite: `pnpm turbo test`

### Invariants

1. All phase IDs (from both phases and interrupts) are checked for duplicates.
2. No game-specific logic introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-spec.test.ts` — Add test: `fromTemplate` interrupt duplicating a phase ID emits diagnostic.
2. `packages/engine/test/unit/validate-spec.test.ts` — Add test: unique `fromTemplate` interrupt IDs produce no diagnostic.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck && pnpm turbo lint`

## Outcome

**Changed vs originally planned:**

The implementation matched the plan exactly. The only corrections were to the ticket itself:
- Diagnostic code was `CNL_VALIDATOR_IDENTIFIER_DUPLICATE_NORMALIZED` (not `CNL_VALIDATOR_DUPLICATE_ID`)
- Test file path was `packages/engine/test/unit/validate-spec.test.ts` (not `packages/engine/test/unit/cnl/validate-spec-core.test.ts`)
- CROGAMPRIELE-023 had already landed, so the shared `resolvePhaseIdFromTemplate` helper was used directly

**Files modified:**
- `packages/engine/src/cnl/validate-spec-core.ts` — Extended `validateDuplicateIdentifiers` to collect IDs from both `turnStructure.phases` and `turnStructure.interrupts`, with a local `resolvePhaseEntryId` helper to DRY the resolution logic
- `packages/engine/test/unit/validate-spec.test.ts` — Added 3 tests covering interrupt-phase duplicate detection

**Verification:** 3438 tests pass, typecheck clean, lint clean.
