# KERQUERY-018: Enforce runtime-resource constructor contract guards

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — eval/effect context contract guard coverage
**Deps**: archive/tickets/KERQUERY/KERQUERY-012-preserve-resource-identity-across-legal-choices-discovery.md, packages/engine/src/kernel/eval-context.ts, packages/engine/src/kernel/effect-context.ts, packages/engine/test/helpers/kernel-source-guard.ts

## Problem

`EvalContext` and `EffectContext` now require explicit runtime resources, but there is no dedicated contract guard that prevents future reintroduction of implicit default resources in constructors. Type checks alone do not protect source-level architectural intent during refactors.

## Assumption Reassessment (2026-03-05)

1. `createEvalContext` now requires `resources` and no longer defaults internally.
2. Effect-context constructors also require explicit `resources`.
3. No active ticket currently locks this rule with source-contract tests against fallback/default reintroduction.

## Architecture Check

1. Source-contract guards are cleaner than relying on convention and prevent architectural regression at constructor boundaries.
2. This is infrastructure-only and keeps GameDef/simulation kernel game-agnostic.
3. No backwards-compatibility aliases/shims: fail fast if implicit defaults return.

## What to Change

### 1. Add eval/effect context constructor guard tests

1. Assert `createEvalContext` does not default `resources`.
2. Assert `createExecutionEffectContext`, `createDiscoveryStrictEffectContext`, and `createDiscoveryProbeEffectContext` do not default `resources`.

### 2. Lock canonical resources threading language

1. Add explicit test messages clarifying that runtime resources must be passed by operation owners.
2. Keep checks narrow to constructor contracts.

## Files to Touch

- `packages/engine/test/unit/kernel/eval-effect-resource-constructor-guard.test.ts` (new)
- `packages/engine/test/helpers/kernel-source-guard.ts` (modify if needed)

## Out of Scope

- Query runtime cache key/accessor refactors (`tickets/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md`)
- Trigger-dispatch API redesign (`tickets/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
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
