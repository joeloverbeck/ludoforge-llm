# ENGINEARCH-050: Canonicalize scoped-var state write application and remove residual write-branch duplication

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes - kernel shared state-write wrapper + effect cleanup
**Deps**: none

## Problem

Scoped branch writes now use shared branch-level helpers, but effect modules still carry local state-application wrappers (`writeScopedVarToState`, `writeResolvedEndpointValue`) and redundant branch conditionals. This keeps write semantics partially distributed.

## Assumption Reassessment (2026-02-26)

1. `writeScopedVarToBranches` is canonical at branch level (`globalVars`/`perPlayerVars`/`zoneVars`).
2. Effect modules still implement duplicated state-level write glue:
   - `effects-var.ts` has `writeScopedVarToState`.
   - `effects-resource.ts` has `writeResolvedEndpointValue` and reconstructs state manually.
3. `effects-resource.ts` contains a redundant `zone` vs non-`zone` conditional where both branches call identical logic.
4. Existing tests already cover key immutable branch identity behavior for var/resource flows; this ticket should focus on write-path centralization, not broad new behavior.
5. **Scope correction**: add one shared state-level write helper and route both effect modules through it; keep current runtime behavior and identity invariants unchanged.

## Architecture Check

1. A shared state-level write helper is cleaner than ad hoc per-effect wrappers and prevents write-path drift.
2. This remains game-agnostic runtime plumbing, preserving GameSpecDoc-vs-GameDef boundaries.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add shared state-level write helper

In `scoped-var-runtime-access.ts`, add helper(s) that apply scoped writes directly onto `GameState` (or canonical state branches + merge), reusing existing branch-level logic.

### 2. Refactor effect modules to use shared state writes

- Replace local wrappers in var/resource handlers with shared runtime-access helper calls.
- Remove redundant conditional branches where both branches call identical write logic.

### 3. Keep immutable identity contracts explicit

Preserve branch identity expectations for unaffected branches and existing no-op behavior.

## Files to Touch

- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/src/kernel/effects-resource.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/effects-var.test.ts` (modify/add)
- `packages/engine/test/unit/transfer-var.test.ts` (modify/add if needed; covers `transferVar` in `effects-resource.ts`)

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
2. `packages/engine/test/unit/effects-var.test.ts` - ensure scoped writes preserve current no-op and immutable identity expectations after helper adoption.
3. `packages/engine/test/unit/transfer-var.test.ts` - ensure transfer writes preserve immutable identity expectations after helper adoption.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Added shared `writeScopedVarToState` in `scoped-var-runtime-access.ts` and explicit runtime-endpoint overloads.
  - Refactored `effects-var.ts` to remove local write glue and call shared state-write helper.
  - Refactored `effects-resource.ts` to remove `writeResolvedEndpointValue`, remove redundant branch conditional, and apply writes through shared helper.
  - Added state-level helper contract tests in `scoped-var-runtime-access.test.ts` (non-var branch preservation + chained writes).
- **Deviations from original plan**:
  - No additional `effects-var.test.ts` or `transfer-var.test.ts` changes were required because existing tests already covered branch identity/no-op behavior; coverage was strengthened where the new shared helper was introduced.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-var.test.js packages/engine/dist/test/unit/transfer-var.test.js` passed (3/3).
  - `pnpm -F @ludoforge/engine test` passed (289/289).
  - `pnpm -F @ludoforge/engine lint` passed.
