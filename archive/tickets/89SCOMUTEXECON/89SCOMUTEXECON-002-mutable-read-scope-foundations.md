# 89SCOMUTEXECON-002: Add MutableReadScope type and scope factory helpers

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel/effect-context.ts
**Deps**: archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-001-effect-context-shape-contract.md

## Problem

The kernel still rebuilds eval/read bridge objects on demand through
`mergeToEvalContext` and `mergeToReadContext`. Those helpers currently spread
the full `EffectEnv` object, overlay `state`/`bindings`, and then cast the
result down to `ReadContext`. That means the runtime object is wider than the
declared contract, and every call allocates a fresh bridge object just to feed
`evalValue`, `evalCondition`, `evalQuery`, and endpoint resolvers.

This ticket should establish the minimal building block for the broader Spec 89
rollout: an explicit, fixed-shape, `ReadContext`-compatible mutable scope and
factory helpers. It does **not** yet decide how later tickets thread that scope
through handlers.

## Assumption Reassessment (2026-03-28)

1. `ReadContext` in `packages/engine/src/kernel/eval-context.ts` currently has 11 fields, with `runtimeTableIndex?`, `freeOperationOverlay?`, and `maxQueryResults?` marked optional in the public interface — **confirmed, but this is not compatible with a fixed-shape own-property contract under `exactOptionalPropertyTypes`**.
2. `EffectEnv` in `packages/engine/src/kernel/effect-context.ts` contains the static subset needed to populate every non-dynamic `ReadContext` field, plus additional non-ReadContext execution fields such as `moveParams`, `traceContext`, mode, and authority data — **confirmed**.
3. `EffectCursor` in `packages/engine/src/kernel/effect-context.ts` contains the dynamic `state`/`bindings` pair needed for a read scope, along with `rng`, `decisionScope`, `effectPath`, and optional `tracker` that are *not* part of `ReadContext` — **confirmed**.
4. `resolveEffectBindings` already centralizes the move-param merge policy for eval sites and returns `cursor.bindings` unchanged when `moveParams` is empty — **confirmed**.
5. Ticket `001` already landed the monomorphic `effectPath` / `traceContext` bridge fixes. This ticket must not restate that work as pending — **confirmed discrepancy with the original framing**.
6. `mergeToEvalContext` and `mergeToReadContext` currently return objects that contain more than the `ReadContext` contract because they spread `EffectEnv` wholesale and then cast to `ReadContext` — **confirmed discrepancy with the original “11-field object” framing**.
7. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` is the correct contract test file to extend for these helpers, and `packages/engine/test/unit/eval-context.test.ts` should cover the aligned `ReadContext`/`createEvalContext` contract — **confirmed scope addition**.

## Architecture Reassessment

1. Adding `MutableReadScope` and factory helpers is beneficial relative to the current architecture. It creates an *honest* eval-only object shape instead of continuing to rely on `{ ...env } as ReadContext`, which hides extra runtime fields behind a cast.
2. The fixed 11-field shape is a cleaner boundary than today’s merge helpers because it matches the intended `ReadContext` contract and keeps `undefined`-capable fields always present via explicit `| undefined`.
3. This ticket should stay narrowly scoped to the type and helper constructors. That keeps the architectural decision reversible while later tickets determine the cleanest propagation strategy through dispatch and handler code.
4. The later migration tickets should be reconsidered before implementation. Adding a sixth `scope` parameter to every handler may be acceptable, but it is not automatically the cleanest long-term API. The ideal architecture keeps the eval-only scope local to the evaluation boundary unless hot-path evidence justifies widening the handler contract.
5. To keep the type boundary honest, this ticket should also align `ReadContext` itself with the fixed-shape rule by converting those three optional properties to explicit `| undefined` fields and teaching `createEvalContext` to always materialize them. This is the same pattern already used in ticket `001` for the trace bridge types.
6. No backwards-compatibility shims are warranted. These helpers are additive for now; later tickets should delete the old merge helpers once migration is complete.

## What to Change

### 1. Add `MutableReadScope` to `effect-context.ts`

```typescript
export interface MutableReadScope {
  def: GameDef;
  adjacencyGraph: AdjacencyGraph;
  state: GameState;
  activePlayer: PlayerId;
  actorPlayer: PlayerId;
  bindings: Readonly<Record<string, unknown>>;
  resources: EvalRuntimeResources;
  runtimeTableIndex: RuntimeTableIndex | undefined;
  freeOperationOverlay: FreeOperationExecutionOverlay | undefined;
  maxQueryResults: number | undefined;
  collector: ExecutionCollector;
}
```

All 11 properties must always exist as own properties.

### 2. Add `createMutableReadScope(env, cursor)`

Build the fixed-shape scope from `EffectEnv` + `EffectCursor`, using
`resolveEffectBindings(env, cursor)` for the initial bindings field.

### 3. Add `updateReadScope(scope, cursor, env)`

Mutate `scope.state` and `scope.bindings` in place, with bindings resolved via
`resolveEffectBindings(env, cursor)`.

### 4. Add `updateReadScopeRaw(scope, cursor)`

Mutate `scope.state` and `scope.bindings` in place from `cursor` directly,
without move-param merging. This preserves the distinction between
`mergeToEvalContext` and `mergeToReadContext`.

### 5. Export the new type and helpers

Export `MutableReadScope`, `createMutableReadScope`, `updateReadScope`, and
`updateReadScopeRaw` from `effect-context.ts`.

### 6. Align `ReadContext` and `createEvalContext` with the fixed-shape contract

- Change `ReadContext.runtimeTableIndex`, `ReadContext.freeOperationOverlay`, and
  `ReadContext.maxQueryResults` to explicit `| undefined` fields.
- Keep `EvalContextInput` ergonomic for callers by allowing those three inputs to
  remain optional at construction time.
- Update `createEvalContext` so it always materializes those three properties as
  own properties on the returned object.

## Files to Touch

- `packages/engine/src/kernel/effect-context.ts` (modify) — add the type and three helpers
- `packages/engine/src/kernel/eval-context.ts` (modify) — align `ReadContext` and `createEvalContext` with the fixed-shape contract
- `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` (modify) — add contract coverage for the new scope helpers
- `packages/engine/test/unit/eval-context.test.ts` (modify) — assert `createEvalContext` always materializes the `undefined`-capable fields

## Out of Scope

- Wiring `MutableReadScope` into `effect-dispatch.ts` or any `effects-*.ts` files.
- Changing handler signatures in `effect-registry.ts`.
- Deleting `mergeToEvalContext` or `mergeToReadContext`.
- Changing `EffectEnv` or `EffectCursor`.
- Changes to `legal-moves.ts` or any non-effect-dispatch eval sites beyond the `ReadContext` / `createEvalContext` contract alignment in this ticket.
- Benchmarking or performance claims beyond establishing the building block.

## Acceptance Criteria

### Tests That Must Pass

1. `effect-context-construction-contract.test.ts` verifies:
   - `createMutableReadScope` returns the expected 11-field shape.
   - all 11 fields are own properties, including the three `undefined`-capable ones.
   - initial bindings include `moveParams` merge semantics.
   - `updateReadScope` mutates only `state` and `bindings` and re-applies move-param merge semantics.
   - `updateReadScopeRaw` mutates only `state` and `bindings` and uses raw cursor bindings.
   - a `MutableReadScope` is assignable to `ReadContext`.
2. `eval-context.test.ts` verifies `createEvalContext` always returns own properties for `runtimeTableIndex`, `freeOperationOverlay`, and `maxQueryResults`, even when omitted by the caller.
3. Full engine suite: `pnpm -F @ludoforge/engine test`
4. Typecheck: `pnpm turbo typecheck`
5. Lint: `pnpm turbo lint`

### Invariants

1. `MutableReadScope` has exactly the 11 `ReadContext` fields and no execution-only extras.
2. `createMutableReadScope` always materializes `runtimeTableIndex`, `freeOperationOverlay`, and `maxQueryResults` as own properties, even when `undefined`.
3. `updateReadScope` and `updateReadScopeRaw` mutate in place and return `void`.
4. The helpers do not mutate `env` or `cursor`.
5. `ReadContext` and `createEvalContext` represent the same fixed-shape contract as `MutableReadScope`, rather than relying on optional-property looseness.
6. The move-param merge policy remains centralized in `resolveEffectBindings`.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts`
   - add a new block covering scope construction, own-property presence, in-place mutation, and compile-time `ReadContext` compatibility.
2. `packages/engine/test/unit/eval-context.test.ts`
   - add assertions that `createEvalContext` always materializes the three `undefined`-capable fields as own properties.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-28
- Actual changes:
  - Added `MutableReadScope`, `createMutableReadScope`, `updateReadScope`, and `updateReadScopeRaw` in `packages/engine/src/kernel/effect-context.ts`.
  - Aligned `ReadContext` and `createEvalContext` to the same fixed-shape contract so the mutable scope is assignable without casts under `exactOptionalPropertyTypes`.
  - Strengthened `packages/engine/test/unit/kernel/effect-context-construction-contract.test.ts` and `packages/engine/test/unit/eval-context.test.ts` to lock the new shape invariants.
- Deviations from original plan:
  - The original ticket assumed TypeScript structural typing would accept explicit `| undefined` fields against `ReadContext`’s optional properties. Typecheck disproved that, so the implementation also updated the `ReadContext` / `createEvalContext` contract.
  - The work stayed at the foundational layer only; no dispatch or handler migration was attempted.
- Verification results:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/effect-context-construction-contract.test.js`
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
