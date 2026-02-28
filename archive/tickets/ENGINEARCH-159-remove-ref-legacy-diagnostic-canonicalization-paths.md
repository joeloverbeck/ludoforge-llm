# ENGINEARCH-159: Remove Legacy REF_* Canonicalization Paths from CNL Compile Diagnostics

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — cnl compile diagnostic canonicalization/remapping flow
**Deps**: archive/tickets/ENGINEARCH-157-diagnostic-taxonomy-guardrails-and-ownership-policy.md

## Problem

Compile diagnostics still depend on legacy `REF_*` codes and runtime canonicalization (`REF_* -> CNL_XREF_*`). This preserves backwards-compatibility behavior that the architecture explicitly does not want.

## Assumption Reassessment (2026-02-28)

1. `compiler-core.ts` still filters and canonicalizes legacy `REF_*` diagnostics before final output.
2. `cross-validate-diagnostic-codes.ts` currently exposes `toCnlXrefDiagnosticCode` with legacy-prefix conversion behavior.
3. `validateGameDefBoundary` and kernel `validate-gamedef-*` modules still own `REF_*` diagnostics as their canonical contract (with broad test coverage).
4. Mismatch: compile currently performs alias-style remapping (`REF_* -> CNL_XREF_*`) which hides source ownership. Corrected scope is to remove remapping while keeping duplicate suppression where canonical `CNL_XREF_*` already exists at the same normalized path.

## Architecture Check

1. Preserving source-owned taxonomy is cleaner than remapping at the compile boundary and prevents hidden ownership drift.
2. This is diagnostic-governance refactoring only; no game-specific data or visual data coupling is introduced.
3. No compatibility aliasing: compile no longer rewrites kernel `REF_*` codes into `CNL_XREF_*`.
4. Kernel remains engine-generic and independent from CNL namespace ownership.

## What to Change

### 1. Remove compile-time legacy remapping

Delete conversion behavior from compile pipeline where diagnostics are converted from `REF_*` to `CNL_XREF_*`.

### 2. Keep duplicate suppression without alias conversion

Retain deterministic duplicate suppression where an equivalent `CNL_XREF_*` diagnostic already exists at the same normalized path, but keep original diagnostic code ownership (no code rewriting).

### 3. Remove legacy conversion helper surface

Remove `toCnlXrefDiagnosticCode` conversion utility and related call sites that perform legacy-prefix translation.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (modify)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` (modify)

## Out of Scope

- Renaming/refactoring unrelated non-CNL diagnostic taxonomies outside compile path.
- GameSpecDoc data migrations.
- `visual-config.yaml` changes.

## Acceptance Criteria

### Tests That Must Pass

1. CNL compile diagnostics no longer depend on `REF_* -> CNL_XREF_*` conversion logic.
2. Compile output keeps source-owned diagnostic codes (`CNL_XREF_*` from CNL cross-validation, `REF_*` from kernel boundary validation) without alias conversion.
3. Compile output does not include duplicate `REF_*` diagnostics when equivalent `CNL_XREF_*` entries already exist for the same normalized path.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. No backwards-compatibility alias/shim remains in CNL compile diagnostic taxonomy path.
2. GameDef/runtime remains game-agnostic and independent of game-specific doc/config branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — assert compile diagnostics no longer remap kernel `REF_*` codes while still suppressing duplicate xref/reference reports.
2. `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` — remove conversion helper expectations and keep canonical registry ownership checks.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-top-level.test.js packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Reassessed and corrected ticket scope before implementation: kernel `validate-gamedef-*` modules remain canonical owners of `REF_*`; compile no longer remaps those codes into `CNL_XREF_*`.
  - Removed `toCnlXrefDiagnosticCode` from `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts`.
  - Replaced compile-time remapping in `packages/engine/src/cnl/compiler-core.ts` with duplicate suppression only: `REF_*` diagnostics are dropped only when an equivalent `CNL_XREF_*` diagnostic already exists at the same normalized path.
  - Updated unit tests to assert the new contract: no alias conversion, source-owned taxonomy preserved, duplicate suppression retained.
- **Deviations from original plan**:
  - Did not modify `packages/engine/src/kernel/validate-gamedef-*.ts`; that would have incorrectly coupled kernel taxonomy ownership to CNL namespace and conflicted with existing kernel diagnostic contracts.
  - Did not modify `packages/engine/test/unit/validate-gamedef*.test.ts`; kernel taxonomy contract was intentionally preserved.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/compile-top-level.test.js packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`331/331`).
  - `pnpm -F @ludoforge/engine lint` passed.
