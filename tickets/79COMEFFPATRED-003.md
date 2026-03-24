# 79COMEFFPATRED-003: Integrate DraftTracker into `composeFragments`

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel compiled effect orchestration
**Deps**: 79COMEFFPATRED-001

## Problem

`composeFragments` currently iterates a `CompiledEffectFragment[]` array,
creating a per-fragment context spread (`{ ...compiledCtx, decisionScope }`)
plus `normalizeFragmentResult` (another object allocation) for each fragment.
The interpreter's mutable `workCursor` avoids both allocations.

This ticket rewrites `composeFragments` to:
1. Create a `MutableGameState` + `DraftTracker` at scope entry.
2. Thread the `tracker` through fragment calls via ctx.
3. Inline the normalization logic (null-coalesce fields directly).
4. Delete `normalizeFragmentResult`.

## Assumption Reassessment (2026-03-24)

1. `composeFragments` is in `effect-compiler.ts` — **confirmed**.
2. `normalizeFragmentResult` is in `effect-compiler.ts` — **confirmed**.
3. `createMutableState` and `createDraftTracker` are in `state-draft.ts` — **confirmed**.
4. `freezeState` is available in `state-draft.ts` for casting back — **confirmed**.
5. `composeFragments` returns a `CompiledEffectFn` — **confirmed** (signature: `(state, rng, bindings, ctx) => EffectResult`).
6. `normalizeFragmentResult` is only called inside `composeFragments` — **must verify at implementation time**. If called elsewhere, those call sites must also be inlined.
7. The `CompiledEffectFn` external signature is unchanged — callers pass immutable `GameState`, get immutable `GameState` back.

## Architecture Check

1. This mirrors the interpreter's `applyEffectsWithBudgetState` scope pattern — mutable state created at entry, frozen at exit.
2. Foundation 7 (Immutability) explicitly allows mutable working copies within a synchronous scope.
3. The external contract `applyMove(state) → newState` is preserved — input state is never modified.

## What to Change

### 1. Rewrite `composeFragments` body

At scope entry of the returned function:
```typescript
const mutableState = createMutableState(state);
const tracker = createDraftTracker();
let currentState = mutableState as GameState;
```

Thread `tracker` through each fragment call:
```typescript
const result = fragment.execute(currentState, currentRng, currentBindings, {
  ...compiledCtx,
  decisionScope: currentDecisionScope,
  tracker,
});
```

Inline normalization — replace `normalizeFragmentResult(result, ...)` with
direct field reads:
```typescript
currentState = result.state;
currentRng = result.rng;
currentBindings = result.bindings ?? currentBindings;
currentDecisionScope = result.decisionScope ?? currentDecisionScope;
// accumulate emittedEvents, check pendingChoice
```

At scope exit, freeze the state:
```typescript
return {
  state: freezeState(currentState as MutableGameState),
  rng: currentRng,
  // ...
};
```

### 2. Delete `normalizeFragmentResult`

Remove the function definition. Verify no other call sites exist.

### 3. Update tests

Update any tests that directly test `normalizeFragmentResult` or that assert on
`composeFragments` internal behavior. The external behavior (input/output
contract) must remain identical.

## Files to Touch

- `packages/engine/src/kernel/effect-compiler.ts` (modify — rewrite `composeFragments`, delete `normalizeFragmentResult`)
- `packages/engine/test/unit/kernel/effect-compiler.test.ts` (modify — update/add composition tests)

## Out of Scope

- `createFallbackFragment` rewrite — deferred to 79COMEFFPATRED-004.
- `effect-compiler-codegen.ts` changes — deferred to 79COMEFFPATRED-005.
- `effect-compiler-runtime.ts` — no changes in this ticket.
- `effect-compiler-types.ts` — already done in 79COMEFFPATRED-001.
- `phase-lifecycle.ts` — no changes (compiled fn signature unchanged).
- `state-draft.ts` — read only (import utilities).
- GameDef schema, GameSpecDoc YAML.
- Simulator, runner, agents.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: `composeFragments` creates a mutable scope — output `state` is not identity-equal to input `state` (even for no-op fragments).
2. Unit test: `composeFragments` threads tracker through fragment calls — fragments receive `ctx.tracker` that is a `DraftTracker`.
3. Unit test: `composeFragments` accumulates `emittedEvents` across fragments.
4. Unit test: `composeFragments` returns early on `pendingChoice`.
5. Unit test: `composeFragments` threads `bindings` and `decisionScope` across fragments (null-coalesce behavior).
6. `normalizeFragmentResult` is no longer exported or callable.
7. `pnpm -F @ludoforge/engine test` — full engine test suite passes.
8. `pnpm -F @ludoforge/engine test:e2e` — E2E parity tests pass.
9. `pnpm turbo typecheck` — no type errors.
10. `pnpm turbo lint` — no lint violations.

### Invariants

1. `CompiledEffectFn` signature is unchanged: `(state, rng, bindings, ctx) => EffectResult`.
2. Callers pass immutable `GameState` and receive immutable `GameState` — the input is never modified.
3. Compiled path produces bit-identical results to the interpreter (verified by existing `verifyCompiledEffects` flag).
4. Fragment execution order is unchanged (sequential, first-to-last).
5. `emittedEvents` accumulation order is unchanged.
6. `pendingChoice` early-return behavior is unchanged.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — test mutable scope creation, tracker threading, event accumulation, pendingChoice short-circuit, bindings/scope threading.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine test:e2e`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
