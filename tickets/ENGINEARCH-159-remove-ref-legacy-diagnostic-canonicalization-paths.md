# ENGINEARCH-159: Remove Legacy REF_* Canonicalization Paths from CNL Compile Diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/cnl diagnostic taxonomy emission and canonicalization flow
**Deps**: archive/tickets/ENGINEARCH-157-diagnostic-taxonomy-guardrails-and-ownership-policy.md

## Problem

Compile diagnostics still depend on legacy `REF_*` codes and runtime canonicalization (`REF_* -> CNL_XREF_*`). This preserves backwards-compatibility behavior that the architecture explicitly does not want.

## Assumption Reassessment (2026-02-28)

1. `compiler-core.ts` still filters and canonicalizes legacy `REF_*` diagnostics before final output.
2. `cross-validate-diagnostic-codes.ts` currently exposes `toCnlXrefDiagnosticCode` with legacy-prefix conversion behavior.
3. Mismatch: system policy is no backwards compatibility. Corrected scope is to emit canonical `CNL_XREF_*` codes at source and remove legacy normalization paths.

## Architecture Check

1. Emitting canonical taxonomy at source is cleaner than post-hoc conversion and prevents hidden drift.
2. This is diagnostic-governance refactoring only; no game-specific data or visual data coupling is introduced.
3. No compatibility aliasing: legacy `REF_*` compile output paths are removed, and callers/tests are updated to canonical codes.

## What to Change

### 1. Remove compile-time legacy canonicalization

Delete legacy conversion behavior from compile pipeline where diagnostics are converted from `REF_*` to `CNL_XREF_*`.

### 2. Emit canonical xref diagnostics from validators used by compile flow

Update validator or adapter code paths feeding CNL compile diagnostics so they directly emit canonical `CNL_XREF_*` taxonomy.

### 3. Remove legacy suppression code usage

Replace any compile-path suppression/filtering that references legacy `REF_*` codes with canonical constants only.

## Files to Touch

- `packages/engine/src/cnl/compiler-core.ts` (modify)
- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-*.ts` (modify relevant files that still emit `REF_*` diagnostics consumed by CNL compile path)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)
- `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` (modify)
- `packages/engine/test/unit/validate-gamedef*.test.ts` (modify targeted expectations if taxonomy contract shifts)

## Out of Scope

- Renaming/refactoring unrelated non-CNL diagnostic taxonomies outside compile path.
- GameSpecDoc data migrations.
- `visual-config.yaml` changes.

## Acceptance Criteria

### Tests That Must Pass

1. CNL compile diagnostics no longer depend on `REF_* -> CNL_XREF_*` conversion logic.
2. All compile-path reference diagnostics are emitted as canonical `CNL_XREF_*` at source.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. No backwards-compatibility alias/shim remains in CNL compile diagnostic taxonomy path.
2. GameDef/runtime remains game-agnostic and independent of game-specific doc/config branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — assert canonical xref outputs without legacy fallback assumptions.
2. `packages/engine/test/unit/cross-validate-diagnostic-codes.test.ts` — remove or tighten tests around legacy conversion behavior.
3. `packages/engine/test/unit/validate-gamedef*.test.ts` — keep validator expectations aligned with canonical taxonomy where compile-flow-facing.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-top-level.test.js packages/engine/dist/test/unit/cross-validate-diagnostic-codes.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
