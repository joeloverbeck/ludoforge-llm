# ENGINEARCH-065: Make interpreter mode an explicit required kernel contract

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel context contract hardening across effect/discovery entry points
**Deps**: none

## Problem

`EffectContext.mode` is optional, and selector-policy derivation currently treats `undefined` as execution behavior. This weakens contract clarity, allows implicit defaults to leak across call boundaries, and makes mode semantics less explicit than they should be in a long-lived game-agnostic engine.

## Assumption Reassessment (2026-02-26)

1. A shared neutral `InterpreterMode` type exists in `src/kernel/interpreter-mode.ts`.
2. `EffectContext` currently exposes `mode?: InterpreterMode` (optional) rather than a required mode field.
3. `selectorResolutionFailurePolicyForMode` currently accepts `InterpreterMode | undefined` and encodes fallback behavior for `undefined`.
4. `effects-choice.ts` also encodes an implicit execution fallback via `ctx.mode ?? 'execution'`.
5. Multiple production kernel execution entry points currently construct effect contexts without `mode` (for example `initial-state.ts`, `phase-lifecycle.ts`, `trigger-dispatch.ts`, `apply-move.ts`, `event-execution.ts`).
6. Existing tests include explicit `undefined` fallback assertions in `selector-resolution-normalization.test.ts` and many EffectContext fixtures/builders that omit `mode`.
7. **Correction**: explicit mode selection must be required at all effect-context construction boundaries; all implicit fallback paths must be removed.

## Architecture Check

1. Required mode contracts are cleaner and more robust than optional+fallback semantics because they eliminate ambiguity and hidden defaults.
2. Explicit mode threading keeps simulation/runtime behavior deterministic without introducing any game-specific branches into GameDef/runtime/kernel.
3. No backwards-compatibility alias paths/shims should be added; callsites should be updated to pass explicit mode directly.
4. Consolidating mode interpretation to one explicit contract avoids drift between modules (for example selector policy and choice resolution).

## What to Change

### 1. Require mode in effect context contract

Change `EffectContext.mode` from optional to required and update all context constructors/callers to pass explicit `mode` (`execution` or `discovery`).

### 2. Remove undefined fallback semantics across kernel helpers

1. Change `selectorResolutionFailurePolicyForMode` signature to accept only `InterpreterMode` and remove `undefined` handling.
2. Remove `effects-choice.ts` fallback helper behavior (`ctx.mode ?? 'execution'`) and use explicit mode checks directly.

### 3. Align tests with explicit mode contract

Update unit/integration tests that construct effect contexts to set mode explicitly and assert mode-specific behavior without relying on absent mode.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/selector-resolution-normalization.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/` effect-context construction entry points (modify where needed), including:
  - `apply-move.ts`
  - `initial-state.ts`
  - `phase-lifecycle.ts`
  - `trigger-dispatch.ts`
  - `event-execution.ts` (if any direct `applyEffects` context literals omit mode)
  - `legal-choices.ts` (confirm remains explicit `discovery`)
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
3. `effects-choice.ts` no longer contains implicit mode fallback (`?? 'execution'`).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Interpreter mode semantics are explicit at all effect/discovery runtime boundaries.
2. Policy derivation remains centralized and deterministic.
3. Kernel runtime/contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/selector-resolution-normalization.test.ts` — remove `undefined` policy assertion and assert explicit-mode mapping only.
2. `packages/engine/test/unit/*` and `packages/engine/test/integration/*` EffectContext builders/fixtures that currently omit `mode` — add explicit `mode` defaults and preserve discovery overrides where intended.
3. Keep `packages/engine/test/unit/kernel/effect-resolver-normalization-guard.test.ts` green to ensure canonical resolver policy wiring remains intact after mode contract hardening.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/selector-resolution-normalization.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Made `EffectContext.mode` required.
  - Removed `undefined` mode fallback from `selectorResolutionFailurePolicyForMode`.
  - Removed implicit `ctx.mode ?? 'execution'` fallback logic in `effects-choice.ts`.
  - Updated kernel effect-context construction entry points to pass explicit mode (`execution` or existing `discovery`).
  - Updated affected unit/integration test fixtures to provide explicit `mode`.
  - Added shared test helper `packages/engine/test/helpers/effect-context-test-helpers.ts` and migrated high-duplication EffectContext builders to the helper to reduce contract drift in tests.
  - Updated selector normalization policy test to assert explicit modes only.
- Deviations from original plan:
  - Scope expanded to include `effects-choice.ts` fallback removal and additional production runtime entry points that were discovered to omit mode.
  - Test fixture changes were broader than initially listed because required mode propagation surfaced all latent omissions.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/selector-resolution-normalization.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (294/294).
  - `pnpm -F @ludoforge/engine lint` passed.
