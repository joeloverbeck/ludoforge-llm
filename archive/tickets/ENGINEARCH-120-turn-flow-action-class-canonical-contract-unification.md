# ENGINEARCH-120: Unify Turn-Flow Action-Class Contract Source Across Types and Schemas

**Status**: ✅ COMPLETED
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

## Assumption Reassessment (2026-02-28)

1. Confirmed: duplicate action-class definitions exist beyond `types-turn-flow.ts` and `turn-flow-contract.ts`.
2. Confirmed: runtime/action-effect guards duplicate literals in `packages/engine/src/kernel/turn-flow-eligibility.ts` and `packages/engine/src/kernel/effects-turn-flow.ts`.
3. Confirmed: `packages/engine/src/kernel/legal-moves-turn-order.ts` uses an inline action-class union return type instead of canonical type import.
4. Confirmed: effect payload typing and behavior validation duplicate action-class literals in `packages/engine/src/kernel/types-ast.ts` and `packages/engine/src/kernel/validate-gamedef-behavior.ts`.
5. Confirmed: CNL consumers currently import action-class values from `turn-flow-contract.ts`; these imports must be rewired to the canonical module when the duplicate export is removed.
6. Confirmed: `types-exhaustive.test.ts` is not present under `packages/engine/test/unit/kernel/`; the prior test-plan reference is invalid.
7. Scope correction: canonical action-class contracts must be consumed by type, schema, runtime guard, and compiler/validator contract surfaces in touched modules to eliminate drift paths.

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
- `turn-flow-eligibility.ts`
- `effects-turn-flow.ts`
- `legal-moves-turn-order.ts`
- `types-ast.ts`
- `validate-gamedef-behavior.ts`
- `cnl/compile-turn-flow.ts`
- `cnl/validate-spec-shared.ts`
- other direct consumers as needed

### 3. Remove duplicate contract declarations

Eliminate duplicate action-class union/value declarations once canonical imports are in place.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-action-class-contract.ts` (new)
- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/turn-flow-contract.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/types-ast.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/cnl/compile-turn-flow.ts` (modify)
- `packages/engine/src/cnl/validate-spec-shared.ts` (modify)
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
2. `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts` (new) — assert action-class type/schema/runtime guard source alignment and detect duplicate source reintroduction.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contract-layering-guard.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-28
- **What actually changed**:
  - Added canonical module `packages/engine/src/kernel/turn-flow-action-class-contract.ts` with `TURN_FLOW_ACTION_CLASS_VALUES`, `TurnFlowActionClass`, and `isTurnFlowActionClass`.
  - Rewired kernel type/schema/runtime consumers to canonical action-class contract source (`types-turn-flow.ts`, `schemas-extensions.ts`, `turn-flow-eligibility.ts`, `effects-turn-flow.ts`, `legal-moves-turn-order.ts`, `types-ast.ts`, `validate-gamedef-behavior.ts`).
  - Rewired CNL action-class value consumers to canonical source (`cnl/compile-turn-flow.ts`, `cnl/validate-spec-shared.ts`) and removed duplicate action-class declaration from `turn-flow-contract.ts`.
  - Added new drift guard test `packages/engine/test/unit/kernel/turn-flow-action-class-contract-guard.test.ts` and extended `runtime-error-contract-layering-guard.test.ts` for canonical-source enforcement.
- **Deviations from original plan**:
  - Scope expanded beyond type+schema only to include runtime guard and validator/compiler consumers where duplicate action-class literals were also present.
  - Replaced the non-existent planned `types-exhaustive.test.ts` coverage with the new focused contract-guard test.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/runtime-error-contract-layering-guard.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/turn-flow-action-class-contract-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`316` passed, `0` failed).
  - `pnpm turbo lint` passed.
