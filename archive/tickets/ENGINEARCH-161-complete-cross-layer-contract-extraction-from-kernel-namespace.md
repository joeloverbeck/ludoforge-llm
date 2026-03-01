# ENGINEARCH-161: Complete cross-layer contract extraction from kernel namespace

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler/kernel module boundary ownership (`src/cnl`, `src/kernel`, new/expanded `src/contracts`)
**Deps**: archive/tickets/TOKFILT-004-token-filter-contract-module-boundary.md

## Problem

`src/cnl` still imports several `*contract` modules from `src/kernel`. This leaves cross-layer contract ownership split between kernel and compiler namespaces, making architecture drift likely.

## Assumption Reassessment (2026-03-01)

1. `src/cnl` currently imports these kernel-owned contract modules directly:
   - `binding-identifier-contract.ts`
   - `turn-flow-action-class-contract.ts`
   - `turn-flow-contract.ts`
   - `turn-flow-interrupt-selector-contract.ts`
   - `action-selector-contract-registry.ts`
2. `src/contracts` exists but currently contains only `token-filter-prop-contract.ts`; the above cross-layer contracts are still kernel-owned.
3. Existing guard tests currently hardcode kernel paths for several of these modules (for example `action-selector-contract-boundary-policy.test.ts`, `turn-flow-action-class-contract-guard.test.ts`, and `runtime-error-contract-layering-guard.test.ts`), so the migration must include test-boundary updates.
4. No active ticket in `tickets/*` currently tracks this full migration.

## Architecture Check

1. Cross-layer contract modules should live in a neutral boundary so compiler and kernel can consume the same logic without namespace coupling.
2. This is purely structural/ownership refactoring and remains game-agnostic (`GameDef`/simulation behavior stays generic).
3. No backwards-compatibility aliases/re-exports from old kernel paths.

## What to Change

### 1. Identify and migrate cross-layer contract modules used by CNL

Move these cross-layer contract modules from `src/kernel` to `src/contracts`:

- `binding-identifier-contract.ts`
- `turn-flow-action-class-contract.ts`
- `turn-flow-contract.ts`
- `turn-flow-interrupt-selector-contract.ts`
- `action-selector-contract-registry.ts`

### 2. Update import graph to the neutral contract boundary

Update compiler and kernel imports to point at `src/contracts/*`, then remove old kernel-path modules (no aliasing/re-export shims from `src/kernel`).

### 3. Keep behavior/diagnostics unchanged

This ticket is a boundary cleanup; no semantic changes to lowering/validation/runtime policy.

## Files to Touch

- `packages/engine/src/contracts/*` (new/expand)
- `packages/engine/src/cnl/*.ts` (modify imports)
- `packages/engine/src/kernel/*.ts` (modify imports and remove moved modules)
- `packages/engine/test/unit/*` + `packages/engine/test/helpers/*` (update boundary/path guards tied to kernel namespace assumptions)

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
3. `packages/engine/test/unit/cross-validate.test.ts` — verify cross-surface contract checks remain unchanged.
4. `packages/engine/test/unit/kernel/action-selector-contract-boundary-policy.test.ts` — update contract source-path guard to neutral contract ownership.
5. `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts` — update canonical contract-location/import assertions.
6. `packages/engine/test/unit/kernel/runtime-error-contract-layering-guard.test.ts` — update layering assertions to neutral contract path imports.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-conditions.test.js`
3. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
4. `node --test packages/engine/dist/test/unit/cross-validate.test.js`
5. `node --test packages/engine/dist/test/unit/kernel/action-selector-contract-boundary-policy.test.js`
6. `node --test packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js`
7. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contract-layering-guard.test.js`
8. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

Implemented as planned with scope corrections from reassessment:

1. Migrated cross-layer contract modules from `src/kernel` to `src/contracts`:
   - `binding-identifier-contract.ts`
   - `turn-flow-action-class-contract.ts`
   - `turn-flow-contract.ts`
   - `turn-flow-interrupt-selector-contract.ts`
   - `action-selector-contract-registry.ts`
2. Rewired all compiler (`src/cnl`) and kernel consumers to import from `src/contracts/*` with no kernel-path alias/re-export compatibility shim.
3. Updated contract-boundary guard tests that were previously tied to kernel-local file ownership and import paths.
4. Adjusted test-plan scope based on real suite layout (`compile-turn-flow.test.ts` does not exist in this repository).
5. Validation results:
   - Focused build + contract regression tests passed.
   - `pnpm turbo test` passed (engine + runner).
   - `pnpm turbo typecheck` passed.
   - `pnpm turbo lint` passed.
6. Follow-up hardening completed:
   - Removed remaining `src/contracts -> src/kernel` imports by extracting shared selector vocabulary and action-capability constants into neutral `src/contracts` modules.
   - Generalized selector-contract input typing to structural selector input shape, removing direct dependency on kernel `PlayerSel` type export.
   - Added a boundary regression test to ensure `src/contracts` modules remain kernel-import free.
