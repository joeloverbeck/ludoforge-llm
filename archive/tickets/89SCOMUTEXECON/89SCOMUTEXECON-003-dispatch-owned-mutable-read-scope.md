# 89SCOMUTEXECON-003: Wire MutableReadScope into effect dispatch and migrate simple handlers

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect dispatch, handler signatures, compiled delegate plumbing, targeted handler migrations
**Deps**: archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-002-mutable-read-scope-foundations.md

## Problem

`MutableReadScope` now exists, but the interpreted effect path still recreates
`ReadContext` bridge objects inside hot handlers via `mergeToEvalContext` and
`mergeToReadContext`. That means Spec 89's fixed-shape scope exists only as a
foundation; the runtime still pays the per-handler allocation cost in the most
frequent dispatch path.

This ticket should move the scope into dispatch-owned runtime plumbing and
migrate the handlers whose usage patterns are simple enough to benefit without
adding architectural debt.

## Assumption Reassessment (2026-03-28)

1. `applyEffectsWithBudgetState` in `packages/engine/src/kernel/effect-dispatch.ts`
   already owns the mutable execution loop through `workCursor` and is the right
   place to create one `MutableReadScope` per dispatch scope — **confirmed**.
2. `MutableReadScope`, `createMutableReadScope`, `updateReadScope`, and
   `updateReadScopeRaw` already exist in
   `packages/engine/src/kernel/effect-context.ts` thanks to ticket `002` —
   **confirmed discrepancy with the original ticket framing**.
3. `effect-registry.ts` still defines the interpreted handler contract as
   `(effect, env, cursor, budget, applyBatch)` — **confirmed**.
4. The compiled delegate path in
   `packages/engine/src/kernel/effect-compiler-codegen.ts` also invokes several
   handler functions directly (`applySetVar`, `applyAddVar`, `applySetActivePlayer`,
   `applyTransferVar`, `applyReveal`, `applyConceal`). Any handler-signature
   expansion must update this path too — **confirmed missing scope in the
   original ticket**.
5. The “simple handler” bucket is narrower than the original ticket suggested:
   `effects-binding.ts` and `effects-reveal.ts` are straightforward eval-scope
   consumers; `effects-resource.ts` and `effects-var.ts` are still in scope but
   require careful raw-vs-resolved binding handling rather than a blind
   search/replace — **confirmed scope refinement**.
6. There are already focused unit tests covering the migrated behavior:
   `bind-value.test.ts`, `effects-var.test.ts`, `transfer-var.test.ts`,
   `effects-reveal.test.ts`, plus broader lifecycle/control/golden/complex
   coverage — **confirmed discrepancy with the original “no new test files
   required” framing**.
7. No helper file currently constructs raw registry handler calls that would
   need a new scope argument. The test surface exercises handlers through
   `applyEffect` / `applyEffects` and compiled execution paths — **confirmed**.

## Architecture Reassessment

1. Reusing one dispatch-owned `MutableReadScope` is more beneficial than the
   current architecture. It removes the remaining hot-path `ReadContext`
   allocations while keeping the external immutable contract unchanged.
2. Storing mutable scope on `EffectEnv` or `EffectCursor` would blur the
   static/dynamic boundary established by Specs 77-78 and make compiled and
   interpreted execution harder to reason about. That is not the ideal design.
3. The cleanest current boundary is:
   - `applyEffectsWithBudgetState` owns scope lifecycle.
   - handlers that need eval/read context receive the scope explicitly.
   - `applyBatch` remains unchanged so nested dispatch still creates its own
     local scope from `env + cursor`.
4. Widening the handler signature is acceptable here because the scope is a
   real dependency of migrated handlers, and the alternative would either keep
   hidden mutable state off-interface or force repeated per-handler helper
   rebuilding. The interface expansion is justified only if compiled delegates
   are updated in the same change.
5. No backwards-compatibility shim is warranted. If signature changes break
   call sites, every call site should be updated now.

## What to Change

### 1. Create and maintain one mutable read scope per dispatch scope

In `packages/engine/src/kernel/effect-dispatch.ts`:

- create `const readScope = createMutableReadScope(env, cursor)` at
  `applyEffectsWithBudgetState` entry, alongside `workCursor`
- call `updateReadScope(readScope, workCursor, env)` before each interpreted
  handler dispatch
- thread `readScope` through `applyEffectWithBudget`

### 2. Widen the interpreted handler contract intentionally

In `packages/engine/src/kernel/effect-registry.ts`:

- add `scope: MutableReadScope` to `EffectHandler`
- update the dispatch-table typing in `effect-dispatch.ts`
- keep `ApplyEffectsWithBudget` unchanged

### 3. Keep compiled delegates consistent with the chosen handler contract

In `packages/engine/src/kernel/effect-compiler-codegen.ts`:

- when a compiled delegate invokes a widened handler directly, construct and
  pass a `MutableReadScope` derived from the compiled `env + cursor`
- do not introduce a separate compiled-only handler API

### 4. Migrate `effects-binding.ts`

- replace `mergeToEvalContext(env, cursor)` with direct `scope` usage
- remove the merge helper import

### 5. Migrate `effects-reveal.ts`

- replace `mergeToEvalContext(env, cursor)` with direct `scope` usage for
  reveal/conceal selector resolution
- keep trace provenance on `env + cursor`; only the eval/read dependency moves

### 6. Migrate `effects-var.ts`

- replace the per-call `mergeToReadContext` bridge creation with scope reuse
- preserve the current distinction between:
  - resolved eval bindings for value/selector resolution
  - raw `cursor.bindings` as the externally returned binding contract
- do not regress profiler buckets or mutable-state handling

### 7. Migrate `effects-resource.ts`

- replace `mergeToEvalContext` / `mergeToReadContext` allocations with scope
  reuse
- use `updateReadScopeRaw` only when raw cursor bindings are semantically
  required; otherwise keep the resolved-binding scope

### 8. Update non-migrated handlers only as needed for signature consistency

If handler signatures widen, update remaining interpreted handlers
(`effects-choice.ts`, `effects-control.ts`, `effects-subset.ts`,
`effects-token.ts`, `effects-turn-flow.ts`) to accept the new parameter
without changing behavior yet.

## Files to Touch

- `packages/engine/src/kernel/effect-dispatch.ts`
- `packages/engine/src/kernel/effect-registry.ts`
- `packages/engine/src/kernel/effect-compiler-codegen.ts`
- `packages/engine/src/kernel/effects-binding.ts`
- `packages/engine/src/kernel/effects-var.ts`
- `packages/engine/src/kernel/effects-resource.ts`
- `packages/engine/src/kernel/effects-reveal.ts`
- `packages/engine/src/kernel/effects-choice.ts` (signature-only if required)
- `packages/engine/src/kernel/effects-control.ts` (signature-only if required)
- `packages/engine/src/kernel/effects-subset.ts` (signature-only if required)
- `packages/engine/src/kernel/effects-token.ts` (signature-only if required)
- `packages/engine/src/kernel/effects-turn-flow.ts` (signature-only if required)
- targeted test files that cover migrated dispatch/eval behavior

## Out of Scope

- Deleting `mergeToEvalContext` or `mergeToReadContext` from `effect-context.ts`
  for non-migrated call sites (ticket `004`)
- migrating the more complex handlers to actually use scope (`effects-choice`,
  `effects-control`, `effects-subset`, `effects-token`)
- changes to `legal-moves.ts` / `enumerateParams` (ticket `005`)
- changes to non-effect-dispatch eval-context construction sites outside the
  compiled delegate consistency work required by this ticket
- benchmark reporting beyond preserving correctness and completing the
  architectural migration cleanly

## Acceptance Criteria

### Tests That Must Pass

1. Focused unit/integration coverage for migrated handlers passes without
   weakened assertions, including:
   - `packages/engine/test/unit/bind-value.test.ts`
   - `packages/engine/test/unit/effects-var.test.ts`
   - `packages/engine/test/unit/transfer-var.test.ts`
   - `packages/engine/test/unit/effects-reveal.test.ts`
   - `packages/engine/test/unit/effects-lifecycle.test.ts`
   - `packages/engine/test/unit/effects-control-flow.test.ts`
   - `packages/engine/test/unit/effects.golden.test.ts`
   - `packages/engine/test/integration/effects-complex.test.ts`
2. Full engine suite: `pnpm -F @ludoforge/engine test`
3. Typecheck: `pnpm turbo typecheck`
4. Lint: `pnpm turbo lint`

### Invariants

1. `applyEffectsWithBudgetState` creates exactly one `MutableReadScope` per
   invocation and updates it before each interpreted handler dispatch.
2. The chosen architecture is explicit in code shape: scope lifecycle is owned
   by dispatch, not hidden inside `EffectEnv` or `EffectCursor`.
3. Migrated handlers no longer import or call `mergeToEvalContext` /
   `mergeToReadContext`.
4. If the handler contract widens, compiled delegates are updated in the same
   change so interpreted and compiled paths remain aligned.
5. The external contract remains immutable: `applyMove(state) -> newState`.
6. Raw-vs-resolved binding semantics are preserved:
   move params remain visible to evaluation where they were before, but they do
   not leak into returned runtime bindings unless a handler explicitly exports
   them.
7. Scope does not escape the synchronous call frame that owns it.

## Test Plan

### New/Modified Tests

1. Strengthen migrated-handler tests to prove dispatch-scope reuse preserves
   behavior for:
   - move-param-backed evaluation
   - state updates across sequential effects
   - binding export boundaries
2. Add or extend compiled-path coverage if widening the handler contract
   requires direct delegate updates in `effect-compiler-codegen.ts`.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-28
- Actual changes:
  - `applyEffectsWithBudgetState` now owns a single `MutableReadScope` per
    dispatch scope and refreshes it before each interpreted handler call.
  - The interpreted handler contract was widened to accept the dispatch-owned
    scope, and compiled delegate plumbing in
    `effect-compiler-codegen.ts` was updated in the same change so direct
    handler invocation stays aligned across interpreted and compiled paths.
  - The migrated handlers are `effects-binding.ts`, `effects-var.ts`,
    `effects-resource.ts`, and `effects-reveal.ts`; they no longer rebuild
    `ReadContext` bridge objects in their hot paths.
  - Remaining handler files were updated only for signature consistency; they
    were not migrated to scope-backed evaluation in this ticket.
  - Regression coverage was strengthened in
    `packages/engine/test/unit/bind-value.test.ts` and
    `packages/engine/test/unit/effects-var.test.ts` to prove sequential effects
    observe state updates through the reused dispatch scope.
- Deviations from original plan:
  - The original ticket understated the compiled delegate impact. The final
    implementation updated `effect-compiler-codegen.ts` as a first-class part
    of the change rather than treating compiled execution as out of band.
  - `effects-choice.ts`, `effects-control.ts`, `effects-subset.ts`,
    `effects-token.ts`, and `effects-turn-flow.ts` were intentionally left as
    signature-only adopters. Actual scope migration for those complex handlers
    remains follow-on work.
- Verification results:
  - `pnpm -F @ludoforge/engine test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
