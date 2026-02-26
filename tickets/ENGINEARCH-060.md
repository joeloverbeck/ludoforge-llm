# ENGINEARCH-060: Remove selector-normalization type-layer dependency on effect context and add policy anti-drift guard

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel contract decoupling + architecture guard test
**Deps**: ENGINEARCH-052, ENGINEARCH-053

## Problem

`selector-resolution-normalization.ts` is runtime-decoupled from `EffectContext`, but still imports `EffectInterpreterMode` from `effect-context.ts`. This keeps an avoidable type-layer dependency from a shared eval helper into effect plumbing. Additionally, there is no static guardrail enforcing canonical policy derivation usage at call sites.

## Assumption Reassessment (2026-02-26)

1. Selector normalization helper now accepts `EvalContext` and explicit failure policy.
2. The helper still imports `EffectInterpreterMode` from `effect-context.ts` for `selectorResolutionFailurePolicyForMode` typing.
3. Current tests validate policy behavior but do not statically enforce canonical policy derivation usage across effect call sites.
4. **Mismatch + correction**: helper-layer policy typing should be locally owned (or owned by a neutral shared contract module), and architectural policy usage should be guarded in CI.

## Architecture Check

1. Removing helper dependency on effect-context types improves layering and keeps shared evaluation utilities independent from effect interpreter internals.
2. A guard test that enforces canonical policy derivation keeps policy semantics centralized and avoids callsite drift.
3. This is game-agnostic kernel architecture hardening; no GameSpecDoc/GameDef or visual-config coupling is introduced.
4. No backwards-compatibility shims or alias paths are introduced.

## What to Change

### 1. Decouple selector-normalization mode typing from effect-context

Refactor `selectorResolutionFailurePolicyForMode` typing to avoid importing `EffectInterpreterMode` from `effect-context.ts`.

### 2. Add static anti-drift guard for canonical policy derivation

Add a kernel guard test that scans relevant effect/scoped-var modules and fails if resolver helper calls omit `onResolutionFailure` or bypass canonical derivation in favor of ad-hoc policy literals.

## Files to Touch

- `packages/engine/src/kernel/selector-resolution-normalization.ts` (modify)
- `packages/engine/test/unit/kernel/effect-resolver-policy-guard.test.ts` (new)
- `packages/engine/test/helpers/ast-search-helpers.ts` (modify only if helper reuse is needed)

## Out of Scope

- Runtime behavior changes in effect handlers
- Resolver algorithm changes (`resolvePlayerSel`, `resolveZoneRef`)
- GameSpecDoc/GameDef schema changes
- Runner/UI/visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. `selector-resolution-normalization.ts` no longer imports from `effect-context.ts` for policy typing.
2. Guard test fails when resolver call sites bypass canonical `onResolutionFailure` derivation usage.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Shared selector-normalization helpers remain decoupled from effect-context plumbing.
2. Resolver failure-policy usage remains deterministic and centrally governed.
3. Kernel runtime/contracts remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-resolver-policy-guard.test.ts` — architecture anti-drift guard for canonical policy usage.
2. `packages/engine/test/unit/selector-resolution-normalization.test.ts` — update/add assertions if needed for decoupled mode typing contract.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-resolver-policy-guard.test.js packages/engine/dist/test/unit/selector-resolution-normalization.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
