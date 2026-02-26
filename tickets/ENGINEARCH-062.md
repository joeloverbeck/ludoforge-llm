# ENGINEARCH-062: Add architecture guard coverage for scoped-write constructor and fail-fast invariants

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel test hardening for scoped-write invariants
**Deps**: ENGINEARCH-061

## Problem

Recent scoped-write refactors tightened compile-time coupling, but runtime guard coverage is still incomplete for constructor and invariant-failure paths. Without explicit tests, future drift could reintroduce silent no-ops or non-canonical invalid-write behavior.

## Assumption Reassessment (2026-02-26)

1. Compile-time `ScopedVarWrite` coupling assertions exist in `scoped-var-runtime-access.test.ts`.
2. Runtime tests currently focus on valid read/write behavior and do not explicitly guard impossible-shape/invariant-breach behavior.
3. Runtime tests currently do not explicitly assert constructor invalid-write diagnostics for zone scope.
4. **Mismatch + correction**: architecture-critical runtime guard paths require explicit test coverage alongside compile-time assertions.

## Architecture Check

1. Guard tests for invariant/error behavior are cleaner than implicit assumptions because they pin kernel contracts to executable checks.
2. This improves long-term extensibility of game-agnostic write helpers as future effects add additional write flows.
3. This remains fully game-agnostic test hardening; no GameSpecDoc/GameDef or visual-config coupling is introduced.
4. No backwards-compatibility shims or alias paths are introduced.

## What to Change

### 1. Add runtime guard tests for constructor invalid input

Add assertions that invalid zone-scoped constructor payloads fail with the canonical diagnostic contract.

### 2. Add fail-fast invariant tests for impossible writer paths

Add assertions that impossible runtime write shapes hard-fail and never silently return unchanged state.

### 3. Add anti-regression compile/runtime parity checks

Ensure both compile-time and runtime guard cases are covered in the same test module to reduce drift.

## Files to Touch

- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify)
- `packages/engine/test/helpers/` helpers (modify only if shared invariant assertion helper extraction is warranted)

## Out of Scope

- Kernel runtime behavior feature changes beyond invariant enforcement
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Runtime test fails if invalid zone constructor payload no longer throws canonical diagnostics.
2. Runtime test fails if impossible write-shape paths no longer fail fast.
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
