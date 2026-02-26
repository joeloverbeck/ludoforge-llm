# ENGINEARCH-052: Decouple selector-resolution normalization helpers from EffectContext

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel helper contract refactor + targeted tests
**Deps**: none

## Problem

`selector-resolution-normalization.ts` is shared, but its API is still coupled to `EffectContext` and embeds mode-specific policy. This makes the helper less reusable outside effect execution flows and blurs separation between evaluation contracts and effect plumbing.

## Assumption Reassessment (2026-02-26)

1. Shared normalization logic now lives in `selector-resolution-normalization.ts` and is consumed by multiple effect modules.
2. Helper signatures currently accept `EffectContext` directly and rely on `evalCtx.mode` behavior.
3. `effects-choice.ts` is also a live callsite (in addition to token/reveal/var/scoped-var flows) and must be included in scope.
4. Existing tests already cover normalization internals in `selector-resolution-normalization.test.ts`; policy-boundary assertions should extend this file rather than duplicating helper internals elsewhere.
5. **Mismatch + correction**: this shared helper should depend on the narrowest evaluation contract possible and accept explicit policy for discovery passthrough vs wrapping.

## Architecture Check

1. Narrow contracts (`EvalContext` + explicit normalization policy) are cleaner and more reusable than coupling shared helpers to full effect context.
2. This refactor is purely kernel-internal and game-agnostic; no GameSpecDoc or visual-config coupling is introduced.
3. No backwards-compatibility aliasing/shims are introduced.

## What to Change

### 1. Narrow helper input contracts

Refactor `selector-resolution-normalization.ts` APIs to accept an eval-oriented context type and explicit policy options instead of implicitly reading `EffectContext.mode`.

### 2. Update call sites with explicit policy

Update all helper call sites (effect + scoped-var) to pass the intended behavior (`wrap in execution`, `passthrough in discovery`) explicitly, including marker operations in `effects-choice.ts`.

### 3. Add policy-boundary tests

Add/adjust tests proving policy behavior is intentional and deterministic (wrapping vs passthrough) independent of full effect context shape.

## Files to Touch

- `packages/engine/src/kernel/selector-resolution-normalization.ts` (modify)
- `packages/engine/src/kernel/scoped-var-runtime-access.ts` (modify)
- `packages/engine/src/kernel/effects-token.ts` (modify)
- `packages/engine/src/kernel/effects-reveal.ts` (modify)
- `packages/engine/src/kernel/effects-choice.ts` (modify)
- `packages/engine/src/kernel/effects-var.ts` (modify)
- `packages/engine/test/unit/selector-resolution-normalization.test.ts` (modify/add)
- `packages/engine/test/unit/scoped-var-runtime-access.test.ts` (modify/add)
- `packages/engine/test/unit/effects-reveal.test.ts` (modify/add)
- `packages/engine/test/unit/effects-choice.test.ts` (modify/add as needed)

## Out of Scope

- New effect features
- Game-specific YAML/schema changes
- Runner/UI behavior

## Acceptance Criteria

### Tests That Must Pass

1. Shared normalization helper does not require `EffectContext` in its public API.
2. Discovery vs execution behavior is driven by explicit policy at callsites and covered by tests.
3. All known call sites compile against the new explicit-policy API (including `effects-choice.ts`).
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared resolver normalization remains reusable across kernel flows without effect-context coupling.
2. Runtime contracts remain deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/scoped-var-runtime-access.test.ts` — policy-boundary tests for normalized wrap vs passthrough.
2. `packages/engine/test/unit/effects-reveal.test.ts` — integration check that callsite policy produces expected behavior.
3. `packages/engine/test/unit/selector-resolution-normalization.test.ts` — helper-level policy tests independent of effect context shape.
4. `packages/engine/test/unit/effects-choice.test.ts` — marker-space resolution callsites pass explicit policy and preserve expected diagnostics.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/selector-resolution-normalization.test.js packages/engine/dist/test/unit/scoped-var-runtime-access.test.js packages/engine/dist/test/unit/effects-reveal.test.js packages/engine/dist/test/unit/effects-choice.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Refactored `selector-resolution-normalization.ts` to depend on `EvalContext` and explicit `onResolutionFailure` policy (`normalize` | `passthrough`) instead of reading `EffectContext.mode`.
  - Centralized mode-to-policy mapping into `selectorResolutionFailurePolicyForMode(...)` to remove duplicated callsite logic and keep policy semantics defined in one place.
  - Updated all known call sites (`scoped-var-runtime-access`, `effects-token`, `effects-reveal`, `effects-choice`, `effects-var`) to pass policy explicitly.
  - Strengthened policy-boundary tests across helper/unit integration paths.
- **Deviation from original plan**:
  - Scope was expanded to include `effects-choice.ts` and its unit tests after reassessing current call sites.
  - Added helper-level policy assertions in `selector-resolution-normalization.test.ts` to directly lock in explicit-policy behavior.
- **Verification**:
  - `pnpm -F @ludoforge/engine build` passed.
  - Targeted `node --test ...selector-resolution-normalization...scoped-var-runtime-access...effects-reveal...effects-choice...` passed.
  - `pnpm -F @ludoforge/engine test` passed (289/289).
  - `pnpm -F @ludoforge/engine lint` passed.
