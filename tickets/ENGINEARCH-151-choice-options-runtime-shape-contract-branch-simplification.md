# ENGINEARCH-151: Simplify Choice-Options Runtime-Shape Contract Branching in Compiler

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — compiler contract path simplification in `compile-effects`
**Deps**: archive/tickets/ENGINEARCH-147-choice-options-diagnostic-details-remove-redundant-alternatives-field.md

## Problem

`compile-effects` still carries a runtime branch over `ChoiceOptionsRuntimeShapeContract`, but the contract currently has only one legal value (`moveParamEncodable`). This creates dead branching and avoidable abstraction noise in a critical validation path.

## Assumption Reassessment (2026-02-28)

1. `ChoiceOptionsRuntimeShapeContract` is currently a single-literal type (`moveParamEncodable`) in `compile-effects.ts`.
2. `validateChoiceOptionsRuntimeShapeContract(...)` retains a runtime guard `if (contract !== 'moveParamEncodable') return []`.
3. Mismatch: runtime branching suggests extensibility not present in current architecture. Corrected scope is to collapse dead branch logic or encode true extensibility explicitly.

## Architecture Check

1. Removing dead branches is cleaner and reduces cognitive overhead and false extension points.
2. This is compiler-internal generic logic; no game-specific data or behavior enters GameDef/runtime/simulator.
3. No backwards-compatibility aliasing/shims; simplify directly to the canonical path.

## What to Change

### 1. Remove dead runtime guard or convert to explicit extension map

Prefer direct unconditional validation for current single-contract ownership. If future extension is desired, represent it as explicit compile-time mapping rather than a no-op runtime guard.

### 2. Keep diagnostics behavior unchanged

Ensure emitted diagnostics, paths, and alternatives remain byte-for-byte stable for current chooseOne/chooseN failure paths.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify only if assertion paths need updates)
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

1. `packages/engine/test/unit/compile-effects.test.ts` — retain/extend assertions that chooseOne/chooseN shape-invalid diagnostics are still emitted with canonical payload.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — retain parity lock after branch simplification.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`
6. `pnpm run check:ticket-deps`
