# ACTTOOLTIP-008: Type-safe macro-origin annotation registry for bind-bearing effects

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/cnl/expand-effect-macros.ts`, binder-surface integration, tests
**Deps**: ACTTOOLTIP-007

## Problem

Macro-origin annotation dispatch currently relies on string-key tables (`BINDING_ORIGIN_EFFECT_SPECS` + raw bind-field strings). This is concise but not strongly typed against binder-surface contracts. Adding/refactoring effect shapes can silently desynchronize annotation behavior from canonical binder definitions.

## Assumption Reassessment (2026-02-27)

1. `expand-effect-macros.ts` currently dispatches annotation through string effect keys and string bind-field names — confirmed.
2. Binder metadata is already centralized in binder surface contracts/registry (`binder-surface-contract.ts`, `binder-surface-registry.ts`) — confirmed.
3. Existing active tickets do not cover converting macro-origin annotation dispatch to a typed/contract-driven source of truth — confirmed.

## Architecture Check

1. Driving annotation from typed binder-surface contracts is cleaner and more extensible than duplicating string tables in multiple modules.
2. This is engine-internal compiler architecture, fully game-agnostic; no game-specific data paths are introduced.
3. No backwards-compatibility layers: remove ad hoc annotation-key tables in favor of contract-backed dispatch.

## What to Change

### 1. Replace ad hoc annotation tables with typed contract-backed registration

- Create a typed annotation registry derived from binder surface definitions (or explicitly typed against effect AST keys and bind path contracts).
- Ensure compile-time failure when a bind-bearing effect is added without annotation mapping.

### 2. Add coverage that enforces registry completeness

- Add a unit test that compares bind-bearing effect surfaces vs annotation registry membership.
- Ensure `removeByPriority`/`evaluateSubset` specialized semantics remain explicit where needed, but still anchored to typed contracts.

## Files to Touch

- `packages/engine/src/cnl/expand-effect-macros.ts` (modify)
- `packages/engine/src/cnl/binder-surface-contract.ts` (verify/modify if needed)
- `packages/engine/src/cnl/binder-surface-registry.ts` (verify/modify if needed)
- `packages/engine/test/unit/expand-effect-macros.test.ts` (modify)
- `packages/engine/test/unit/binder-surface-registry.test.ts` (modify)

## Out of Scope

- provenance semantics redesign for specific effects (covered separately, e.g. ACTTOOLTIP-007)
- runtime execution semantics changes
- runner/UI behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Annotation registry completeness test fails when a bind-bearing effect surface lacks annotation coverage.
2. Existing macro-origin annotation behavior remains correct for current effect inventory.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Macro-origin annotation coverage is synchronized with binder-surface contracts by construction.
2. Annotation logic remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/binder-surface-registry.test.ts` — add/assert contract-backed inventory of bind-bearing effects used by annotation.
2. `packages/engine/test/unit/expand-effect-macros.test.ts` — add a regression test that ensures annotation still applies to every supported bind-bearing effect key.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo lint`
4. `pnpm turbo test`
