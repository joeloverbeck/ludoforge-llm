# ENGINEARCH-208: Consolidate Binder Surface Path-Group Application

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — CNL binder-surface registry traversal helper refactor
**Deps**: packages/engine/src/cnl/binder-surface-registry.ts, packages/engine/src/contracts/binder-surface-contract.ts, packages/engine/test/unit/binder-surface-registry.test.ts, archive/tickets/ENGINEARCH/ENGINEARCH-205-unify-binder-surface-string-traversal.md

## Problem

Even after traversal unification, `binder-surface-registry` still repeats four near-identical loops for path-group application (`declared`, `bindingName`, `bindingTemplate`, `zoneSelector`) in both rewrite and collect flows. This duplication increases extension risk when adding future binder-surface categories.

## Assumption Reassessment (2026-03-04)

1. Shared contract helpers now centralize path-level collect/rewrite behavior.
2. Registry now centralizes deep-tree walking.
3. Mismatch: path-group application logic is still duplicated in two places with four repeated loops each.

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

Add/extend tests that ensure all four path groups are still applied and that deterministic behavior/path outputs remain unchanged.

## Files to Touch

- `packages/engine/src/cnl/binder-surface-registry.ts` (modify)
- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- New binder-surface categories.
- Contract schema changes for effect/non-effect surfaces.
- Macro expansion behavior changes beyond structural refactor parity.

## Acceptance Criteria

### Tests That Must Pass

1. Collect and rewrite still apply all four binder-surface path groups with parity to current behavior.
2. Deterministic path/value outputs remain unchanged for existing fixtures.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Path-group application logic has a single implementation source in registry.
2. Extending binder-surface categories requires one helper change instead of multi-site loop edits.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — add assertions that all path groups remain applied and deterministic after helper consolidation.

### Commands

1. `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/binder-surface-registry.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
