# ENGINEARCH-120: Unify Turn-Flow Action-Class Contract Source Across Types and Schemas

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel shared contract modules, schema contract wiring, turn-flow type usage alignment
**Deps**: archive/tickets/ENGINEARCH-102-derived-illegal-move-contract-field-types.md

## Problem

Turn-flow action-class literals are currently defined in more than one kernel module (`types-turn-flow.ts` and `turn-flow-contract.ts`). This creates a drift risk between type-level contracts and schema/runtime validation surfaces.

## Assumption Reassessment (2026-02-27)

1. Confirmed: `TurnFlowActionClass` union exists in `packages/engine/src/kernel/types-turn-flow.ts`.
2. Confirmed: `TURN_FLOW_ACTION_CLASS_VALUES` and a second `TurnFlowActionClass` derivation exist in `packages/engine/src/kernel/turn-flow-contract.ts`, and schemas use this value-set via `schemas-extensions.ts`.
3. Mismatch: architecture target is single canonical contract source for shared kernel values; corrected scope is to define one canonical action-class contract source and make both type and schema layers consume it.

## Architecture Check

1. One canonical action-class contract source is cleaner and more robust than parallel definitions because it removes silent divergence paths.
2. This remains game-agnostic kernel architecture work; it does not introduce any game-specific behavior or visual-config coupling.
3. No backwards-compatibility aliasing/shims; duplicate contract definitions are removed directly.

## What to Change

### 1. Create one canonical turn-flow action-class contract module

Introduce a neutral shared module (for example `turn-flow-action-class-contract.ts`) that exports:
- `TURN_FLOW_ACTION_CLASS_VALUES`
- `TurnFlowActionClass` (derived from the canonical values)

### 2. Rewire consumers to canonical source

Update modules currently defining/deriving action-class unions independently to consume the canonical source:
- `types-turn-flow.ts`
- `turn-flow-contract.ts`
- `schemas-extensions.ts`
- other direct consumers as needed

### 3. Remove duplicate contract declarations

Eliminate duplicate action-class union/value declarations once canonical imports are in place.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-action-class-contract.ts` (new)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/turn-flow-contract.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/index.ts` (modify if canonical module should be publicly exported)
- `packages/engine/test/unit/kernel/` (modify/add drift-guard tests)

## Out of Scope

- Free-operation denial-cause mapping semantics.
- Turn-flow behavioral logic changes.
- Game-specific GameSpecDoc content changes.

## Acceptance Criteria

### Tests That Must Pass

1. Action-class literals are defined in exactly one canonical module.
2. Type contracts and schema enum contracts for turn-flow action classes are sourced from the same canonical values.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Shared kernel contracts are single-source and game-agnostic.
2. GameDef/runtime contracts remain decoupled from game-specific GameSpecDoc and visual-config data.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contract-layering-guard.test.ts` — extend guard assertions to ensure action-class contract imports remain canonical.
2. `packages/engine/test/unit/kernel/types-exhaustive.test.ts` (or a new focused contract guard test) — assert action-class type/schema source alignment and detect duplicate source reintroduction.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contract-layering-guard.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/types-exhaustive.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
