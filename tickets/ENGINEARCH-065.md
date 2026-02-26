# ENGINEARCH-065: Make interpreter mode an explicit required kernel contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel context contract hardening across effect/discovery entry points
**Deps**: none

## Problem

`EffectContext.mode` is optional, and selector-policy derivation currently treats `undefined` as execution behavior. This weakens contract clarity, allows implicit defaults to leak across call boundaries, and makes mode semantics less explicit than they should be in a long-lived game-agnostic engine.

## Assumption Reassessment (2026-02-26)

1. A shared neutral `InterpreterMode` type now exists in `src/kernel/interpreter-mode.ts`.
2. `EffectContext` currently exposes `mode?: InterpreterMode` (optional) rather than a required mode field.
3. `selectorResolutionFailurePolicyForMode` currently accepts `InterpreterMode | undefined` and encodes fallback behavior for `undefined`.
4. Existing tests validate current behavior (`undefined` maps to normalize) but do not enforce explicit mode-setting at all effect-context construction boundaries.
5. **Mismatch + correction**: the engine should require explicit mode selection at context construction time; implicit optional mode fallback should be removed.

## Architecture Check

1. Required mode contracts are cleaner and more robust than optional+fallback semantics because they eliminate ambiguity and hidden defaults.
2. Explicit mode threading keeps simulation/runtime behavior deterministic without introducing any game-specific branches into GameDef/runtime/kernel.
3. No backwards-compatibility alias paths/shims should be added; callsites should be updated to pass explicit mode directly.

## What to Change

### 1. Require mode in effect context contract

Change `EffectContext.mode` from optional to required and update all context constructors/callers to pass explicit `mode` (`execution` or `discovery`).

### 2. Remove undefined fallback from selector policy derivation

Change `selectorResolutionFailurePolicyForMode` signature to accept only `InterpreterMode` and remove `undefined` handling.

### 3. Align tests with explicit mode contract

Update unit/integration tests that construct effect contexts to set mode explicitly and assert mode-specific behavior without relying on absent mode.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/selector-resolution-normalization.ts` (modify)
- `packages/engine/src/kernel/` context-construction entry points (modify where needed)
- `packages/engine/test/unit/` affected tests creating effect contexts (modify)
- `packages/engine/test/integration/` affected tests creating effect contexts (modify if applicable)

## Out of Scope

- New interpreter modes or policy behaviors
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. Compilation fails if any `EffectContext` constructor omits `mode`.
2. `selectorResolutionFailurePolicyForMode` accepts only explicit `InterpreterMode` values (no `undefined` fallback path).
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Interpreter mode semantics are explicit at all effect/discovery runtime boundaries.
2. Policy derivation remains centralized and deterministic.
3. Kernel runtime/contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/selector-resolution-normalization.test.ts` — update policy mapping assertions to explicit modes only.
2. Affected `packages/engine/test/unit/*` and integration tests that construct effect contexts — enforce explicit `mode` in fixtures/builders.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/selector-resolution-normalization.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
