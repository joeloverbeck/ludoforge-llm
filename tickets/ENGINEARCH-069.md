# ENGINEARCH-069: Make test EffectContext helper mode-explicit and remove implicit execution defaults

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — test architecture contract hardening for EffectContext construction
**Deps**: none

## Problem

`packages/engine/test/helpers/effect-context-test-helpers.ts` currently accepts `mode?: InterpreterMode` and defaults to `'execution'`. This reintroduces implicit mode semantics in test infrastructure immediately after hardening the runtime contract to require explicit mode. The mismatch weakens test clarity and can hide accidental mode assumptions.

## Assumption Reassessment (2026-02-26)

1. `EffectContext.mode` is required in kernel runtime contracts.
2. The shared test helper currently treats `mode` as optional and silently defaults to `'execution'`.
3. Several migrated tests delegate EffectContext construction through this helper, so its API shape is now a central contract for test correctness.
4. **Mismatch + correction**: test helper APIs must require explicit mode selection and must not provide implicit fallback semantics.

## Architecture Check

1. Explicit test-context mode constructors are cleaner than optional helper arguments because they encode intent in the callsite (`execution` vs `discovery`) and prevent accidental fallback behavior.
2. This remains game-agnostic infrastructure work and does not encode any GameSpecDoc/GameDef-specific behavior.
3. No backwards-compatibility aliasing/shims should be introduced.

## What to Change

### 1. Replace optional-mode helper API with explicit constructors

In `effect-context-test-helpers.ts`, replace `makeEffectContext({ ..., mode?: ... })` fallback semantics with explicit mode-specific constructors (for example `makeExecutionEffectContext(...)` and `makeDiscoveryEffectContext(...)`) or an equivalent required-mode API with no defaults.

### 2. Update migrated tests to use explicit helper API

Update all tests currently using the helper so mode intent is explicit at callsites.

### 3. Keep helper scope generic and kernel-oriented

The helper should stay a generic EffectContext test utility without game-specific assumptions.

## Files to Touch

- `packages/engine/test/helpers/effect-context-test-helpers.ts` (modify)
- Tests currently importing helper (modify as needed)

## Out of Scope

- Runtime/kernel production behavior changes
- GameSpecDoc/GameDef schema or compilation behavior changes

## Acceptance Criteria

### Tests That Must Pass

1. Helper API no longer allows implicit mode fallback.
2. All helper callsites compile with explicit mode intent.
3. `pnpm -F @ludoforge/engine build`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

### Invariants

1. Test infrastructure reflects runtime explicit-mode contract.
2. No implicit execution-mode defaults remain in helper APIs.

## Test Plan

### New/Modified Tests

1. Existing tests that use shared EffectContext helper (modified) — update helper usage to explicit mode APIs.
2. Add/modify helper-focused unit assertions if needed to ensure no optional mode fallback path remains.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
