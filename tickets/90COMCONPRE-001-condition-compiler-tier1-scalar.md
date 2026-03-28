# 90COMCONPRE-001: Condition compiler — type definitions + Tier 1 scalar comparisons

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: Spec 76 (ValueExpr type-tag discriminants, completed), Spec 82 (Effect AST type tags, completed)

## Problem

Pipeline legality conditions are evaluated through the full `evalCondition -> evalValue -> resolveRef` AST interpreter chain, costing ~24s per benchmark (~20% of total runtime). The interpreter is at its V8 JIT ceiling — micro-optimization causes deoptimization. A condition compiler that produces direct JavaScript closures bypasses the interpreter entirely.

This ticket creates the `CompiledConditionPredicate` type and implements Tier 1 (scalar comparisons) — the highest-frequency pattern covering gvar, pvar, and binding comparisons.

## Assumption Reassessment (2026-03-28)

1. `ConditionAST` union type in `types-ast.ts` supports boolean literals and comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) with `ValueExpr` operands — confirmed by codebase exploration.
2. `ValueExpr` uses `_t` tag discriminants (1=SCALAR_ARRAY, 2=REF, 3=CONCAT, 4=IF, 5=AGGREGATE, 6=OP) — confirmed, aligns with Spec 76.
3. `Reference` type includes `ref: 'gvar'`, `ref: 'pvar'`, `ref: 'binding'` variants — confirmed in `types-ast.ts`.
4. The existing effect compiler in `effect-compiler-codegen.ts` has a separate `CompiledConditionEvaluator` type with different signature (`CompiledExecutionContext` parameter). Spec 90's `CompiledConditionPredicate` is intentionally distinct (takes `activePlayer` instead of execution context) — no reuse conflict.
5. `ScopedVarNameExpr` is used for `var` field in gvar/pvar references — must check whether it's always a plain string or can be dynamic. If dynamic, those cases fall through as non-compilable.

## Architecture Check

1. **Why this approach is cleaner**: Pattern-matching compiler produces closures at GameDef-load time. Each pattern match is an explicit, testable function. Non-matching patterns cleanly return `null` (not compilable) — no error, no fallback complexity.
2. **Agnosticism preserved**: The compiler works on generic `ConditionAST` shapes — no game-specific logic. Any game's pipeline conditions that match recognized patterns will be compiled.
3. **No backwards-compatibility shims**: The compiler is a new module. It does not modify `evalCondition`, `evalValue`, or `resolveRef`. Integration (ticket 004) adds a fast-path before the interpreter — not a replacement.

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
- **gvar ref** (`_t: 2, ref: 'gvar'`, plain string var name): return `(state) => state.globalVars[name]`
- **pvar ref** (`_t: 2, ref: 'pvar'`, player: `'active'`, plain string var name): return `(state, player) => state.perPlayerVars[player][name]`
- **binding ref** (`_t: 2, ref: 'binding'`): return accessor that throws missing-binding error when binding is absent (matching `resolveRef` behavior)
- All other ValueExpr shapes: return `null` (not compilable)

### 3. Create `tryCompileCondition` for Tier 1 comparison operators

For comparison ops (`==`, `!=`, `<`, `<=`, `>`, `>=`):
- Call `tryCompileValueExpr` on both `left` and `right`
- If both succeed, combine into a comparison closure
- If either fails, return `null`

Also handle the trivial case: if `cond` is a boolean literal, return `() => cond`.

## Files to Touch

- `packages/engine/src/kernel/condition-compiler.ts` (new)
- `packages/engine/src/kernel/index.ts` (modify — add exports)
- `packages/engine/test/unit/condition-compiler.test.ts` (new)

## Out of Scope

- Tier 2 (aggregate count checks) — ticket 002
- Tier 3 (boolean combinations: and/or/not) — ticket 002
- WeakMap cache infrastructure — ticket 003
- Integration into pipeline-viability-policy.ts — ticket 004
- Equivalence tests against full FITL game — ticket 005
- Compiling `applicability` conditions (different code path, per spec scoping note)
- Modifying `evalCondition`, `evalValue`, `resolveRef`, or any existing kernel function
- Adding fields to `GameDefRuntime`, `EffectCursor`, `ReadContext`, or `Move`

## Acceptance Criteria

### Tests That Must Pass

1. `tryCompileCondition` returns a closure for `{ op: '==', left: { _t: 2, ref: 'gvar', var: 'monsoon' }, right: true }` that evaluates `state.globalVars.monsoon === true`
2. `tryCompileCondition` returns a closure for `{ op: '>=', left: { _t: 2, ref: 'pvar', player: 'active', var: 'resources' }, right: 3 }` that evaluates `state.perPlayerVars[player].resources >= 3`
3. `tryCompileCondition` returns a closure for binding ref comparisons that throws missing-binding error when binding is absent
4. `tryCompileCondition` returns a closure for binding ref comparisons that returns correct boolean when binding is present
5. `tryCompileCondition` returns `null` for unrecognized ValueExpr shapes (e.g., aggregate, concat, if)
6. `tryCompileCondition` returns `() => true` for boolean literal `true` and `() => false` for `false`
7. All six comparison operators (`==`, `!=`, `<`, `<=`, `>`, `>=`) produce correct closures
8. Existing suite: `pnpm turbo test`

### Invariants

1. `tryCompileCondition` is a pure function — no side effects, no mutation
2. Compiled closures produce identical boolean results to `evalCondition` for the same inputs (for Tier 1 patterns)
3. No fields added to `GameDefRuntime` or any hot-path object
4. Missing-binding error thrown by compiled binding accessor is catchable by `shouldDeferMissingBinding`

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/condition-compiler.test.ts` — unit tests for `tryCompileCondition` and `tryCompileValueExpr` covering all Tier 1 patterns, edge cases (missing bindings, unknown refs), and non-compilable fallback

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "condition-compiler"`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`
