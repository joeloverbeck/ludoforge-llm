# PIPEVAL-020: Reassess diagnostic alias-suppression path parity scope

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: No (expected) — scope correction + hard validation
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-019-consolidate-cnl-diagnostic-path-codec.md`

## Problem

This ticket assumed compile-boundary alias suppression lacked direct regression coverage and proposed adding it in `compiler-api` / `compiler-diagnostics`. Reassessment against current code/tests shows that assumption is partially stale and the proposed file targets are mis-scoped.

## Assumption Reassessment (2026-03-05)

1. `suppressAliasedCompilerReferenceDiagnostics(...)` in `packages/engine/src/cnl/compiler-core.ts` canonicalizes paths via `canonicalizeDiagnosticPath(...)` before kernel/xref comparison.
2. Direct compile-boundary suppression regression coverage already exists in `packages/engine/test/unit/compile-top-level.test.ts`:
   - `compiles varChanged trigger events and enforces variable references`
   - `preserves kernel REF diagnostics when no CNL xref counterpart exists`
   - `keeps mixed source-owned diagnostic codes while normalizing paths to compile doc-path format`
3. `packages/engine/test/unit/compiler-diagnostics.test.ts` currently validates codec/source-map ordering behavior, not compile-boundary suppression semantics.
4. Corrected scope: validate that existing tests still enforce the invariant and close ticket unless a real uncovered invariant appears during hard test execution.

## Architecture Check

1. Compile-boundary invariants should stay tested at compile-boundary (`compile-top-level.test.ts`), not split into unrelated helper/API test files.
2. Keeping this as a verification/closure ticket avoids redundant tests and preserves a cleaner test architecture.
3. No alias shim/backcompat behavior is introduced; canonical-path contract remains single-source.

## What to Change

### 1. Correct ticket scope and file targets

Update this ticket to reflect current reality: compile-boundary coverage already exists and is owned by `compile-top-level.test.ts`.

### 2. Hard-validate existing invariant coverage

Run focused and full suites to verify no regression in suppression/canonicalization behavior.

## Files to Touch

- `tickets/PIPEVAL-020-harden-diagnostic-alias-suppression-path-parity.md` (modify scope/assumptions)

## Out of Scope

- New diagnostic codes
- Source-map lookup algorithm changes
- Runtime/simulator/kernel execution semantics
- Unnecessary test duplication across unrelated test modules

## Acceptance Criteria

### Tests That Must Pass

1. Existing compile-boundary suppression tests in `compile-top-level.test.ts` continue to pass.
2. Existing codec/source-order tests in `compiler-diagnostics.test.ts` continue to pass.
3. Full suite + lint pass:
   - `pnpm turbo test --force`
   - `pnpm turbo lint`

### Invariants

1. Kernel vs xref alias suppression remains path-representation invariant for supported canonicalization paths (doc-prefix + index normalization).
2. Diagnostic behavior remains game-agnostic.

## Test Plan

### New/Modified Tests

1. None expected unless hard-validation reveals a real uncovered edge case.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-top-level.test.js packages/engine/dist/test/unit/compiler-diagnostics.test.js packages/engine/dist/test/unit/compiler-api.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-05
- What actually changed:
  - Reassessed and corrected stale assumptions in this ticket.
  - Updated scope from “add missing suppression tests in compiler-api/compiler-diagnostics” to “verify existing compile-boundary coverage and close”.
  - Kept suppression ownership anchored in `compile-top-level.test.ts`, where compile-boundary behavior is validated.
- Deviations from original plan:
  - No engine code changes.
  - No new/modified tests were required because the assumed coverage gap was already closed by existing compile-boundary tests.
  - File-touch scope changed from engine test files to this ticket file only.
- Verification results:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/compile-top-level.test.js packages/engine/dist/test/unit/compiler-diagnostics.test.js packages/engine/dist/test/unit/compiler-api.test.js` passed.
  - `pnpm turbo test --force` passed (engine + runner).
  - `pnpm turbo lint` passed.
