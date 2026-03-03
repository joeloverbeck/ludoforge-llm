# SEATRES-060: Enforce physical module boundary between scenario selection core and diagnostics

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — CNL policy module ownership and import-boundary hardening
**Deps**: archive/tickets/SEATRES/SEATRES-044-split-scenario-linked-selection-core-from-diagnostic-adapters.md, tickets/SEATRES-059-harden-scenario-selection-adapter-contract-to-eliminate-input-mismatch.md

## Problem

The API was split into pure selection and diagnostic adapters, but both still live in one module that imports diagnostic types. This keeps core policy and diagnostics coupled at a physical ownership boundary and weakens long-term enforceability of the architecture.

## Assumption Reassessment (2026-03-03)

1. `scenario-linked-asset-selection-policy.ts` currently exports both pure selectors and diagnostic emitters. Verified.
2. The same module imports `Diagnostic`, so pure-selection consumers still depend on a mixed module boundary. Verified.
3. No active ticket in `tickets/*` currently scopes extracting this into separate core and adapter modules with strict import boundaries. Scope is new.

## Architecture Check

1. A physical module split is cleaner and more extensible than a logical split inside a single file because ownership and dependencies are enforced by imports.
2. This is game-agnostic CNL architecture work; no game-specific behavior moves into `GameDef`, runtime, or simulator layers.
3. No backwards-compatibility aliasing/shims: migrate imports to canonical modules and remove the mixed module.

## What to Change

### 1. Extract pure selection core module

1. Create a pure-core module that exports scenario selection result/types and pure selectors only.
2. Ensure the core module has no dependency on diagnostic types or diagnostic callback contracts.

### 2. Extract diagnostic adapter module

1. Create a dedicated diagnostics module for compiler/validator adapter dialect types and emitters.
2. Consume core selection results in the diagnostics module and keep adapter behavior unchanged.

### 3. Migrate call sites and enforce boundary

1. Update compiler, validator, and token-trait vocabulary imports to the new module ownership.
2. Remove the old mixed module once migration is complete.
3. Add a lint-style boundary test to prevent reintroducing diagnostic imports into the pure core.

## Files to Touch

- `packages/engine/src/cnl/scenario-linked-asset-selection-core.ts` (new)
- `packages/engine/src/cnl/scenario-linked-asset-selection-diagnostics.ts` (new)
- `packages/engine/src/cnl/scenario-linked-asset-selection-policy.ts` (delete)
- `packages/engine/src/cnl/compile-data-assets.ts` (modify)
- `packages/engine/src/cnl/validate-extensions.ts` (modify)
- `packages/engine/src/cnl/token-trait-vocabulary.ts` (modify)
- `packages/engine/test/unit/data-asset-selection-policy.test.ts` (modify/move as needed)
- `packages/engine/test/unit/lint/` (modify/add boundary policy test)

## Out of Scope

- Scenario derivation failure-reason mapping changes (`SEATRES-047`)
- Cascade warning wording changes (`SEATRES-045`)
- Runtime/kernel simulation behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Pure selection core module compiles without importing diagnostics infrastructure.
2. Compiler and validator diagnostic behavior remains parity-equivalent after module split.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Selection policy core and diagnostics adapters have separate canonical module ownership.
2. Game-specific data remains in `GameSpecDoc`; `GameDef` and simulator/runtime stay game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/data-asset-selection-policy.test.ts` (or successor split tests) — assert pure-core selection behavior and adapter behavior parity post-split. Rationale: behavior-preserving refactor guard.
2. `packages/engine/test/unit/token-trait-vocabulary.test.ts` — confirm token-trait derivation consumes pure core without diagnostics coupling. Rationale: protects non-diagnostic consumer boundary.
3. `packages/engine/test/unit/lint/<scenario-selection-boundary-policy>.test.ts` — assert pure-core module does not import diagnostic types/modules. Rationale: prevents architectural drift.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/data-asset-selection-policy.test.js`
3. `node --test packages/engine/dist/test/unit/token-trait-vocabulary.test.js`
4. `node --test packages/engine/dist/test/unit/lint/<scenario-selection-boundary-policy>.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo typecheck && pnpm turbo lint`
