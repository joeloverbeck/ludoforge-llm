# ENGINEARCH-042: Preserve source indices for zoneVars int-only contract diagnostics

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — CNL var-lowering diagnostic indexing + compile-path tests
**Deps**: none

## Problem

`lowerIntVarDefs` currently emits `CNL_COMPILER_ZONE_VAR_TYPE_INVALID` using the reindexed position of the post-lowered array instead of the original `doc.zoneVars` source index. When earlier entries fail structural lowering, later boolean entries can be reported at the wrong path (`doc.zoneVars.<wrong-index>.type`). This breaks diagnostic determinism and source-map trust.

## Assumption Reassessment (2026-02-25)

1. `lowerIntVarDefs` calls `lowerVarDefs` and iterates its returned array, which may exclude invalid source entries.
2. Diagnostic path generation for `CNL_COMPILER_ZONE_VAR_TYPE_INVALID` is based on this filtered-array index, not the original YAML index.
3. **Mismatch + correction**: compiler diagnostics must preserve source-document indices even when intermediate lowering filters entries.

## Architecture Check

1. Source-index-stable diagnostics are cleaner and more robust than diagnostics derived from transformed intermediate positions.
2. This change is compiler-internal and game-agnostic; it does not introduce game-specific behavior into `GameDef` or runtime/simulator.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Preserve source indices through zoneVars int-only lowering

Refactor zoneVars int-only lowering so diagnostics for type-contract failures (`CNL_COMPILER_ZONE_VAR_TYPE_INVALID`) reference original `doc.zoneVars.<sourceIndex>.type`, regardless of earlier invalid entries.

### 2. Keep lowering behavior and section-failure semantics unchanged

Maintain current contract semantics:
- boolean `zoneVars` still produce `CNL_COMPILER_ZONE_VAR_TYPE_INVALID`
- section availability still flips appropriately for dependency-aware gating
- no changes to runtime behavior contracts

### 3. Add regression coverage for mixed-invalid arrays

Add a compile-path test where `doc.zoneVars` includes an invalid structural entry before a boolean entry, and assert the boolean diagnostic path uses the original source index.

## Files to Touch

- `packages/engine/src/cnl/compile-lowering.ts` (modify)
- `packages/engine/src/cnl/compiler-core.ts` (modify only if plumbing required)
- `packages/engine/test/unit/compile-top-level.test.ts` (modify)

## Out of Scope

- Runtime `validateGameDef*` behavior changes
- Schema contract redesign outside compiler diagnostic path fidelity
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Mixed-invalid `doc.zoneVars` input reports `CNL_COMPILER_ZONE_VAR_TYPE_INVALID` at the correct original source index path.
2. Existing zoneVar cascade suppression behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler diagnostic paths remain source-document accurate and deterministic under partial lowering.
2. Compiler and runtime stay game-agnostic; no game-specific branches are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-top-level.test.ts` — mixed-invalid `zoneVars` case verifies correct source-index path for `CNL_COMPILER_ZONE_VAR_TYPE_INVALID`.
2. `packages/engine/test/unit/compile-top-level.test.ts` — existing cascade-suppression test remains green to guard non-cascading behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test -- test/unit/compile-top-level.test.ts`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
