# 81WHOSEQEFFCOM-013: Introduce explicit normalized effect result contracts

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — effect-context/result types, effect-dispatch normalization, compiled-effect typing, targeted runtime/compiler tests
**Deps**: specs/81-whole-sequence-effect-compilation.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-012-decision-scope-contract-alignment.md

## Problem

The runtime now exposes `decisionScope` consistently at the public boundary, but the type surface still models effect execution as if normalization were optional everywhere.

- `EffectResult` still marks `decisionScope`, `bindings`, and `emittedEvents` optional even at normalized/public boundaries.
- Runtime wrappers, `applyEffectsWithBudgetState`, and compiled composition all rely on control-flow normalization and `??` fallback logic rather than a type that states the invariant directly.
- That keeps the architecture weaker than the code: the implementation knows more than the types do.

Per Foundations 9, 10, and 11, normalized execution boundaries should have one explicit contract. Optionality should exist only where partial handler/fragment results are genuinely allowed.

## Assumption Reassessment (2026-03-25)

1. `applyEffect`, `applyEffects`, `applyEffectsWithBudgetState`, and `composeFragments` now all return a public result that includes normalized `decisionScope` in practice.
2. Current effect handlers and compiled fragments still benefit from partial result authoring: many handlers omit `bindings`, `emittedEvents`, or `decisionScope` and rely on outer normalization.
3. The current single `EffectResult` type conflates those two layers: partial internal handler outputs and normalized public execution outputs.
4. `CompiledEffectFn` in `effect-compiler-types.ts` also returns `EffectResult`, so compiled lifecycle execution inherits the same imprecise contract.
5. The clean follow-up is not to make every handler manually emit fully normalized fields. The clean follow-up is to separate partial internal result authoring from normalized boundary results with distinct types.

## Architecture Check

1. The clean architecture is a two-tier contract:
   - partial internal result type for effect handlers/fragments
   - normalized boundary result type for public/runtime/compiled sequence outputs
2. This is more robust than leaving a single optional-everything type in place because it makes invariants explicit at the boundaries where the engine promises deterministic execution state.
3. This remains fully engine-agnostic. It changes execution plumbing only, not any game-specific behavior or schema shape.
4. No backwards-compatibility shim is needed. Existing call sites should be migrated directly to the new current-truth types in one pass.

## What to Change

### 1. Split partial vs normalized result typing

In `effect-context.ts` and related runtime typing:

- Introduce a partial internal result type for handler/fragment authoring.
- Introduce a normalized result type whose `emittedEvents`, `bindings`, and `decisionScope` are always present after normalization.
- Update exported runtime/compiler/public APIs to return the normalized type where that invariant is guaranteed.

### 2. Centralize normalization around the new types

In `effect-dispatch.ts`, `effect-compiler.ts`, and any shared helpers:

- Make normalization helpers return the normalized result type explicitly.
- Remove redundant post-normalization optional-field fallback logic where the new type already guarantees presence.
- Preserve current behavior exactly; this is a contract/type cleanup, not a semantic change.

### 3. Tighten tests around the normalized boundary

- Add or update tests that prove public/runtime/compiled sequence boundaries return normalized results with explicit `decisionScope`, `bindings`, and `emittedEvents` defaults.
- Keep focused tests proving handlers/fragments may still author partial results internally before normalization.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify)
- `packages/engine/src/kernel/effect-dispatch.ts` (modify)
- `packages/engine/src/kernel/effect-compiler.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-types.ts` (modify)
- `packages/engine/test/unit/effects-runtime.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify)
- `packages/engine/test/unit/effect-context-test-helpers.test.ts` (modify if needed)

## Out of Scope

- Changing effect semantics or decision-key generation
- Reworking action/discovery lifecycle behavior
- Broad context-shape cleanup beyond result typing

## Acceptance Criteria

### Tests That Must Pass

1. Public runtime wrappers return the normalized result type and always expose `decisionScope`, `bindings`, and `emittedEvents`.
2. Compiled sequence execution returns the same normalized result contract as interpreted execution.
3. Internal effect handlers/fragments may still omit fields before normalization without breaking behavior.
4. Existing suite: `pnpm -F @ludoforge/engine test`
5. Existing suite: `pnpm turbo typecheck`
6. Existing suite: `pnpm turbo lint`

### Invariants

1. Boundary result contracts express current runtime truth directly in the type system.
2. Partial internal handler/fragment authoring remains allowed only below normalization boundaries.
3. No alias types, deprecated result shims, or dual public contracts are introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-runtime.test.ts` — prove public interpreted execution always returns normalized defaults, not optional omissions.
2. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — prove compiled sequence outputs expose the same normalized boundary shape as interpreted execution.
3. `packages/engine/test/unit/effect-context-test-helpers.test.ts` — update helper/type expectations if the new normalized/public result surface changes test scaffolding.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-runtime.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/unit/effect-context-test-helpers.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`
