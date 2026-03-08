# FITLEVENTARCH-014: Centralize missing-binding policy context identifiers

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel policy context constants + callsite/test adoption
**Deps**: archive/tickets/FITLEVENTARCH/FITLEVENTARCH-012-unify-legal-move-admission-policy-surface-across-callsites.md

## Problem

`MissingBindingPolicyContext` values are currently passed as string literals across kernel callsites and tests.

Even with union typing, literal scattering increases drift risk and makes refactors less robust than centralized identifiers.

## Assumption Reassessment (2026-03-08)

1. `packages/engine/src/kernel/missing-binding-policy.ts` defines `MissingBindingPolicyContext` as a string union and `shouldDeferMissingBinding(...)` switches on literal values.
2. `packages/engine/src/kernel/legal-moves.ts` and `packages/engine/src/kernel/legal-moves-turn-order.ts` pass literal context strings directly.
3. Mismatch + correction: introduce one centralized context identifier map and consume it at all legal-move/policy callsites.

## Architecture Check

1. Centralized context constants are cleaner than distributed string literals and reduce accidental typo/rename drift.
2. This is a generic kernel policy-typing improvement; no game-specific behavior is introduced.
3. No backwards-compatibility aliases/shims: replace direct literals at callsites/tests with canonical constants.

## What to Change

### 1. Add canonical context identifier map

Create an exported `MISSING_BINDING_POLICY_CONTEXTS` constant object (or equivalent) as the single source of context literals.

### 2. Migrate callsites and tests

Replace context string literals in legal-move and policy tests with the canonical constant values.

## Files to Touch

- `packages/engine/src/kernel/missing-binding-policy.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/move-decision-sequence.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify)

## Out of Scope

- Changing defer semantics per context
- New legal-move admission flows
- GameSpecDoc/visual-config data changes

## Acceptance Criteria

### Tests That Must Pass

1. Kernel callsites use canonical exported context identifiers instead of ad-hoc string literals.
2. Policy tests remain exhaustive for all supported contexts.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Missing-binding context ownership is centralized to one kernel policy module surface.
2. GameDef/simulator remain game-agnostic with no game-specific branching introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — update source-shape assertions to reference canonical context constants.
2. `packages/engine/test/unit/kernel/missing-binding-policy.test.ts` — verify all canonical contexts map to intended defer semantics.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — ensure admission helper context wiring still holds via canonical constants.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/missing-binding-policy.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint && pnpm -F @ludoforge/engine typecheck`
