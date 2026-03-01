# ENGINEARCH-164: Establish contracts public surface and import policy

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — shared contracts module ergonomics + import policy
**Deps**: archive/tickets/ENGINEARCH-161-complete-cross-layer-contract-extraction-from-kernel-namespace.md, archive/tickets/ENGINEARCH-162-enforce-cnl-contract-import-boundary-via-lint.md

## Problem

`src/contracts` now exists, but there is no explicit public-surface policy (for example barrel exports and import conventions). Without one, contracts can fragment into ad hoc deep imports and inconsistent ownership.

## Assumption Reassessment (2026-03-01)

1. `src/contracts/` currently contains module files but no canonical `index.ts` public surface.
2. Contract consumers in both `src/cnl` and `src/kernel` currently deep-import contract files directly (34 import sites), so there is no single sanctioned import path.
3. Boundary guardrails already exist but do not define this public surface policy:
   - `packages/engine/test/unit/contracts/contracts-kernel-boundary.test.ts` enforces `contracts -> kernel` isolation.
   - `eslint.config.js` + `packages/engine/test/unit/lint/cnl-contract-import-boundary-lint-policy.test.ts` enforce `cnl -> kernel/*contract*` restrictions.
4. No active ticket in `tickets/*` currently tracks formalizing a canonical contracts public surface for compiler/kernel consumers.

## Architecture Check

1. A canonical public surface (`src/contracts/index.ts`) makes shared contract ownership explicit and extensible.
2. This improves maintainability without introducing game-specific behavior into agnostic layers.
3. Scope is internal engine imports (`src/cnl` + `src/kernel`); package export-map changes are out of scope for this ticket.
4. No backwards-compatibility aliasing from legacy kernel paths.

## What to Change

### 1. Define contracts public surface

Add `src/contracts/index.ts` exporting sanctioned contract modules/types.

### 2. Migrate consumers to sanctioned import style

Update compiler/kernel consumers to import from `../contracts/index.js` consistently (no deep `../contracts/<module>.js` imports outside `src/contracts`).

### 3. Document import policy

Add concise module-level policy documentation in `src/contracts/index.ts`:
- `src/cnl` and `src/kernel` import contracts from `../contracts/index.js`.
- Direct submodule imports remain internal to `src/contracts` only.

## Files to Touch

- `packages/engine/src/contracts/index.ts` (new)
- `packages/engine/src/cnl/*.ts` (modify imports where needed)
- `packages/engine/src/kernel/*.ts` (modify imports where needed)
- `packages/engine/test/unit/contracts/*` and/or `packages/engine/test/unit/lint/*` (import-policy guard coverage)

## Out of Scope

- Introducing new runtime/gameplay features
- Changing contract semantics
- Runner and `visual-config.yaml`

## Acceptance Criteria

### Tests That Must Pass

1. Contract consumers follow the sanctioned import surface/policy consistently.
2. No imports reference removed kernel-path contract modules.
3. Existing boundary guards remain intact (`contracts -> kernel`, CNL lint kernel-contract restriction).
4. Existing suite: `pnpm turbo test`

### Invariants

1. Shared contracts have one explicit ownership surface.
2. `GameDef` and simulation remain game-agnostic and free of game-specific coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` (new) — enforce that `src/cnl` and `src/kernel` use `../contracts/index.js` rather than deep contract submodule imports.
2. `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` (new) — enforce that each contract module is re-exported by `src/contracts/index.ts`.
3. `packages/engine/test/unit/contracts/contracts-kernel-boundary.test.ts` (existing) — retained invariant coverage for `contracts -> kernel` isolation.
4. `packages/engine/test/unit/lint/cnl-contract-import-boundary-lint-policy.test.ts` (existing) — retained lint-boundary coverage for `cnl -> kernel/*contract*`.

### Commands

1. `pnpm turbo build`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

Implemented with assumption and scope corrections from reassessment:

1. Added canonical contracts public surface at `packages/engine/src/contracts/index.ts` and documented import policy at module root.
2. Migrated `src/cnl` and `src/kernel` contract consumers to `../contracts/index.js` (no deep `../contracts/<module>.js` imports outside `src/contracts`).
3. Added `packages/engine/test/unit/contracts/contracts-public-surface-import-policy.test.ts` to enforce:
   - consumer imports use `../contracts/index.js`;
   - `contracts/index.ts` re-exports every contract module.
4. Updated existing guard tests to align with canonical barrel imports:
   - `packages/engine/test/unit/kernel/runtime-error-contract-layering-guard.test.ts`
   - `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts`
5. Strengthened `packages/engine/test/unit/contracts/contracts-kernel-boundary.test.ts` so it validates real source `.ts` files in both source and compiled test runs (prevents vacuous pass behavior).
6. Validation results:
   - `pnpm turbo build` passed.
   - `pnpm turbo test` passed (engine + runner).
   - `pnpm turbo typecheck` passed.
   - `pnpm turbo lint` passed.
