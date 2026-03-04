# KERQUERY-004: Add downstream consumer coverage for tokenZones contract reclassification

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — unit-test coverage for existing kernel consumers
**Deps**: packages/engine/src/kernel/choice-target-kinds.ts, packages/engine/src/kernel/choice-options-runtime-shape-contract.ts, packages/engine/test/unit/kernel/query-domain-kinds.test.ts, packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts

## Problem

`tokenZones` was reclassified to explicit `zone`/`string` output semantics, but downstream consumer tests do not yet assert this behavior explicitly. This leaves a regression gap where future contract drift could reappear undetected.

## Assumption Reassessment (2026-03-04)

1. `deriveChoiceTargetKinds` consumes `inferQueryDomainKinds` and should now yield `['zone']` for `tokenZones`.
2. `getChoiceOptionsRuntimeShapeViolation` consumes `inferQueryRuntimeShapes` and should treat `tokenZones` as move-param-encodable (`string` shape), i.e., no violation.
3. Existing tests cover core domain/shape inference and validation but do not directly lock these two downstream consumer behaviors for `tokenZones`.

## Architecture Check

1. This is a contract-propagation coverage ticket only; no runtime behavior changes.
2. It reinforces the game-agnostic query-contract architecture by testing shared kernel consumers, not game-specific content.
3. No compatibility aliases/shims; tests encode the current canonical contract.

## What to Change

### 1. Add explicit target-kind coverage

1. Extend query-domain/target-kind tests to assert `deriveChoiceTargetKinds({ query: 'tokenZones', ... })` resolves to `['zone']`.

### 2. Add explicit choice-options runtime-shape coverage

1. Extend choice-options runtime-shape contract tests to assert `tokenZones` produces no runtime-shape violation.
2. Keep assertions deterministic and independent of game fixtures.

## Files to Touch

- `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` (modify)

## Out of Scope

- Additional `tokenZones` validation/runtimes changes (handled by KERQUERY-002/KERQUERY-003)
- Query contract model redesign

## Acceptance Criteria

### Tests That Must Pass

1. `deriveChoiceTargetKinds(tokenZones(...))` resolves to `['zone']`.
2. `getChoiceOptionsRuntimeShapeViolation(tokenZones(...))` returns `null`.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Downstream consumer behavior must stay aligned with canonical query-kind contract mapping.
2. Tests remain game-agnostic and avoid coupling to visual/game-specific data assets.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/query-domain-kinds.test.ts` — adds explicit target-kind assertion for `tokenZones`.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` — adds explicit no-violation assertion for `tokenZones`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/query-domain-kinds.test.js packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-contract.test.js`
3. `pnpm -F @ludoforge/engine test`
