# ENGINEARCH-052: Decouple selector-resolution normalization helpers from EffectContext

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel helper contract refactor + targeted tests
**Deps**: none

## Problem

`selector-resolution-normalization.ts` is shared, but its API is still coupled to `EffectContext` and embeds mode-specific policy. This makes the helper less reusable outside effect execution flows and blurs separation between evaluation contracts and effect plumbing.

## Assumption Reassessment (2026-02-26)

1. Shared normalization logic now lives in `selector-resolution-normalization.ts` and is consumed by multiple effect modules.
2. Helper signatures currently accept `EffectContext` directly and rely on `evalCtx.mode` behavior.
3. **Mismatch + correction**: this shared helper should depend on the narrowest evaluation contract possible and accept explicit policy for discovery passthrough vs wrapping.

## Architecture Check

1. Narrow contracts (`EvalContext` + explicit normalization policy) are cleaner and more reusable than coupling shared helpers to full effect context.
2. This refactor is purely kernel-internal and game-agnostic; no GameSpecDoc or visual-config coupling is introduced.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Narrow helper input contracts

Refactor `selector-resolution-normalization.ts` APIs to accept an eval-oriented context type and explicit policy options instead of implicitly reading `EffectContext.mode`.

### 2. Update call sites with explicit policy

Update effect/scoped-var call sites to pass the intended behavior (`wrap in execution`, `passthrough in discovery`) explicitly.

### 3. Add policy-boundary tests

Add/adjust tests proving policy behavior is intentional and deterministic (wrapping vs passthrough) independent of full effect context shape.

## Files to Touch

- `packages/engine/src/kernel/selector-resolution-normalization.ts` (modify)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify/add)

## Out of Scope

- New effect features
- Game-specific YAML/schema changes
- Runner/UI behavior

## Acceptance Criteria

### Tests That Must Pass

1. Shared normalization helper does not require `EffectContext` in its public API.
2. Discovery vs execution behavior is driven by explicit policy at callsites and covered by tests.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared resolver normalization remains reusable across kernel flows without effect-context coupling.
2. Runtime contracts remain deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — policy-boundary tests for normalized wrap vs passthrough.
2. `packages/engine/test/unit/effects-reveal.test.ts` — integration check that callsite policy produces expected behavior.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-reveal.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
