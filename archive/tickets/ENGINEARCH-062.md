# ENGINEARCH-062: Add architecture guard coverage for scoped-write constructor and fail-fast invariants

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel test hardening for scoped-write invariants
**Deps**: ENGINEARCH-061

## Problem

Recent scoped-write refactors tightened compile-time coupling, but runtime guard coverage is still incomplete for constructor and invariant-failure paths. Without explicit tests, future drift could reintroduce silent no-ops or non-canonical invalid-write behavior.

## Assumption Reassessment (2026-02-26)

1. Compile-time `ScopedVarWrite` coupling assertions exist in `scoped-var-runtime-access.test.ts`.
2. Runtime tests already cover zone constructor invalid-write diagnostics (`toScopedVarWrite` non-numeric zone value path).
3. Runtime tests currently do **not** guard impossible write-shape/invariant-breach behavior inside branch writer loops.
4. **Mismatch + correction**: the remaining gap is fail-fast enforcement when malformed runtime writes bypass TypeScript contracts and reach `writeScopedVarsToBranches`.

## Architecture Check

1. Guard tests for invariant/error behavior are cleaner than implicit assumptions because they pin kernel contracts to executable checks.
2. This improves long-term extensibility of game-agnostic write helpers as future effects add additional write flows.
3. This remains fully game-agnostic test hardening; no GameSpecDoc/GameDef or visual-config coupling is introduced.
4. No backwards-compatibility shims or alias paths are introduced.

## What to Change

### 1. Preserve existing constructor guard coverage (no new behavior work)

Keep existing `toScopedVarWrite` invalid zone-value runtime diagnostics test as the constructor contract baseline.

### 2. Add fail-fast invariant behavior for impossible writer paths

Harden `writeScopedVarsToBranches` so malformed runtime writes (for example invalid endpoint scope or missing `player` on non-global/non-zone writes) throw canonical runtime diagnostics instead of silently creating corrupted branch keys.

### 3. Add anti-regression tests for malformed write-shape paths

Add explicit tests that bypass static typing and prove runtime fail-fast behavior for impossible write shapes.

## Files to Touch

- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)

## Out of Scope

- Kernel runtime behavior feature changes beyond invariant enforcement
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Existing runtime test continues to fail if invalid zone constructor payload no longer throws canonical diagnostics.
2. New runtime tests fail if malformed/impossible write-shape paths no longer fail fast.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Scoped-write invariants are guarded at both type level and runtime.
2. Invalid runtime write inputs cannot silently mutate or silently no-op.
3. Kernel contracts remain game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — add runtime constructor/invariant guard assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Updated ticket assumptions to reflect existing constructor guard coverage and narrowed scope to the real runtime gap.
  - Centralized fail-fast non-zone write-endpoint invariant enforcement in a dedicated helper used by `writeScopedVarsToBranches`.
  - Hardened `writeScopedVarsToBranches` with fail-fast runtime invariant checks for malformed non-zone writes.
  - Added anti-regression tests for impossible write endpoint scope, missing `pvar` selector, and non-integer `pvar` player selector when bypassing static types.
- **Deviations from original plan**:
  - The original plan called for adding constructor invalid-input tests, but this coverage already existed, so implementation focused on missing branch-writer fail-fast invariants.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (292/292).
  - `pnpm -F @ludoforge/engine lint` passed.
