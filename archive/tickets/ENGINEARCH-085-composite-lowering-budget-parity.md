# ENGINEARCH-085: Composite Effect Lowering Budget-Parity for Runtime Semantics

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — CNL lowering shape and runtime budget-behavior parity tests
**Deps**: specs/51-cross-game-primitive-elevation.md

## Problem

Compiler-level composite effects can currently be lowered by wrapping generated sibling effects in synthetic control-flow shells (for example `let`) purely for sequencing. This can change effect-op budget consumption (`maxEffectOps`) versus equivalent manually-authored primitive sequences and creates architecture drift between authored intent and runtime accounting.

## Assumption Reassessment (2026-02-27)

1. Runtime budget accounting is per dispatched `EffectAST` node, including control wrappers such as `let`.
2. Current `distributeTokens` lowering uses a synthetic `let` wrapper that is not semantically required for gameplay logic.
3. Mismatch: current lowering shape can consume extra budget ops compared to equivalent authored primitive sequences; corrected scope is to preserve budget/trace semantics while keeping compiler-level abstraction.
4. `lowerEffectNode` currently returns a single `EffectAST`, so wrapper-free composite lowering requires introducing multi-effect expansion at array-lowering boundaries (`lowerEffectArray` + nested array lowering), not only changing one helper function.
5. Existing tests do not yet assert `maxEffectOps` parity for lowered `distributeTokens` versus equivalent primitive sequences.

## Architecture Check

1. Lowering composite CNL forms to sibling kernel effects (without synthetic runtime wrappers) is cleaner and preserves runtime invariants.
2. Game-specific data remains in GameSpecDoc; GameDef/runtime remain agnostic by receiving only generic primitive effects.
3. No backwards-compatibility aliasing/shims introduced.

## What to Change

### 1. Add compiler lowering path for multi-effect expansion without synthetic wrappers

Refactor effect-array lowering so CNL composite forms (starting with `distributeTokens`) can emit a deterministic sequence of sibling primitive effects directly, while preserving sequential binding registration and deterministic output order.

### 2. Remove synthetic wrapper from `distributeTokens` lowering

Update lowering output to avoid `let`-only scaffolding where no lexical scope semantics are required.

### 3. Add budget parity verification

Add tests proving equivalent authored primitives and lowered composite forms consume the same effect-op budget and fail/pass identically at tight limits.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/effects-runtime.test.ts` (modify/add)

## Out of Scope

- New kernel/runtime primitives for token distribution.
- Changes to existing budget policy thresholds.

## Acceptance Criteria

### Tests That Must Pass

1. `distributeTokens` no longer introduces non-semantic wrapper effect ops.
2. Budget behavior matches equivalent manually-authored primitive effect sequences.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Compiler abstractions do not alter core runtime accounting semantics.
2. Runtime/kernel remains game-agnostic and only evaluates generic primitives.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — verifies wrapper-free deterministic lowering shape.
2. `packages/engine/test/unit/effects-runtime.test.ts` — verifies `maxEffectOps` parity between lowered composite and equivalent manual sequence.

### Commands

1. `pnpm turbo build --filter=@ludoforge/engine`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine test`

## Outcome

- **Completion Date**: 2026-02-27
- **What Changed**:
  - Refactored effect-array lowering to support composite expansion (`1 input -> N lowered effects`) at both top-level and nested effect arrays.
  - Updated `distributeTokens` lowering to emit sibling `chooseN` + `forEach` effects directly (removed synthetic `let` wrapper).
  - Updated compile-lowering expectations for `distributeTokens` shape.
  - Added runtime budget-parity coverage proving lowered `distributeTokens` and equivalent manual primitive sequences pass/fail identically under tight `maxEffectOps`.
- **Deviations From Original Plan**:
  - No changes were needed in `packages/engine/test/unit/kernel/effect-mode-threading-guard.test.ts`; this file was removed from scope during assumption reassessment.
  - Unit test command in the original ticket (`test:unit -- --coverage=false`) was corrected to repo-valid command shapes.
- **Verification Results**:
  - `pnpm turbo build --filter=@ludoforge/engine` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine test` passed.
