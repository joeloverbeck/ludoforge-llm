# ENGINEARCH-208: Consolidate Binder Surface Path-Group Application

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL binder-surface registry traversal helper refactor
**Deps**: packages/engine/src/cnl/binder-surface-registry.ts, packages/engine/src/contracts/binder-surface-contract.ts, packages/engine/test/unit/binder-surface-registry.test.ts, archive/tickets/ENGINEARCH/ENGINEARCH-205-unify-binder-surface-string-traversal.md

## Problem

Even after traversal unification, `binder-surface-registry` still repeats four near-identical loops for path-group application (`declared`, `bindingName`, `bindingTemplate`, `zoneSelector`) in both rewrite and collect flows. This duplication increases extension risk when adding future binder-surface categories.

## Assumption Reassessment (2026-03-04)

1. Shared contract helpers now centralize path-level collect/rewrite behavior.
2. Registry now centralizes deep-tree walking.
3. Existing registry tests already lock deterministic nested path outputs and collect/rewrite parity for selected fixtures.
4. Mismatch: path-group application logic is still duplicated in two places with four repeated loops each, and tests do not yet assert explicit four-path-group coverage in one focused case.

## Architecture Check

1. A single helper to iterate binder-surface path groups keeps category expansion low-risk and reduces copy-paste drift.
2. The change is fully engine-agnostic and purely structural; no game-specific identifiers or branching are introduced.
3. No compatibility aliasing/shims are needed; internal call paths should use the consolidated helper directly.

## What to Change

### 1. Introduce a path-group iteration helper

Add an internal helper in `binder-surface-registry` that enumerates all binder-surface path groups in a deterministic order and invokes a visitor callback with `(pathGroupKind, binderPath)`.

### 2. Refactor collect/rewrite to consume the helper

Replace duplicated loops in `collectBinderSurfaceStringSites` and `rewriteBinderSurfaceStringsInNode` with helper-based dispatch.

### 3. Lock deterministic order and coverage

Add/extend tests that ensure all four path groups are still applied in both collect and rewrite flows, and that deterministic behavior/path outputs remain unchanged.

## Files to Touch

- `packages/engine/src/cnl/binder-surface-registry.ts` (modify)
- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- New binder-surface categories.
- Contract schema changes for effect/non-effect surfaces.
- Macro expansion behavior changes beyond structural refactor parity.

## Acceptance Criteria

### Tests That Must Pass

1. Collect and rewrite still apply all four binder-surface path groups with parity to current behavior, verified by an explicit focused test.
2. Deterministic path/value outputs remain unchanged for existing fixtures.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Path-group application logic has a single implementation source in registry.
2. Extending binder-surface categories requires one helper change instead of multi-site loop edits.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — add focused assertions that all four path groups remain applied in both collect and rewrite, and that deterministic outputs remain unchanged after helper consolidation.

### Commands

1. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/binder-surface-registry.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-04
- **What actually changed**:
  - Added a single internal path-group iterator in `binder-surface-registry` that applies path groups in deterministic order: `declared`, `bindingName`, `bindingTemplate`, `zoneSelector`.
  - Refactored both `rewriteBinderSurfaceStringsInNode` and `collectBinderSurfaceStringSites` to consume the helper and removed duplicated four-loop application blocks.
  - Added focused unit coverage proving all four path groups are applied in both collect and rewrite flows, with deterministic path/value outputs.
  - Post-archive refinement: replaced inline conditional rewrite dispatch with a typed path-group-to-rewriter map so path-group registration and rewrite dispatch stay single-source and extension-safe.
- **Deviations from original plan**:
  - No functional deviations; implementation remained structural and behavior-preserving.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/binder-surface-registry.test.ts` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
  - Post-archive refinement verification:
    - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/binder-surface-registry.test.ts` ✅
    - `pnpm -F @ludoforge/engine test` ✅
    - `pnpm turbo lint` ✅
