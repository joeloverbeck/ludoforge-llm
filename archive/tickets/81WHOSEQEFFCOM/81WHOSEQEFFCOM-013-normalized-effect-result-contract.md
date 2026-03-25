# 81WHOSEQEFFCOM-013: Introduce explicit normalized effect result contracts

**Status**: COMPLETED
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

1. `applyEffectsWithBudgetState` and `composeFragments` already normalize `bindings`, `emittedEvents`, and `decisionScope` on every completed return path, including pending-choice short-circuits.
2. `applyEffect` and `applyEffects` sit on top of those normalized internals, but they still expose the broader `EffectResult` type and re-spread fields as though normalization were optional.
3. Runtime handlers and compiled fragments genuinely still author partial results internally. Many handlers omit `bindings`, `emittedEvents`, or `decisionScope` and rely on the boundary normalizer.
4. The current single `EffectResult` type therefore conflates two distinct contracts:
   - partial internal handler/fragment outputs
   - normalized execution-boundary outputs
5. `CompiledEffectFn` and `CompiledEffectFragment` also currently inherit that conflation. The compiler boundary should return the normalized contract, while individual fragment helpers should remain free to return partial results.
6. The ticket's original file/test list was slightly stale:
   - compiled normalization helpers also live in `packages/engine/src/kernel/effect-compiler-codegen.ts`
   - runtime verification/parity logic in `packages/engine/src/kernel/phase-lifecycle.ts` still compares with `??` fallback semantics
   - the helper test path is `packages/engine/test/unit/effect-context-test-helpers.test.ts`, not `packages/engine/test/unit/kernel/...`

## Architecture Check

1. The clean architecture is a two-tier contract:
   - partial internal result type for effect handlers/fragments
   - normalized boundary result type for public/runtime/compiled sequence outputs
2. This is more robust than leaving a single optional-everything type in place because it makes invariants explicit at the boundaries where the engine promises deterministic execution state.
3. This remains fully engine-agnostic. It changes execution plumbing only, not any game-specific behavior or schema shape.
4. This is preferable to the current architecture. It tightens the type system around contracts the runtime already guarantees without forcing every internal handler to emit boilerplate defaults.
5. No backwards-compatibility shim is needed. Existing call sites should be migrated directly to the new current-truth types in one pass.

## What to Change

### 1. Split partial vs normalized result typing

In `effect-context.ts` and related runtime typing:

- Introduce a partial internal result type for handler/fragment authoring.
- Introduce a normalized result type whose `emittedEvents`, `bindings`, and `decisionScope` are always present after normalization.
- Update exported runtime/compiler/public APIs to return the normalized type where that invariant is guaranteed.

### 2. Centralize normalization around the new types

In `effect-dispatch.ts`, `effect-compiler.ts`, `effect-compiler-codegen.ts`, and any shared helpers:

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
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-types.ts` (modify)
- `packages/engine/src/kernel/effect-registry.ts` (modify)
- `packages/engine/src/kernel/phase-lifecycle.ts` (modify if boundary comparisons can rely on normalized contracts directly)
- `packages/engine/test/unit/effects-runtime.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify)
- `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` (modify if needed)
- `packages/engine/test/unit/effect-context-test-helpers.test.ts` (modify only if helper/export typing changes require it)

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
3. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — keep fragment/helper expectations honest where partial internal results are still allowed before normalization.
4. `packages/engine/test/unit/effect-context-test-helpers.test.ts` — update helper/type expectations only if the public export surface used by helpers changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/effects-runtime.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/unit/effect-context-test-helpers.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-25
- What actually changed:
  - split the old broad `EffectResult` contract into `PartialEffectResult` for internal handlers/fragments and `NormalizedEffectResult` for normalized runtime/compiler boundaries
  - updated interpreted and compiled boundary APIs to return the normalized contract directly
  - removed redundant normalized-boundary fallback logic where the stronger type now guarantees `bindings`, `emittedEvents`, and `decisionScope`
  - strengthened focused runtime/compiler tests to lock the normalized-boundary defaults in place
- Deviations from original plan:
  - `packages/engine/src/kernel/effect-registry.ts` and `packages/engine/src/kernel/phase-lifecycle.ts` were updated as part of the real blast radius
  - `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` needed type updates to keep explicit coverage of partial fragment behavior
  - `packages/engine/test/unit/effect-context-test-helpers.test.ts` did not require changes
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/effects-runtime.test.js packages/engine/dist/test/unit/kernel/effect-compiler.test.js packages/engine/dist/test/unit/kernel/effect-compiler-codegen.test.js packages/engine/dist/test/unit/effect-context-test-helpers.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
