# ENGINEARCH-121: Centralize Turn-Flow Action-Class Runtime Guard and Enforce Schema/Runtime Parity

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — runtime validation helper deduplication + parity guard tests
**Deps**: tickets/ENGINEARCH-120-turn-flow-action-class-canonical-contract-unification.md

## Problem

Runtime action-class validation currently uses repeated hardcoded predicate logic (`isTurnFlowActionClass`) across modules. Even with canonical type/value contracts, duplicated runtime guards can drift and diverge from schema validation semantics.

## Assumption Reassessment (2026-02-27)

1. Confirmed: `isTurnFlowActionClass` literal predicates are duplicated in at least `turn-flow-eligibility.ts` and `effects-turn-flow.ts`.
2. Confirmed: these predicates validate data that is expected to match turn-flow schema enum constraints.
3. Mismatch: architecture target is one canonical runtime guard path for shared contracts; corrected scope is to export one canonical guard and reuse it everywhere.

## Architecture Check

1. One shared guard function is cleaner and more extensible than copied literal predicates.
2. This preserves game-agnostic kernel runtime behavior and does not leak game-specific branches into engine code.
3. No backwards-compatibility aliases/shims; duplicated guards are removed and replaced with canonical usage.

## What to Change

### 1. Add canonical runtime guard for action-class values

In the canonical action-class contract module, add `isTurnFlowActionClass(value: string): value is TurnFlowActionClass` derived from canonical values.

### 2. Rewire runtime consumers

Replace local literal-predicate implementations in runtime modules with the canonical guard import.

### 3. Add parity drift guard test coverage

Add/extend tests that fail when runtime guard behavior diverges from schema enum acceptance.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-action-class-contract.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/unit/kernel/` (modify/add parity guard tests)

## Out of Scope

- Changes to turn-flow game logic semantics.
- Changes to `GameSpecDoc` or visual-config schema ownership.
- Free-operation denial-cause projection mapping.

## Acceptance Criteria

### Tests That Must Pass

1. Runtime modules no longer duplicate action-class literal predicate logic.
2. Runtime guard acceptance set matches schema enum acceptance for turn-flow action classes.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime validation and schema validation are contract-parity aligned.
2. Kernel remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (or a new focused contract parity test) — assert canonical guard behavior against representative accepted/rejected action-class values.
2. `packages/engine/test/unit/kernel/runtime-error-contract-layering-guard.test.ts` — ensure runtime modules import the canonical guard contract module rather than reintroducing inline predicates.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contract-layering-guard.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
