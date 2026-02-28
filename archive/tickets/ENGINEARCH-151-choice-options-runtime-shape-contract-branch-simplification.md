# ENGINEARCH-151: Simplify Choice-Options Runtime-Shape Contract Branching in Compiler

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — compiler contract path simplification in `compile-effects`
**Deps**: archive/tickets/ENGINEARCH-147-choice-options-diagnostic-details-remove-redundant-alternatives-field.md

## Problem

`compile-effects` still carries a runtime branch over `ChoiceOptionsRuntimeShapeContract`, but the contract currently has only one legal value (`moveParamEncodable`). This creates dead branching and avoidable abstraction noise in a critical validation path.

## Assumption Reassessment (2026-02-28)

1. `ChoiceOptionsRuntimeShapeContract` is currently a single-literal type (`moveParamEncodable`) in `compile-effects.ts`.
2. `compile-effects.ts` defines both `ChoiceOptionsRuntimeShapeContract` and `CHOICE_OPTIONS_RUNTIME_SHAPE_CONTRACT`, and every caller passes the same literal (`moveParamEncodable`).
3. `validateChoiceOptionsRuntimeShapeContract(...)` retains a runtime guard `if (contract !== 'moveParamEncodable') return []`.
4. Mismatch: runtime branching and pass-through contract plumbing suggest extensibility not present in current architecture. Corrected scope is to collapse dead branch logic and remove unused contract indirection.

## Architecture Check

1. Removing dead branches is cleaner and reduces cognitive overhead and false extension points.
2. This is compiler-internal generic logic; no game-specific data or behavior enters GameDef/runtime/simulator.
3. No backwards-compatibility aliasing/shims; simplify directly to the canonical path.

## What to Change

### 1. Remove dead runtime guard and contract plumbing

Use direct unconditional choice-options runtime-shape validation in `compile-effects` for current single-contract ownership. Do not keep no-op runtime contract branches or pass-through contract arguments.

### 2. Keep diagnostics behavior unchanged

Ensure emitted diagnostics, paths, and alternatives remain byte-for-byte stable for current chooseOne/chooseN failure paths.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify/add assertions to lock simplified behavior)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` (modify only if needed)

## Out of Scope

- Introducing new choice-options runtime-shape contract kinds.
- Validator behavior changes.
- Any GameSpecDoc or visual-config schema/content changes.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler choice-options runtime-shape validation path has no dead runtime contract branch for the single supported contract.
2. Compiler/validator emitted diagnostics remain unchanged for existing failing and passing scenarios.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Compiler contract flow remains explicit, deterministic, and minimal.
2. Diagnostic behavior remains parity-safe across compiler/validator surfaces.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — retain/extend assertions that chooseOne/chooseN shape-invalid diagnostics are still emitted with canonical payload after contract-branch removal.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — keep parity lock; touch only if the simplification changes test setup needs.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm run check:ticket-deps`

## Outcome

- Implemented as planned: removed `ChoiceOptionsRuntimeShapeContract` runtime indirection in `compile-effects` by deleting the single-value contract type/constant plumbing and dead guard branch, while preserving diagnostic behavior.
- Added test strengthening in `compile-effects.test.ts` to assert choice-options runtime-shape diagnostics still emit canonical move-param-encodable messaging for `chooseOne` and `chooseN`.
- `choice-options-runtime-shape-diagnostic-parity.test.ts` required no code changes; existing parity coverage remained valid and passing.
