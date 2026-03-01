# ENGINEARCH-164: Establish contracts public surface and import policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared contracts module ergonomics + import policy
**Deps**: tickets/ENGINEARCH-161-complete-cross-layer-contract-extraction-from-kernel-namespace.md, tickets/ENGINEARCH-162-enforce-cnl-contract-import-boundary-via-lint.md

## Problem

`src/contracts` now exists, but there is no explicit public-surface policy (for example barrel exports and import conventions). Without one, contracts can fragment into ad hoc deep imports and inconsistent ownership.

## Assumption Reassessment (2026-03-01)

1. `src/contracts/` currently contains module files but no canonical `index.ts` public surface.
2. Contract consumers currently import contract files directly by path.
3. No active ticket in `tickets/*` currently tracks formalizing contracts import policy and surface ownership.

## Architecture Check

1. A canonical public surface (`src/contracts/index.ts`) makes shared contract ownership explicit and extensible.
2. This improves maintainability without introducing game-specific behavior into agnostic layers.
3. No backwards-compatibility aliasing from legacy kernel paths.

## What to Change

### 1. Define contracts public surface

Add `src/contracts/index.ts` exporting sanctioned contract modules/types.

### 2. Migrate consumers to sanctioned import style

Update compiler/kernel consumers to import from the public surface (or documented subpath policy if chosen) consistently.

### 3. Document import policy

Add concise docs (or code comments in module root) specifying when to use `contracts/index` vs direct submodule imports.

## Files to Touch

- `packages/engine/src/contracts/index.ts` (new)
- `packages/engine/src/cnl/*.ts` (modify imports where needed)
- `packages/engine/src/kernel/*.ts` (modify imports where needed)
- `docs/*` or module-level comments documenting contract import policy (modify/add)

## Out of Scope

- Introducing new runtime/gameplay features
- Changing contract semantics
- Runner and `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Contract consumers follow the sanctioned import surface/policy consistently.
2. No imports reference removed kernel-path contract modules.
3. Existing suite: `pnpm turbo test`

### Invariants

1. Shared contracts have one explicit ownership surface.
2. `GameDef` and simulation remain game-agnostic and free of game-specific coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/*boundary-policy*.test.ts` — extend boundary checks to include sanctioned contracts import policy.
2. `packages/engine/test/unit/compile-conditions.test.ts` — regression safety for contract import-surface migration.
3. `packages/engine/test/unit/validate-gamedef.test.ts` — regression safety for contract import-surface migration.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
