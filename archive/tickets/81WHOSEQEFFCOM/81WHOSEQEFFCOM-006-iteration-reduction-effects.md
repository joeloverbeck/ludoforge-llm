# 81WHOSEQEFFCOM-006: Compile iteration & reduction effects (forEach, reduce, removeByPriority)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — effect-compiler-patterns.ts, effect-compiler-codegen.ts
**Deps**: archive/tickets/81WHOSEQEFFCOM-001-classifyEffect-switch-dispatch.md, archive/tickets/81WHOSEQEFFCOM-002-variable-binding-leaf-effects.md, archive/tickets/81WHOSEQEFFCOM/81WHOSEQEFFCOM-005-token-effects.md

## Problem

Three iteration/reduction effects (tags 29, 30, 31) still fall back to the interpreter. These are high-impact targets: generic `forEach` and `reduce` are core lifecycle control-flow constructs across FITL and Texas Hold'em, while `removeByPriority` is a frequently used removal-ordering primitive in FITL. The compiler currently handles only the players-only `forEach` subset; the interpreter already handles the full `OptionsQuery` surface.

## Assumption Reassessment (2026-03-25)

1. `forEach` (tag 29): the interpreter already implements the full effect in `packages/engine/src/kernel/effects-control.ts` via `applyForEach(...)`. The compiler is the special case today: `classifyEffect(...)` only recognizes `over.query === 'players'`, and `effect-compiler-codegen.ts` exposes `compileForEachPlayers(...)`.
2. `reduce` (tag 30): implemented in `packages/engine/src/kernel/effects-control.ts` via `applyReduce(...)`. Its runtime contract is: evaluate `initial`, fold `next` across the bounded query result, bind the final accumulator to `resultBind`, run the mandatory continuation block `in`, then export only `$`-prefixed bindings except `resultBind`.
3. `reduce` does not currently rebase `decisionScope.iterationPath` per item in the interpreter. Any compiled implementation must match the current runtime contract, not the older ticket assumption.
4. `removeByPriority` (tag 31): implemented in `packages/engine/src/kernel/effects-control.ts` via `applyRemoveByPriority(...)`, not in `effects-token.ts`. It reevaluates each group query against the current state, enforces a decreasing removal budget, synthesizes `moveToken` effects, accumulates optional per-group `countBind` values, and optionally exports `remainingBind`.
5. `removeByPriority` does not currently emit a dedicated structured trace entry and does not currently rebase iteration scope per removal. The compiled path must preserve that behavior unless the interpreter is changed in the same ticket.
6. The repo already has dedicated compiler test files:
   - `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts`
   - `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts`
   - `packages/engine/test/unit/kernel/effect-compiler.test.ts`

## Architecture Check

1. The clean architecture is to eliminate the compiler-only split between `forEachPlayers` and “general forEach”. The interpreter has one `forEach`; the compiler should have one `forEach` descriptor and one compiled closure that accepts any `OptionsQuery`.
2. `forEach` compilation is clearly beneficial over the current architecture because it removes fallback for a ubiquitous control-flow node while preserving the already-proven compiled-loop structure.
3. `reduce` is also clearly beneficial to compile directly: it is pure control flow plus value evaluation, and it currently pays full interpreter overhead despite having a deterministic, closure-friendly execution model.
4. `removeByPriority` is more complex, but a direct compiled closure is still preferable to keeping it on the fallback path. Its semantics are localized and deterministic: query current state, consume budget, execute synthetic `moveToken` work, then run optional continuation effects.
5. Introducing a second special-case helper such as `compileForEachGeneral(...)` beside `compileForEachPlayers(...)` would make the architecture worse. This ticket should instead generalize the existing `forEach` compiler path and remove the players-only naming split.
6. If a later cleanup is desired, the better long-term refactor is a shared control-flow runtime/helper layer used by both interpreted and compiled paths for `forEach`, `reduce`, `removeByPriority`, and `evaluateSubset`. That broader unification is out of scope here unless this ticket exposes a concrete blocker.

## What to Change

### 1. Add/extend pattern descriptors

In `effect-compiler-patterns.ts`:
- replace the compiler-only `ForEachPlayersPattern` with a generic `ForEachPattern` carrying the full `forEach` payload: bind, `OptionsQuery`, effects, optional limit, optional `countBind`, optional continuation body
- add `ReducePattern` carrying the real runtime payload: query, item bind, accumulator bind, initial value, next expression, optional limit, mandatory `resultBind`, mandatory continuation body `in`
- add `RemoveByPriorityPattern` carrying budget, groups, optional `remainingBind`, and optional continuation body
- add `matchForEach`, `matchReduce`, and `matchRemoveByPriority`
- wire tags 29, 30, and 31 into `classifyEffect(...)`

### 2. Add compiled closure generators

In `effect-compiler-codegen.ts`:
- generalize the existing `compileForEachPlayers(...)` implementation into a single `compileForEach(...)` that supports all `OptionsQuery` sources while preserving current interpreter semantics for decision scope, `countBind`, optional continuation, and `buildForEachTraceEntry(...)`
- add `compileReduce(desc, bodyCompiler)` using direct closure execution, `buildReduceTraceEntry(...)`, and the same binding-export filtering as `applyReduce(...)`
- add `compileRemoveByPriority(desc, bodyCompiler)` using a direct compiled outer loop over groups and budget, with synthetic `moveToken` execution and optional continuation
- Wire into `compilePatternDescriptor` dispatcher

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (modify)
- `packages/engine/src/kernel/effect-compiler-codegen.ts` (modify)

## Out of Scope

- `evaluateSubset` (ticket 008)
- `chooseOne`/`chooseN` (ticket 009)
- Information effects (ticket 007)
- Deleting `createFallbackFragment` (ticket 010)
- Broad shared-runtime refactors across interpreted and compiled control-flow helpers
- Action-context effects

## Acceptance Criteria

### Tests That Must Pass

1. Pattern tests: `classifyEffect(...)` recognizes generic `forEach`, `reduce`, and `removeByPriority`
2. Per-effect-type unit test: compiled `forEach` matches interpreted behavior for players, zones, and token queries
3. Per-effect-type unit test: compiled `reduce` matches interpreted accumulation and binding-export behavior
4. Per-effect-type unit test: compiled `removeByPriority` matches interpreted budgeted multi-group removal behavior, including `countBind` and `remainingBind`
5. Trace parity test: compiled `forEach` and `reduce` emit the same structured control-flow trace entries as the interpreter
6. Decision scope test: compiled `forEach` matches the interpreter’s current iteration-scope behavior exactly
7. Edge case tests: `forEach` over an empty collection, `reduce` over an empty or single-item collection, `removeByPriority` with zero budget
8. Coverage test: sequences built only from these effects report full compiled coverage instead of fallback
12. Existing suite: `pnpm turbo test`
13. Existing suite: `pnpm turbo typecheck`

### Invariants

1. Compiled `forEach`, `reduce`, and `removeByPriority` preserve interpreted-path parity for state, RNG, emitted events, bindings, and decision scope
2. `reduce` binding export filtering mirrors `applyReduce(...)`
3. `removeByPriority` preserves per-group query refresh against the current state as the budget is consumed
4. Coverage accounting includes nested `reduce.in` / `removeByPriority.in` work correctly
5. Verification mode remains green for affected lifecycle sequences

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — Extend matcher/classification coverage for generic `forEach`, `reduce`, and `removeByPriority`
2. `packages/engine/test/unit/kernel/effect-compiler-codegen.test.ts` — Add direct compiled-vs-interpreted parity tests for `forEach`, `reduce`, and `removeByPriority`, including control-flow trace checks
3. `packages/engine/test/unit/kernel/effect-compiler.test.ts` — Add coverage-ratio and orchestrator parity tests for sequences built from these newly compiled control-flow effects

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo typecheck`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-25
- What actually changed:
  - generalized the compiled `forEach` path so the compiler now handles the same generic `OptionsQuery` surface as the interpreter instead of keeping a players-only compiler split
  - added direct compiled closures for `reduce` and `removeByPriority`
  - updated compiler coverage/node counting to include nested `reduce.in` and `removeByPriority.in` bodies
  - added and updated compiler matcher, codegen, and orchestrator tests for the new compiled control-flow effects
- Deviations from original plan:
  - the ticket was corrected before implementation to match the real runtime contracts: `reduce` and `removeByPriority` do not currently rebase iteration scope, and `removeByPriority` does not emit its own structured trace entry
  - instead of adding a second compiler helper such as `compileForEachGeneral(...)`, the implementation collapsed the compiler-only split into one generic `forEach` compiler path
- Verification results:
  - targeted compiler tests passed: `effect-compiler-patterns`, `effect-compiler-codegen`, `effect-compiler`
  - passed `pnpm -F @ludoforge/engine test`
  - passed `pnpm turbo test`
  - passed `pnpm turbo typecheck`
  - passed `pnpm turbo lint`
