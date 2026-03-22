# 74COMEFFSEQ-002: Effect Compiler Pattern Matchers

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — new kernel module
**Deps**: 74COMEFFSEQ-001

## Problem

The compiler needs to determine which AST nodes can be compiled to direct JS and which must fall back to the interpreter. Pattern matchers examine an `EffectAST` node and return a structured descriptor if the node matches a compilable pattern, or `null` if it must be interpreted.

## Assumption Reassessment (2026-03-21)

1. `EffectAST` is a discriminated union keyed by `kind` field, defined in `packages/engine/src/kernel/types-ast.ts`. Confirmed.
2. Effect kinds include: setVar, addVar, if, forEach, gotoPhaseExact, and all others listed in effect-registry.ts. Confirmed.
3. `ValueExpr` can be a literal, a ref (gvar/pvar/binding), or a complex expression. Must verify exact shapes in types-ast.ts.
4. Condition AST uses `ConditionAST` with operators like eq, neq, lt, gt, and/or. Confirmed.

## Architecture Check

1. Pattern matchers are pure functions: `(node: EffectAST) => PatternDescriptor | null`. No side effects, no state.
2. Game-agnostic: patterns match AST structure, not game-specific identifiers (Foundation 1).
3. Composable: each pattern matcher is independent, making it easy to add new patterns in Phase 2.

## What to Change

### 1. Create `effect-compiler-patterns.ts`

Define pattern descriptors and matchers for Phase 1 compilable patterns:

**Pattern descriptor types:**
```typescript
export type PatternDescriptor =
  | SetVarGlobalLiteralPattern
  | SetVarGlobalRefPattern
  | SetVarPvarPattern
  | AddVarPattern
  | IfSimplePattern
  | IfLogicalPattern
  | ForEachPlayersPattern
  | GotoPhaseExactPattern
  | LiteralValuePattern
  | RefValuePattern;
```

**Matcher functions:**
- `matchSetVarGlobalLiteral(node: EffectAST)` — matches `setVar` with global scope and literal value
- `matchSetVarGlobalRef(node: EffectAST)` — matches `setVar` with global scope and ref value
- `matchSetVarPvar(node: EffectAST)` — matches `setVar` with player-variable scope
- `matchAddVar(node: EffectAST)` — matches `addVar` (global or pvar) with literal/ref operand
- `matchIfSimple(node: EffectAST)` — matches `if` with a simple comparison condition (eq/neq/lt/gt/lte/gte) where both sides are literals or refs
- `matchIfLogical(node: EffectAST)` — matches `if` with and/or condition where all sub-conditions are simple comparisons
- `matchForEachPlayers(node: EffectAST)` — matches `forEach` over `{ query: "players" }`
- `matchGotoPhaseExact(node: EffectAST)` — matches `gotoPhaseExact` with literal phase name
- `matchLiteralValue(expr: ValueExpr)` — matches literal number/string/boolean values
- `matchRefValue(expr: ValueExpr)` — matches `ref: gvar`, `ref: pvar`, `ref: binding`

**Top-level orchestrator:**
- `classifyEffect(node: EffectAST): PatternDescriptor | null` — tries each matcher in order, returns first match or null

**Coverage calculator:**
- `computeCoverageRatio(effects: readonly EffectAST[]): number` — recursively walks the AST, counts compilable vs total nodes

### 2. Value expression classification helpers

- `isLiteralValueExpr(expr: ValueExpr): boolean`
- `isSimpleRefExpr(expr: ValueExpr): boolean`
- `isCompilableCondition(cond: ConditionAST): boolean`

## Files to Touch

- `packages/engine/src/kernel/effect-compiler-patterns.ts` (new)

## Out of Scope

- Code generation (74COMEFFSEQ-003) — patterns only classify, they don't emit JS
- Phase 2 patterns (forEach over nextInOrderByCondition, aggregate, moveAll, let bindings) — these are future work
- Modifying any existing effect handler
- Modifying the effect registry
- Compiler orchestration (74COMEFFSEQ-004)

## Acceptance Criteria

### Tests That Must Pass

1. `matchSetVarGlobalLiteral` returns a descriptor for `{ kind: 'setVar', scope: 'global', name: 'pot', value: { literal: 0 } }` and null for non-matching nodes.
2. `matchIfSimple` returns a descriptor for `if` with `{ condition: { op: 'eq', left: { ref: 'gvar', name: 'x' }, right: { literal: 5 } } }` and null for complex conditions.
3. `matchForEachPlayers` returns a descriptor for `forEach` with `{ query: 'players' }` and null for other forEach targets.
4. `classifyEffect` returns the correct descriptor type for each Phase 1 pattern.
5. `classifyEffect` returns null for non-compilable effects (e.g., `chooseOne`, `moveToken`, `rollRandom`).
6. `computeCoverageRatio` returns 1.0 for a fully-compilable sequence and a fraction for mixed sequences.
7. `computeCoverageRatio` correctly counts nested nodes inside `if`/`forEach` bodies.
8. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Pattern matchers are pure functions — no side effects, no mutation.
2. A `null` return from `classifyEffect` means "fall back to interpreter" — it must never crash or throw for valid AST nodes.
3. Matchers must handle all fields of the relevant EffectAST variant, not just the discriminant.
4. Coverage ratio is always in [0.0, 1.0].

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts` — unit tests for each matcher function with positive and negative cases, edge cases (empty effects array, deeply nested if/forEach).

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/kernel/effect-compiler-patterns.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
