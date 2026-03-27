# 89SCOMUTEXECON-004: Migrate complex handlers and delete merge functions

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel effect handlers + effect-context.ts cleanup
**Deps**: archive/tickets/89SCOMUTEXECON/89SCOMUTEXECON-003-dispatch-owned-mutable-read-scope.md

## Problem

After ticket 003, the complex effect handlers (effects-choice.ts, effects-control.ts, effects-subset.ts, effects-token.ts) still create ReadContext objects via `mergeToEvalContext`/`mergeToReadContext`. These handlers have nested iteration (forEach, let, reduce), recursive `applyEffectsWithBudgetState` calls, and multi-site merge patterns that require careful scope management. Once all handlers are migrated, the merge functions are dead code and must be deleted (Foundation 9).

## Assumption Reassessment (2026-03-28)

1. `effects-choice.ts` uses `mergeToReadContext` and `toTraceProvenanceContext` — **confirmed**. Choice handlers evaluate conditions to determine valid choices.
2. `effects-control.ts` still uses `mergeToEvalContext` at multiple direct evaluation sites (`if`, `let`, `forEach`, `reduce`, `removeByPriority`) and also dispatches recursively via `applyEffectsWithBudgetState` — **confirmed discrepancy with the original ticket**.
3. `effects-subset.ts` uses `mergeToEvalContext`, `mergeToReadContext`, and `resolveEffectBindings` — **confirmed**. Subset handlers evaluate multiple conditions.
4. `effects-token.ts` uses `mergeToReadContext`, `resolveEffectBindings`, and `toTraceProvenanceContext` — **confirmed**. Token handlers resolve zone/token references.
5. Ticket `003` already widened the interpreted handler contract and compiled delegate plumbing to pass a dispatch-owned `MutableReadScope` explicitly. This ticket no longer needs to re-litigate that boundary decision — **confirmed discrepancy with the original architectural note**.
6. Nested scope isolation: each `applyEffectsWithBudgetState` call already creates its own scope (from ticket 003). Inner handlers see the inner scope, not the parent — **confirmed** by the workCursor nesting pattern.
7. The remaining complexity is not handler-signature design anymore; it is localized binding/state updates inside nested evaluation sites where direct reuse of the incoming scope may or may not be sufficient — **confirmed refined scope**.

## Architecture Check

1. The widened handler contract is already the chosen architecture. This ticket should exploit that existing scope parameter instead of introducing a second parallel eval-context strategy.
2. Complex handlers should still avoid blind search-and-replace. For nested control-flow and custom-binding cases, small local helpers that mutate a temporary or incoming scope are acceptable if they keep the code clearer than inlining repeated field updates.
3. Nested forEach/let/reduce bodies dispatch via `applyEffectsWithBudgetState`, which creates its own `MutableReadScope`. The parent scope is not visible to the child — same isolation as the existing workCursor pattern.
4. After migration, `mergeToEvalContext` and `mergeToReadContext` should have zero callers and be deleted (Foundation 9: no deprecated fallbacks).

## Architectural Note

The architectural question is now narrower than the original ticket assumed:

1. Prefer direct reuse of the existing `scope` parameter where the handler's eval
   bindings match dispatch semantics.
2. Use small local helper updates only at the sites that need raw bindings or
   custom temporary bindings.
3. Do not introduce a second handler API or move scope ownership out of dispatch.

Default recommendation: finish convergence on the dispatch-owned scope model and
keep any per-handler helpers purely local.

## What to Change

### 1. Reassess only the local binding-update shape before replacing merge calls

The handler boundary decision is already settled by ticket 003. For each complex
handler, decide only whether direct `scope` reuse or a tiny local helper is
cleaner at each nested/custom-binding evaluation site.

### 2. Migrate `effects-control.ts`

This handler primarily dispatches to `applyEffectsWithBudgetState` for body effects. Update any direct `mergeToEvalContext`/`mergeToReadContext` calls to use scope. Recursive dispatch already gets its own scope from ticket 003's changes.

### 3. Migrate `effects-subset.ts`

Replace `mergeToEvalContext` and `mergeToReadContext` calls with `scope`. Where `resolveEffectBindings` is called to construct custom bindings for subset evaluation, this may remain as a standalone call if the bindings differ from scope.bindings.

### 4. Migrate `effects-token.ts`

Replace `mergeToReadContext` calls with `scope`. Where `resolveEffectBindings` is called for custom binding resolution in token placement/movement, evaluate whether scope.bindings suffices or a separate resolve call is needed.

### 5. Delete `mergeToEvalContext` and `mergeToReadContext` from `effect-context.ts`

Remove function definitions and exports. Remove from `index.ts`/`runtime.ts` re-exports if present.

### 6. Strengthen regression coverage where scope reuse can miss updated bindings/state

If migration reveals subtle state/binding sequencing risks, add focused tests in
the existing handler test files rather than relying only on broad integration
coverage.

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-control.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-subset.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effects-token.ts` (modify) — migrate to scope
- `packages/engine/src/kernel/effect-context.ts` (modify) — delete `mergeToEvalContext`, `mergeToReadContext`
- `packages/engine/src/kernel/index.ts` (modify, if re-exports merge functions)
- targeted existing handler test files, if scope migration exposes missing invariants

## Out of Scope

- Changes to `effect-dispatch.ts` (already wired in ticket 003).
- Changes to effects-binding.ts, effects-var.ts, effects-resource.ts, effects-reveal.ts (already migrated in ticket 003).
- Changes to `legal-moves.ts` / `enumerateParams` (ticket 005).
- Changes to `createEvalContext` (used by other subsystems, not by effect handlers — ticket 006).
- `toTraceProvenanceContext` and `toTraceEmissionContext` — these remain (they serve trace emission, not ReadContext construction).
- `resolveEffectBindings` — remains as a utility for custom binding construction.
- Performance benchmarking (measure after this ticket to validate Phase 1 impact).

## Acceptance Criteria

### Tests That Must Pass

1. All existing effect handler tests pass without weakening assertions.
2. All FITL game-rule tests pass (compile + run production spec).
3. All Texas Hold'em tests pass.
4. Determinism tests: same seed + same actions = identical Zobrist hash.
5. Full engine test suite: `pnpm -F @ludoforge/engine test`
6. E2E tests: `pnpm -F @ludoforge/engine test:e2e`
7. Typecheck: `pnpm turbo typecheck`

### Invariants

1. `mergeToEvalContext` and `mergeToReadContext` do not exist in the codebase (zero grep matches across `packages/engine/src/`).
2. The final handler/eval architecture converges on the existing dispatch-owned
   scope model from ticket 003; any local helper is only a binding-update aid,
   not a replacement architectural layer.
3. Nested scope isolation: each `applyEffectsWithBudgetState` invocation creates its own `MutableReadScope`.
4. External contract unchanged: `applyMove(state) -> newState` remains immutable.
5. `resolveEffectBindings` remains available for custom binding construction where needed.
6. No scope references stored in closures, return values, or result objects.

## Test Plan

### New/Modified Tests

1. Use existing handler and integration test files, but add focused assertions if
   migration exposes uncovered state/binding sequencing invariants.
2. Verify via grep that merge functions are fully removed.

### Commands

1. `pnpm -F @ludoforge/engine test` (full engine suite)
2. `pnpm -F @ludoforge/engine test:e2e` (end-to-end)
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
5. `grep -r "mergeToEvalContext\|mergeToReadContext" packages/engine/src/` — must return zero matches.
6. `grep -r "mergeToEvalContext\|mergeToReadContext" packages/engine/test/` — must return zero matches (or only in historical comments if any).
