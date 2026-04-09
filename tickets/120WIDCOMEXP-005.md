# 120WIDCOMEXP-005: Unified per-expression compilation cache

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel/`
**Deps**: None

## Problem

Compiled condition predicates are currently cached only for pipeline legality/cost conditions via `compiled-condition-cache.ts`, which uses a WeakMap keyed on `ActionPipelineDef[]` and returns a `Map` of all pipeline predicates. This cache design cannot serve action `pre` conditions, trigger conditions, or terminal conditions — these are standalone `ConditionAST` nodes not part of pipeline arrays. A per-expression cache is needed so that any condition evaluation site can look up a compiled predicate by its AST node reference.

## Assumption Reassessment (2026-04-09)

1. `compiled-condition-cache.ts` exists at `packages/engine/src/kernel/compiled-condition-cache.ts` — confirmed. Uses `WeakMap<readonly ActionPipelineDef[], CompiledPipelinePredicateCache>` (line 10).
2. `compiled-token-filter-cache.ts` exists as a parallel cache using `WeakMap<TokenFilterExpr, CompiledTokenFilterFn | null>` — confirmed. This is the per-expression pattern to follow.
3. `getCompiledPipelinePredicates` is consumed only by `pipeline-viability-policy.ts` — confirmed. The existing pipeline cache continues to serve pipeline sites; the new cache serves all other sites.
4. `CompiledConditionPredicate` type is already defined: `(state, activePlayer, bindings, snapshot?) => boolean` — confirmed.
5. `tryCompileCondition` is the compilation entry point — returns `CompiledConditionPredicate | null`.

## Architecture Check

1. Follows the proven `compiled-token-filter-cache.ts` pattern: a module-level `WeakMap<ConditionAST, CompiledConditionPredicate | null>` with a `getCompiledCondition(expr)` accessor that lazily compiles on first access.
2. WeakMap keyed on AST node references (object identity). This works because `GameDef` AST nodes are allocated once and reused across all evaluations of the same game. No game-specific logic.
3. `null` sentinel in the WeakMap distinguishes "attempted and non-compilable" from "not yet attempted" (`undefined` / missing key). This avoids re-attempting compilation on every call.
4. Does not replace `compiled-condition-cache.ts` — the pipeline cache has a different keying strategy (by pipeline array) and serves a different consumer (`pipeline-viability-policy.ts`). Both caches coexist. Foundation 14 does not apply here — the pipeline cache is not deprecated, it serves a legitimately different access pattern.

## What to Change

### 1. Create per-expression condition cache

Create `packages/engine/src/kernel/compiled-condition-expr-cache.ts` (or a suitable name) containing:

- A module-level `WeakMap<ConditionAST, CompiledConditionPredicate | null>`
- An exported `getCompiledCondition(cond: ConditionAST): CompiledConditionPredicate | null` function that:
  - Returns the cached value if the key exists (including `null` for non-compilable)
  - Otherwise calls `tryCompileCondition(cond)`, stores the result, and returns it
- No eager compilation pass — lazy population only

### 2. Create per-expression value expr cache (optional)

If profiling in ticket 007 shows `tryCompileValueExpr` is called repeatedly for the same AST node (e.g., shared sub-expressions), add a parallel `WeakMap<ValueExpr, CompiledConditionValueAccessor | null>` cache. Otherwise defer — the condition-level cache already memoizes the full condition tree.

Evaluate during implementation whether this is needed. If not, note the decision and skip.

### 3. Export from kernel index

Add the new cache accessor to `packages/engine/src/kernel/index.ts` exports so application site tickets (006) can import it.

### 4. Tests

- Test that `getCompiledCondition` returns a compiled predicate for a compilable condition
- Test that `getCompiledCondition` returns `null` for a non-compilable condition
- Test that repeated calls return the same cached result (referential equality)
- Test that the `null` sentinel prevents re-compilation attempts

## Files to Touch

- `packages/engine/src/kernel/compiled-condition-expr-cache.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add export)
- `packages/engine/test/kernel/compiled-condition-expr-cache.test.ts` (new)

## Out of Scope

- Replacing `compiled-condition-cache.ts` — pipeline cache remains for its current consumers
- Application site integration (ticket 006)
- Value expression compiler widening (tickets 001, 002)

## Acceptance Criteria

### Tests That Must Pass

1. `getCompiledCondition` returns a compiled predicate for a simple `==` condition
2. `getCompiledCondition` returns `null` for a non-compilable `adjacent` condition
3. Repeated calls for the same AST node return the same function reference (cache hit)
4. After a `null` result, subsequent calls return `null` without re-invoking `tryCompileCondition`
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Cache uses WeakMap — no memory leaks when GameDef is garbage collected
2. Cache never stores a stale result — AST nodes are immutable (Foundation 11)
3. Cache does not affect correctness — compiled predicates are pure functions identical to interpreter results

## Test Plan

### New/Modified Tests

1. `packages/engine/test/kernel/compiled-condition-expr-cache.test.ts` — cache behavior tests (hit, miss, null sentinel, referential equality)

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern="compiled-condition-expr-cache"`
2. `pnpm turbo test`
