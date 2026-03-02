# SEATRES-025: Typed asset-selection failure reasons and cascade-gating hardening

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No — reassessment/verification only (target architecture already implemented)
**Deps**: archive/tickets/SEATRES/SEATRES-024-extract-shared-data-asset-selection-policy-for-compiler-and-validator.md

## Problem

This ticket's original assumptions are stale. The typed failure-reason model and reason-aware cascade gating are already implemented in compiler code, so this ticket must be corrected to reflect reality and closed without redundant refactors.

## Assumption Reassessment (2026-03-02)

1. `deriveSectionsFromDataAssets()` does **not** expose boolean-only failures. It already returns typed `derivationFailures` arrays with reason values (`invalid-payload`, `missing-reference`, `ambiguous-selection`).
2. Compiler-core does **not** gate cascades using booleans. It already applies reason-aware suppression policy (`DATA_ASSET_DERIVATION_SUPPRESSION_POLICY`) for map/piece/seat cascades.
3. Scenario-linked selection failure reasons are already wired through shared selection policy + compiler call sites, and unit/integration tests already cover ambiguity/missing-reference/invalid-payload suppression behavior in key flows.

## Scope Update (2026-03-02)

1. No new architectural mechanism is required for this ticket; the intended design is already present and aligned with clean, generic engine architecture.
2. This ticket now focuses on:
   - correcting assumptions/scope text,
   - verifying current behavior with hard test runs,
   - adding tests only if a real uncovered invariant is found during reassessment.

## Architecture Check

1. Typed failure reasons are more robust than booleans and support principled root-cause-first diagnostics.
2. The current implementation is game-agnostic compiler infrastructure and correctly keeps game semantics out of kernel/compiler contracts.
3. The current implementation already avoids compatibility aliasing and keeps strict explicit contracts.
4. Additional rewrites here would risk churn without architectural gain; preserving the existing typed-policy abstraction is the cleaner choice.

## What to Change

### 1. Correct ticket assumptions and acceptance scope

1. Replace outdated boolean-based assumptions with the already-landed typed failure-reason model.
2. Align acceptance language with existing reason-aware gating behavior.

### 2. Verify implementation quality instead of duplicating implementation work

1. Re-run hard test suite for compiler/data-asset paths.
2. Add/strengthen tests only if reassessment reveals an actual coverage gap.

## Files to Touch

- `tickets/SEATRES-025-typed-asset-selection-failure-reasons-and-cascade-gating-hardening.md` (modify)
- `packages/engine/test/unit/compiler-structured-results.test.ts` (modify only if reassessment reveals a gap)
- `packages/engine/test/integration/compile-pipeline.test.ts` (modify only if reassessment reveals a gap)

## Out of Scope

- Validator selection parity implementation (covered by prior tickets)
- Runtime/kernel execution behavior
- Runner/visual presentation concerns

## Acceptance Criteria

### Tests That Must Pass

1. Existing compiler behavior remains reason-aware and root-cause-first without regressions.
2. Existing explicit `doc.zones` / `doc.tokenTypes` + ambiguous-asset behavior remains deterministic under current tests.
3. Hard verification suite passes:
   - `pnpm turbo build`
   - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
   - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
   - `pnpm -F @ludoforge/engine test`
   - `pnpm turbo test --force`
   - `pnpm turbo typecheck`
   - `pnpm turbo lint`

### Invariants

1. Diagnostic ordering remains root-cause-first and reason-aware.
2. `GameSpecDoc` remains data source; `GameDef`/runtime remain agnostic and do not encode selection fallbacks.

## Test Plan

### New/Modified Tests

1. No mandatory new tests if reassessment confirms full coverage for reason-specific ambiguous/missing-reference/invalid-payload gating paths.
2. Add focused regression tests only for newly discovered invariant gaps.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js`
3. `node --test packages/engine/dist/test/integration/compile-pipeline.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test --force`
6. `pnpm turbo typecheck`
7. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-02
- **What changed**:
  - Corrected stale ticket assumptions: compiler already uses typed derivation failure reasons (`invalid-payload`, `missing-reference`, `ambiguous-selection`).
  - Corrected scope: no new compiler-core refactor required; behavior already uses reason-aware suppression policy.
  - Performed hard verification run across build/tests/typecheck/lint.
- **Deviations from original plan**:
  - No engine code changes were made because the intended architecture was already present and covered by tests.
  - No new tests were added because reassessment did not expose uncovered invariants or edge-case gaps.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compiler-structured-results.test.js` passed.
  - `node --test packages/engine/dist/test/integration/compile-pipeline.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`# tests 347`, `# pass 347`, `# fail 0`).
  - `pnpm turbo test --force` passed (engine + runner suites green).
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed.
