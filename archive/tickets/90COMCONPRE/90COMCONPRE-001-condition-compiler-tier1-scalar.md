# 90COMCONPRE-001: Condition compiler — type definitions + Tier 1 scalar comparisons

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: Spec 76 (ValueExpr type-tag discriminants, completed), Spec 82 (Effect AST type tags, completed)

## Problem

Pipeline legality conditions are evaluated through the full `evalCondition -> evalValue -> resolveRef` AST interpreter chain, costing ~24s per benchmark (~20% of total runtime). The interpreter is at its V8 JIT ceiling — micro-optimization causes deoptimization. A condition compiler that produces direct JavaScript closures bypasses the interpreter entirely.

This ticket creates the `CompiledConditionPredicate` type and implements Tier 1 (scalar comparisons) — the highest-frequency pattern covering gvar, pvar, and binding comparisons.

## Assumption Reassessment (2026-03-28)

1. `ConditionAST` in `types-ast.ts` supports boolean literals plus scalar comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) over `ValueExpr` operands. Tier 1 can target those shapes without changing the AST model.
2. `ValueExpr` uses `_t` tag discriminants (1=SCALAR_ARRAY, 2=REF, 3=CONCAT, 4=IF, 5=AGGREGATE, 6=OP), aligning with Spec 76 and making tag-based pattern matching stable.
3. `Reference` includes `ref: 'gvar'`, `ref: 'pvar'`, and `ref: 'binding'`, but `gvar`/`pvar` variable names are `ScopedVarNameExpr`, not always raw strings. Static compilation in this ticket must only accept `tryStaticScopedVarNameExpr(...) !== null`; dynamic var-name refs remain interpreter-only.
4. The existing compiled-effect stack (`effect-compiler-types.ts`, `effect-compiler-codegen.ts`) is execution-context oriented and mutation-capable. It is not the right abstraction for read-only predicate compilation. Reusing it here would couple a pure predicate fast-path to the effect compiler for no architectural gain.
5. Pipeline/stage predicate evaluation currently flows through `pipeline-viability-policy.ts` into `action-pipeline-predicates.ts` and then `evalCondition`. No compiled-condition cache or predicate fast-path exists yet in the current codebase.
6. Kernel unit tests for modules in this area live under `packages/engine/test/unit/kernel/`, and engine test scripts run through the built `dist/` tree. The ticket’s original targeted test command did not match the repo’s actual Node test workflow.

## Architecture Check

1. **Why this approach is cleaner**: Pattern-matching compiler produces closures at GameDef-load time. Each pattern match is an explicit, testable function. Non-matching patterns cleanly return `null` (not compilable) — no error, no fallback complexity.
2. **Agnosticism preserved**: The compiler works on generic `ConditionAST` shapes — no game-specific logic. Any game's pipeline conditions that match recognized patterns will be compiled.
3. **No backwards-compatibility shims**: The compiler is a new module. It does not modify `evalCondition`, `evalValue`, or `resolveRef`. Integration (later ticket) adds a fast-path before the interpreter. Uncompilable shapes continue to use the single canonical interpreter path, which is an optimization boundary rather than an alias layer.
4. **Architectural judgment**: This ticket is worthwhile as groundwork only if it stays sharply scoped to a generic predicate compiler plus proof tests. Tier 1 by itself does not justify invasive pipeline rewiring or speculative caching. The long-term value is the clean compiler boundary, not partial performance claims from this ticket alone.

## What to Change

### 1. Create `CompiledConditionPredicate` type

Define the compiled predicate signature that closes over static context (def, adjacencyGraph, runtimeTableIndex) and accepts dynamic context (state, activePlayer, bindings):

```typescript
export type CompiledConditionPredicate = (
  state: GameState,
  activePlayer: PlayerId,
  bindings: Readonly<Record<string, unknown>>,
) => boolean;
```

### 2. Create `tryCompileValueExpr` for Tier 1 value accessors

Implement pattern matching for simple value expressions:
- **Literal** (number, boolean, string): return `() => value`
- **gvar ref** (`_t: 2, ref: 'gvar'`, static string var name): return accessor that preserves `resolveRef` missing-var semantics for the resolved name
- **pvar ref** (`_t: 2, ref: 'pvar'`, player: `'active'`, static string var name): return accessor that preserves `resolveRef` missing-player / missing-var semantics for the resolved player + name
- **binding ref** (`_t: 2, ref: 'binding'`): return accessor that throws missing-binding error when binding is absent (matching `resolveRef` behavior)
- All other ValueExpr shapes, including dynamic `ScopedVarNameExpr`, non-`active` player selectors, aggregate/concat/if/op expressions: return `null` (not compilable in Tier 1)

### 3. Create `tryCompileCondition` for Tier 1 comparison operators

For comparison ops (`==`, `!=`, `<`, `<=`, `>`, `>=`):
- Call `tryCompileValueExpr` on both `left` and `right`
- If both succeed, combine into a comparison closure
- If either fails, return `null`

Also handle the trivial case: if `cond` is a boolean literal, return `() => cond`.

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add exports)
- `packages/engine/test/unit/kernel/condition-compiler.test.ts` (new)

## Out of Scope

- Tier 2 (aggregate count checks) — ticket 002
- Tier 3 (boolean combinations: and/or/not) — ticket 002
- WeakMap cache infrastructure — ticket 003
- Integration into pipeline-viability-policy.ts — ticket 004
- Equivalence tests against full FITL game — ticket 005
- Boolean literal fast-path inside pipeline/stage evaluation — deferred until the integration ticket so the runtime fast-path remains centralized in one change
- Compiling `applicability` conditions (different code path, per spec scoping note)
- Modifying `evalCondition`, `evalValue`, `resolveRef`, or any existing kernel function
- Adding fields to `GameDefRuntime`, `EffectCursor`, `ReadContext`, or `Move`

## Acceptance Criteria

### Tests That Must Pass

1. `tryCompileCondition` returns a closure for `{ op: '==', left: { _t: 2, ref: 'gvar', var: 'monsoon' }, right: true }` that evaluates `state.globalVars.monsoon === true`
2. `tryCompileCondition` returns a closure for `{ op: '>=', left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' }, right: 3 }` that evaluates `state.perPlayerVars[player].resources >= 3`
3. `tryCompileCondition` returns a closure for binding ref comparisons that throws missing-binding error when binding is absent
4. `tryCompileCondition` returns a closure for binding ref comparisons that returns correct boolean when binding is present
5. `tryCompileCondition` returns `null` for unrecognized ValueExpr shapes (e.g., aggregate, concat, if, arithmetic op) and for dynamic var-name refs / non-`active` pvar selectors
6. `tryCompileCondition` returns `() => true` for boolean literal `true` and `() => false` for `false`
7. All six comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) produce correct closures
8. Compiled closures preserve interpreter-visible error contracts for supported refs (missing binding, missing gvar, missing per-player vars / missing pvar)
9. Existing suite: `pnpm turbo test`

### Invariants

1. `tryCompileCondition` is a pure function — no side effects, no mutation
2. Compiled closures produce identical boolean results and matching error behavior to `evalCondition` for the same inputs (for Tier 1 patterns)
3. No fields added to `GameDefRuntime` or any hot-path object
4. Missing-binding error thrown by compiled binding accessor is catchable by `shouldDeferMissingBinding`
5. Tier 1 introduces a reusable compiler boundary without yet changing runtime evaluation architecture

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-compiler.test.ts` — unit tests for `tryCompileCondition` and `tryCompileValueExpr`, including equivalence to `evalCondition` for supported Tier 1 patterns, matching error contracts, and explicit non-compilable fallthrough coverage

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js`
3. `pnpm turbo test`
4. `pnpm turbo typecheck`
5. `pnpm turbo lint`

## Outcome

- Completed: 2026-03-28
- What actually changed:
  - Added `packages/engine/src/kernel/condition-compiler.ts` with `CompiledConditionPredicate`, `tryCompileValueExpr`, and `tryCompileCondition`.
  - Implemented Tier 1 compilation for boolean literals, static `gvar`, active-player static `pvar`, and templated `binding` references.
  - Preserved interpreter-visible error behavior for supported refs, including missing binding / missing var / ordering type-mismatch cases.
  - Exported the compiler from `packages/engine/src/kernel/index.ts`.
  - Added focused kernel unit coverage in `packages/engine/test/unit/kernel/condition-compiler.test.ts`.
- Deviations from original plan:
  - Tightened the compilation boundary after reassessing the codebase: dynamic `ScopedVarNameExpr`, non-`active` `pvar` selectors, and non-ref Tier 1 `ValueExpr` forms remain interpreter-only.
  - Kept runtime integration, cache wiring, and boolean-literal pipeline fast-path out of this ticket so the compiler boundary stays isolated and reusable.
  - Corrected the ticket’s test location and targeted command to match the repo’s built-`dist` Node test workflow.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/kernel/condition-compiler.test.js`
  - `pnpm turbo test`
  - `pnpm turbo typecheck`
  - `pnpm turbo lint`
