# ENGINEARCH-147: Remove Redundant `alternatives` from Choice-Options Diagnostic Semantic Details

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel diagnostic semantic contract normalization + caller derivation updates
**Deps**: archive/tickets/ENGINEARCH-140-structured-choice-options-diagnostic-details-contract.md

## Problem

`ChoiceOptionsRuntimeShapeDiagnosticDetails` currently carries both `invalidShapes` and `alternatives`, where `alternatives` is a direct duplicate of `invalidShapes`. This introduces redundant semantic state and avoidable drift risk.

## Assumption Reassessment (2026-02-28)

1. `packages/engine/src/kernel/choice-options-runtime-shape-contract.ts` currently returns `runtimeShapes`, `invalidShapes`, and `alternatives` in semantic details.
2. `alternatives` is currently assigned as `[...]invalidShapes` and carries no additional semantics.
3. Mismatch: semantic contract includes duplicate fields; corrected scope is to keep one semantic source (`invalidShapes`) and derive diagnostic `alternatives` at the caller emission boundary.

## Architecture Check

1. Eliminating duplicated semantic fields produces a cleaner, more robust, and more extensible contract.
2. This preserves boundaries: shared contract remains game-agnostic semantics, while compiler/validator diagnostic emission remains caller-owned.
3. No backwards-compatibility aliasing/shims; remove the redundant field directly and update all call sites/tests.

## What to Change

### 1. Simplify semantic details contract

Remove `alternatives` from `ChoiceOptionsRuntimeShapeDiagnosticDetails` and keep semantic shape data in `runtimeShapes` + `invalidShapes` only.

### 2. Derive diagnostic alternatives at emission points

In compiler/validator emission paths, set diagnostic `alternatives` from `details.invalidShapes` rather than from semantic details payload duplication.

### 3. Update rendering/unit/parity tests

Adjust tests to assert:
- semantic payload has no redundant `alternatives` field,
- compiler/validator diagnostics still expose alternatives consistently,
- parity and determinism remain intact.

## Files to Touch

- `packages/engine/src/kernel/choice-options-runtime-shape-contract.ts` (modify)
- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic-rendering.ts` (modify only if type signatures require)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` (modify)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-rendering.test.ts` (modify if needed)
- `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify only if assertions require)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify only if assertions require)

## Out of Scope

- Runtime behavior changes for valid choice options.
- New diagnostic taxonomy/reason kinds.
- Any GameSpecDoc or visual-config schema/content changes.

## Acceptance Criteria

### Tests That Must Pass

1. Semantic details contract has no redundant `alternatives` field.
2. Compiler/validator diagnostics still emit deterministic `alternatives` derived from invalid runtime shapes.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`

### Invariants

1. Choice-options shape semantics remain single-source and game-agnostic.
2. Diagnostic emission remains caller-owned with no cross-layer aliasing.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/choice-options-runtime-shape-contract.test.ts` — remove semantic `alternatives` expectations; preserve determinism checks.
2. `packages/engine/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.ts` — ensure emitted alternatives remain parity-locked across compiler/validator.
3. `packages/engine/test/unit/compile-effects.test.ts` / `packages/engine/test/unit/validate-gamedef.test.ts` — adjust only where payload shape assertions require.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-contract.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-rendering.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/choice-options-runtime-shape-diagnostic-parity.test.js`
5. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
6. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
7. `pnpm -F @ludoforge/engine test`
8. `pnpm -F @ludoforge/engine lint`
