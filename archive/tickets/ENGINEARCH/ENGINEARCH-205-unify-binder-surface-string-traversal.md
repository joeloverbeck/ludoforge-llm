# ENGINEARCH-205: Unify Binder Surface String Traversal in Shared Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared traversal utilities and CNL refactor
**Deps**: packages/engine/src/contracts/binder-surface-contract.ts, packages/engine/src/cnl/binder-surface-registry.ts, packages/engine/test/unit/contracts/binder-surface-contract.test.ts, packages/engine/test/unit/binder-surface-registry.test.ts, archive/tickets/ENGINEARCH-201-global-canonical-binding-identifiers.md

## Problem

Declared binder traversal is shared, but binder-surface string-site collect/rewrite paths still use separate recursive walkers in `cnl/binder-surface-registry`. This leaves duplicated traversal behavior and future drift risk.

## Assumption Reassessment (2026-03-04)

1. Shared contracts own declared binder path candidate traversal via `collectBinderPathCandidates`.
2. `binder-surface-registry` still owns separate local recursion for binder-surface string-site traversal:
   - `collectStringSitesAtPath`
   - `rewriteStringLeavesAtPath`
3. Contract tests currently verify candidate traversal but do not yet verify reusable string-site collect/rewrite traversal helpers, because those helpers do not exist in shared contracts yet.
4. Registry tests cover binder-surface behavior end-to-end, but parity is currently protected indirectly through registry behavior rather than a shared traversal contract test surface.

## Scope Correction

Centralize **generic binder-path traversal primitives** in shared contracts for:
- collect-at-path of string leaves
- rewrite-at-path of string leaves

Then consume those primitives from `cnl/binder-surface-registry` to remove duplicate recursive implementations while preserving existing behavior.

## Architecture Check

1. Benefit over current architecture: **Yes**. A single traversal primitive set (candidate collection + string-site collection + rewrite) is cleaner, easier to reason about, and reduces semantic drift risk for wildcard/index traversal.
2. Robustness/extensibility: central primitives make future binder-surface expansion safer because traversal semantics live in one place and are testable independently from CNL registry policy.
3. Engine agnosticism: traversal remains generic object/array/path infrastructure; no game-specific behavior is introduced.
4. Compatibility policy: no aliasing/backward-compat behavior; internal call sites should use the consolidated shared helpers directly.

## What to Change

### 1. Promote generic traversal helpers to shared contracts

Add shared helpers for binder-path string-site collection and path-based string rewrite over object/array nodes.

### 2. Refactor CNL binder-surface registry to consume shared helpers

Replace local recursive traversal helpers with shared contract utilities while preserving current behavior and diagnostics/paths.

### 3. Strengthen regression tests

Add/extend tests to lock traversal parity for wildcard paths, nested arrays, and no-op rewrites.

## Files to Touch

- `packages/engine/src/contracts/binder-surface-contract.ts` (modify)
- `packages/engine/src/contracts/index.ts` (modify if new exports required)
- `packages/engine/src/cnl/binder-surface-registry.ts` (modify)
- `packages/engine/test/unit/contracts/binder-surface-contract.test.ts` (modify)
- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- Canonical binder policy semantics changes.
- New game behavior features.
- Simulator/runtime execution changes.

## Acceptance Criteria

### Tests That Must Pass

1. CNL binder-surface registry no longer has local duplicate recursive path traversal for string-site collect/rewrite.
2. Existing registry behavior tests continue to pass without path/semantic regressions.
3. Shared contract tests cover wildcard arrays, nested arrays, and no-op rewrite behavior for new traversal helpers.
4. Existing suite: `pnpm turbo test`.

### Invariants

1. Binder path traversal semantics have a single shared implementation source (candidate/string-site/rewrite path primitives).
2. Path formatting and rewrite behavior remain deterministic.
3. No-op rewrites do not mutate nodes at targeted leaf paths.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/binder-surface-contract.test.ts` — add coverage for shared collect/rewrite traversal helpers.
2. `packages/engine/test/unit/binder-surface-registry.test.ts` — assert behavior parity after consuming shared helpers, including no-op rewrite behavior.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-03-04
- **What actually changed**:
  - Added shared binder-path string traversal helpers in contracts:
    - `collectStringSitesAtBinderPath`
    - `rewriteStringLeavesAtBinderPath`
  - Refactored `cnl/binder-surface-registry` to consume these shared helpers and removed local duplicate recursive walkers.
  - Added/extended tests for wildcard traversal, nested arrays, and no-op rewrite behavior at contract and registry levels.
  - Post-archive refinement: unified deep record/array traversal in `cnl/binder-surface-registry` behind a single record-tree walker and shared surface-target iteration path used by both collect and rewrite flows.
- **Deviations from original plan**:
  - No functional policy/semantic changes were needed; implementation remained a strict consolidation of traversal primitives.
  - During verification, `pnpm turbo test` initially failed due a stale dist lock under `/tmp/ludoforge-engine-dist-locks/...`; after clearing the stale lock directory, the same command passed.
- **Verification results**:
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/contracts/binder-surface-contract.test.ts packages/engine/test/unit/binder-surface-registry.test.ts` ✅
  - `pnpm -F @ludoforge/engine test -- packages/engine/test/unit/binder-surface-registry.test.ts packages/engine/test/unit/contracts/binder-surface-contract.test.ts` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo test` ✅
  - `pnpm run check:ticket-deps` ✅
