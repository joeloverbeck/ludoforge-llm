# ENGINEARCH-161: Complete cross-layer contract extraction from kernel namespace

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler/kernel module boundary ownership (`src/cnl`, `src/kernel`, new/expanded `src/contracts`)
**Deps**: archive/tickets/TOKFILT-004-token-filter-contract-module-boundary.md

## Problem

`src/cnl` still imports several `*contract` modules from `src/kernel`. This leaves cross-layer contract ownership split between kernel and compiler namespaces, making architecture drift likely.

## Assumption Reassessment (2026-03-01)

1. `src/cnl` currently imports contract helpers from `src/kernel` (for example binding and turn-flow contract modules).
2. A neutral shared contract namespace now exists (`src/contracts`) but currently only hosts token-filter prop contract logic.
3. No active ticket in `tickets/*` currently tracks full migration of remaining cross-layer contract modules out of `src/kernel`.

## Architecture Check

1. Cross-layer contract modules should live in a neutral boundary so compiler and kernel can consume the same logic without namespace coupling.
2. This is purely structural/ownership refactoring and remains game-agnostic (`GameDef`/simulation behavior stays generic).
3. No backwards-compatibility aliases/re-exports from old kernel paths.

## What to Change

### 1. Identify and migrate cross-layer contract modules used by CNL

Move modules that are contract-only and used across compiler/kernel from `src/kernel` to `src/contracts` (for example binding identifier and turn-flow contract helpers).

### 2. Update import graph to the neutral contract boundary

Update compiler and kernel imports to point at `src/contracts/*`, then remove old kernel-path modules.

### 3. Keep behavior/diagnostics unchanged

This ticket is a boundary cleanup; no semantic changes to lowering/validation/runtime policy.

## Files to Touch

- `packages/engine/src/contracts/*` (new/expand)
- `packages/engine/src/cnl/*.ts` (modify imports)
- `packages/engine/src/kernel/*.ts` (modify imports and remove moved modules)
- `packages/engine/test/unit/*` (add/adjust focused contract module tests as needed)

## Out of Scope

- New compiler/runtime features
- Game-specific behavior changes
- Runner and `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. `src/cnl` no longer imports cross-layer `*contract` modules from `src/kernel`.
2. All existing diagnostics/behavior for affected contract surfaces remain unchanged.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Shared contract logic has neutral ownership (`src/contracts`), not kernel ownership.
2. `GameDef` and simulation remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-conditions.test.ts` — verify no token/filter contract regressions after broader contract relocation.
2. `packages/engine/test/unit/compile-effects.test.ts` — verify turn-flow/binding contract behavior remains stable after import migration.
3. `packages/engine/test/unit/compile-turn-flow.test.ts` — verify turn-flow contract behavior remains stable after relocation.
4. `packages/engine/test/unit/cross-validate.test.ts` — verify cross-surface contract checks remain unchanged.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
3. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
4. `node --test packages/engine/dist/test/unit/compile-turn-flow.test.js`
5. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
