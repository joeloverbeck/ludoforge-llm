# ENGINEARCH-050: Canonicalize scoped-var state write application and remove residual write-branch duplication

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes - kernel shared state-write wrapper + effect cleanup
**Deps**: none

## Problem

Scoped branch writes now use shared branch-level helpers, but effect modules still carry local state-application wrappers (`writeScopedVarToState`, `writeResolvedEndpointValue`) and redundant branch conditionals. This keeps write semantics partially distributed.

## Assumption Reassessment (2026-02-26)

1. `writeScopedVarToBranches` is canonical at branch level (`globalVars`/`perPlayerVars`/`zoneVars`).
2. Effect modules still implement state-level write glue and residual redundant branch checks.
3. Existing tests pass, but write application architecture is not fully centralized.
4. **Mismatch + correction**: state-level scoped write application should be shared to eliminate final duplication and simplify future maintenance.

## Architecture Check

1. A shared state-level write helper is cleaner than ad hoc per-effect wrappers and prevents write-path drift.
2. This remains game-agnostic runtime plumbing, preserving GameSpecDoc-vs-GameDef boundaries.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add shared state-level write helper

In `scoped-var-runtime-access.ts`, add helper(s) that apply scoped writes directly onto `GameState` (or canonical state branches + merge), reusing existing branch-level logic.

### 2. Refactor effect modules to use shared state writes

- Replace local wrappers in var/resource handlers.
- Remove redundant conditional branches where both branches call identical write logic.

### 3. Keep immutable identity contracts explicit

Preserve branch identity expectations for unaffected branches and existing no-op behavior.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/effects-var.test.ts` (modify/add)
- `packages/engine/test/unit/transfer-var.test.ts` (modify/add)

## Out of Scope

- Runtime selector normalization scope expansion
- Compiler/validator contract work
- Runner/UI/visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Scoped state writes in var/resource handlers use shared state-write primitives.
2. Unaffected-branch identity invariants remain intact.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. One canonical implementation path exists for scoped state write application.
2. Runtime state updates remain immutable and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` - direct state-write helper contract coverage.
2. `packages/engine/test/unit/effects-var.test.ts` - guard unaffected branch identity after scoped writes.
3. `packages/engine/test/unit/transfer-var.test.ts` - guard unaffected branch identity after scoped transfers.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
