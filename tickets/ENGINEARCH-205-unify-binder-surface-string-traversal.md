# ENGINEARCH-205: Unify Binder Surface String Traversal in Shared Contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — shared traversal utilities and CNL refactor
**Deps**: packages/engine/src/contracts/binder-surface-contract.ts, packages/engine/src/cnl/binder-surface-registry.ts, packages/engine/test/unit/contracts/binder-surface-contract.test.ts, packages/engine/test/unit/binder-surface-registry.test.ts, archive/tickets/ENGINEARCH-201-global-canonical-binding-identifiers.md

## Problem

Declared binder traversal is shared, but binder-surface string-site collect/rewrite paths still use separate recursive walkers in `cnl/binder-surface-registry`. This leaves duplicated traversal behavior and future drift risk.

## Assumption Reassessment (2026-03-03)

1. Shared contracts now own declared binder path traversal (`collectBinderPathCandidates`).
2. `binder-surface-registry` still contains local traversal for string-site collection/rewrite (`collectStringSitesAtPath`, `rewriteStringLeavesAtPath`).
3. Mismatch: traversal semantics are only partially centralized. Scope is corrected to centralize generic binder-path traversal helpers in shared contracts and consume them from CNL.

## Architecture Check

1. Single traversal primitives for read/rewrite/collection are cleaner and reduce hidden divergence across compiler macro tooling.
2. This is engine-agnostic infrastructure and does not couple any game-specific logic to GameDef/simulator.
3. No aliasing/backward-compatibility behavior is introduced; this is a direct internal consolidation.

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

1. CNL binder-surface registry no longer has duplicate recursive path traversal for string-site collect/rewrite.
2. Existing registry behavior tests continue to pass without path/semantic regressions.
3. Existing suite: `pnpm turbo test`.

### Invariants

1. Binder path traversal semantics have a single shared implementation source.
2. Path formatting and rewrite behavior remain deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/binder-surface-contract.test.ts` — add coverage for shared collect/rewrite traversal helpers.
2. `packages/engine/test/unit/binder-surface-registry.test.ts` — assert behavior parity after consuming shared helpers.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. `pnpm turbo lint`
