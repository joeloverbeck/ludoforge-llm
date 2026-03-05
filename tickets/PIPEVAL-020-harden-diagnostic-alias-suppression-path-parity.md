# PIPEVAL-020: Harden diagnostic alias-suppression path parity at compile boundary

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL compile diagnostic dedupe/suppression boundary tests
**Deps**: `archive/tickets/PIPEVAL/PIPEVAL-019-consolidate-cnl-diagnostic-path-codec.md`

## Problem

`compileGameSpecToGameDef` suppresses aliased kernel reference diagnostics when equivalent CNL xref diagnostics exist, but this relies on path canonicalization parity across mixed path forms (`doc.actions[0]` vs `actions.0`). Current tests do not directly lock this compile-boundary invariant, so future path-contract edits can silently regress dedupe/suppression behavior.

## Assumption Reassessment (2026-03-05)

1. `suppressAliasedCompilerReferenceDiagnostics(...)` in `packages/engine/src/cnl/compiler-core.ts` now canonicalizes via shared codec logic before comparing kernel/xref diagnostic paths.
2. Current test updates cover codec helpers and source-map lookup, but do not include a direct compile-boundary regression test for alias suppression across mixed path encodings.
3. Scope correction: this ticket targets invariant coverage and deterministic suppression behavior only; no semantic change to diagnostic taxonomy or severity ordering.

## Architecture Check

1. Locking suppression invariants at compile boundary is cleaner than relying only on helper-level tests because it guards full-pipeline behavior.
2. This change is diagnostics infrastructure only and does not add game-specific logic to GameDef/runtime/simulator/kernel.
3. No backwards-compatibility alias/shim behavior is introduced; we enforce one canonical path contract.

## What to Change

### 1. Add direct compile-boundary suppression regression tests

Add tests that intentionally produce aliased kernel + xref reference diagnostics with mixed path forms and assert only one canonical xref diagnostic remains after suppression.

### 2. Add deterministic parity coverage for keyed and indexed path shapes

Include cases for numeric index normalization and keyed bracket-quoted segments to ensure suppression parity remains stable as path features expand.

## Files to Touch

- `packages/engine/test/unit/compiler-api.test.ts` (modify)
- `packages/engine/test/unit/compiler-diagnostics.test.ts` (modify)

## Out of Scope

- New diagnostic codes
- Changes to source-map lookup traversal
- Runtime/simulator/kernel execution semantics

## Acceptance Criteria

### Tests That Must Pass

1. Compile-boundary suppression drops aliased kernel reference diagnostics when equivalent xref diagnostics exist, even when path representations differ.
2. Suppression behavior remains deterministic for index-based and keyed bracket-encoded paths.
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. Kernel vs xref reference alias suppression is path-representation invariant after canonicalization.
2. Diagnostic behavior remains game-agnostic and independent from game-specific GameSpecDoc content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compiler-api.test.ts` — add compile-level regression cases for mixed-form aliased path suppression.
2. `packages/engine/test/unit/compiler-diagnostics.test.ts` — add explicit suppression parity assertions for indexed and keyed path forms.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compiler-api.test.js packages/engine/dist/test/unit/compiler-diagnostics.test.js`
3. `pnpm turbo test --force`
4. `pnpm turbo lint`
