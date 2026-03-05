# KERQUERY-018: Enforce runtime-resource constructor contract guards

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — eval/effect context contract guard coverage
**Deps**: archive/tickets/KERQUERY/KERQUERY-012-preserve-resource-identity-across-legal-choices-discovery.md, packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/effect-context.ts, packages/engine/test/helpers/kernel-source-guard.ts

## Problem

`EvalContext` and `EffectContext` now require explicit runtime resources, but there is no dedicated contract guard that prevents future reintroduction of implicit default resources in constructors. Type checks alone do not protect source-level architectural intent during refactors.

## Assumption Reassessment (2026-03-05)

1. `createEvalContext` now requires `resources` and no longer defaults internally.
2. Effect-context constructors also require explicit `resources`.
3. Existing tests already cover adjacent behavior:
   - `legal-choices.test.ts` guards canonical discovery threading (`resources: evalCtx.resources`) and forbids `??` fallback reconstruction.
   - `effect-context-construction-contract.test.ts` covers runtime construction behavior and explicit discovery constructor surfaces.
4. The remaining uncovered risk is constructor-level fallback/default reintroduction inside `eval-context.ts` and `effect-context.ts` (for example optional `resources`, parameter defaults, or `??` fallback wrapping).

## Architecture Check

1. A constructor-focused source-contract guard complements existing behavior tests without duplicating `legal-choices` coverage.
2. This is infrastructure-only and keeps GameDef/simulation kernel game-agnostic.
3. No backwards-compatibility aliases/shims: fail fast if implicit defaults return.

## What to Change

### 1. Add eval/effect context constructor guard tests

1. Assert `createEvalContext` does not use parameter/default fallback semantics for `resources`.
2. Assert `createExecutionEffectContext`, `createDiscoveryStrictEffectContext`, and `createDiscoveryProbeEffectContext` do not use parameter/default fallback semantics for `resources`.

### 2. Lock canonical resources threading language

1. Add explicit test messages clarifying that runtime resources must be passed by operation owners.
2. Keep checks narrow to constructor contracts and avoid re-testing discovery wiring already covered in `legal-choices.test.ts`.

## Files to Touch

- `packages/engine/test/unit/kernel/eval-effect-resource-constructor-guard.test.ts` (new)
- `packages/engine/test/helpers/kernel-source-guard.ts` (modify only if required for guard-path access; otherwise unchanged)

## Out of Scope

- Query runtime cache key/accessor refactors (`archive/tickets/KERQUERY/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md`)
- Trigger-dispatch API redesign (`archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
- Game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Guard fails if any eval/effect context constructor reintroduces implicit resources defaults.
2. Existing behavior tests remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime resource ownership remains explicit at context-construction boundaries.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/eval-effect-resource-constructor-guard.test.ts` — protect constructor contracts from fallback/default regressions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/eval-effect-resource-constructor-guard.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion date**: 2026-03-05
- **What actually changed**:
  - Added `packages/engine/test/unit/kernel/eval-effect-resource-constructor-guard.test.ts` to enforce constructor-level source contracts for runtime resource threading.
  - Guard asserts `createEvalContext`, `createExecutionEffectContext`, `createDiscoveryStrictEffectContext`, and `createDiscoveryProbeEffectContext` do not introduce implicit `resources` defaults (`=`) or nullish fallback reconstruction (`??`).
  - Guard also asserts canonical derivation of `queryRuntimeCache` and `collector` from `resources` in all guarded constructors.
  - Updated ticket assumptions/scope to account for existing adjacent coverage in `legal-choices.test.ts` and `effect-context-construction-contract.test.ts`.
- **Deviations from original plan**:
  - `packages/engine/test/helpers/kernel-source-guard.ts` did not require modification.
  - Scope was narrowed to the remaining architectural gap (constructor contracts) to avoid redundant overlap with existing legal-choices/effect-mode guards.
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/eval-effect-resource-constructor-guard.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (381/381).
  - `pnpm -F @ludoforge/engine lint` passed.
