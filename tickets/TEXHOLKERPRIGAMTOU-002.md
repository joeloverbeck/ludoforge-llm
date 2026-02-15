# TEXHOLKERPRIGAMTOU-002: `evaluateSubset` Effect — Types, Schemas, Runtime, Compilation & Unit Tests

**Status**: TODO
**Priority**: HIGH
**Effort**: Large
**Dependencies**: None (independent of TEXHOLKERPRIGAMTOU-001)
**Blocks**: TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## Summary

Add the `evaluateSubset` effect as a new kernel primitive. This is a generic "best K from N" evaluator that iterates all C(N,K) subsets of a token collection, scores each with a computation pipeline, and binds the best score/subset. Used for poker hand evaluation, tile scoring, set collection, etc.

## What to Change

### 1. Add `evaluateSubset` to `EffectAST` union

**File**: `src/kernel/types-ast.ts`

Add a new variant to the `EffectAST` union type:

```typescript
| {
    readonly evaluateSubset: {
      readonly source: OptionsQuery;
      readonly subsetSize: NumericValueExpr;
      readonly subsetBind: string;
      readonly compute: readonly EffectAST[];
      readonly scoreExpr: NumericValueExpr;
      readonly resultBind: string;
      readonly bestSubsetBind?: string;
      readonly in: readonly EffectAST[];
    };
  }
```

### 2. Add Zod schema for `evaluateSubset` effect

**File**: `src/kernel/schemas-ast.ts`

Add a new variant to `effectAstSchemaInternal`:

```typescript
z.object({
  evaluateSubset: z.object({
    source: OptionsQuerySchema,
    subsetSize: NumericValueExprSchema,
    subsetBind: StringSchema,
    compute: z.array(EffectASTSchema),
    scoreExpr: NumericValueExprSchema,
    resultBind: StringSchema,
    bestSubsetBind: StringSchema.optional(),
    in: z.array(EffectASTSchema),
  }).strict(),
}).strict(),
```

### 3. Register `evaluateSubset` in effect-kind-registry

**File**: `src/cnl/effect-kind-registry.ts`

Add `'evaluateSubset'` to the `SUPPORTED_EFFECT_KINDS` array.

### 4. Implement `evaluateSubset` effect application

**File**: New file `src/kernel/effects-subset.ts`

Implement `applyEvaluateSubset`:

1. Resolve `source` query to get N tokens (or values)
2. Evaluate `subsetSize` to get K
3. Validate: K <= N, K >= 0. If K > N, produce runtime warning and skip. If K == N, single subset = full collection.
4. Generate all C(N,K) subsets (combinatorial enumeration helper)
5. For each subset:
   a. Create child bindings with `subsetBind` → current subset tokens
   b. Execute `compute` effects in a sandboxed context (they create `let` bindings but don't modify game state — or if they do, track and revert per subset)
   c. Evaluate `scoreExpr` using the bindings produced by `compute`
   d. Track the highest score and its corresponding subset
6. After all subsets evaluated:
   a. Bind `resultBind` → best score
   b. Bind `bestSubsetBind` → winning subset tokens (if specified)
7. Execute `in` continuation effects with the bound values

**Helper**: Implement a `combinations(items, k)` generator function (pure, no side effects). Consider placing it in a utility file like `src/kernel/combinatorics.ts`.

**Important design decision**: The `compute` effects per subset should operate on a **read-only snapshot** of state — they produce bindings but should NOT permanently mutate GameState. Only the final `in` continuation effects apply to the real state.

### 5. Add dispatch routing

**File**: `src/kernel/effect-dispatch.ts`

- Add `if ('evaluateSubset' in effect) return 'evaluateSubset';` to `effectTypeOf`
- Add `if ('evaluateSubset' in effect) return applyEvaluateSubset(effect, ctx, budget, applyEffectsWithBudget);` to `dispatchEffect`
- Import `applyEvaluateSubset` from `effects-subset.ts`

### 6. Add YAML-to-AST lowering

**File**: `src/cnl/compile-effects.ts`

Add a handler in `lowerEffectNode` for `source.evaluateSubset`:
- Lower `source` via `lowerQueryNode`
- Lower `subsetSize` via `lowerNumericValueNode`
- Lower `compute` via recursive `lowerEffectArray`
- Lower `scoreExpr` via `lowerNumericValueNode`
- Lower `in` via recursive `lowerEffectArray`

### 7. Add validation

**File**: `src/kernel/validate-gamedef-behavior.ts`

Add a case for `'evaluateSubset' in effect` that validates:
- `source` query references valid zones/tokens
- `compute` effects are valid (recursive validation)
- `scoreExpr` references are valid
- `in` effects are valid (recursive validation)

### 8. Write unit tests

**File**: `test/unit/kernel/evaluate-subset.test.ts` (new)

Tests:
1. Correct C(N,K) enumeration: C(5,3)=10 subsets, C(7,5)=21 subsets, C(4,2)=6 subsets
2. Simple scoring: find max sum-of-values across subsets
3. `bestSubsetBind` contains the winning tokens
4. `compute` effects create intermediate bindings usable in `scoreExpr`
5. Ties: first-encountered subset wins (deterministic, since subset enumeration order is fixed)
6. Edge case: K=N returns the full set (single subset)
7. Edge case: K=0 returns empty subset
8. Edge case: K>N produces runtime warning and skips evaluation

## Files to Touch

| File | Change Type |
|------|-------------|
| `src/kernel/types-ast.ts` | Modify — add `evaluateSubset` to `EffectAST` union |
| `src/kernel/schemas-ast.ts` | Modify — add evaluateSubset Zod schema to effect union |
| `src/cnl/effect-kind-registry.ts` | Modify — add `'evaluateSubset'` to registry |
| `src/kernel/effects-subset.ts` | Create — implement `applyEvaluateSubset` |
| `src/kernel/combinatorics.ts` | Create — `combinations(items, k)` generator utility |
| `src/kernel/effect-dispatch.ts` | Modify — add evaluateSubset dispatch routing |
| `src/cnl/compile-effects.ts` | Modify — add evaluateSubset YAML lowering |
| `src/kernel/validate-gamedef-behavior.ts` | Modify — add evaluateSubset validation |
| `test/unit/kernel/evaluate-subset.test.ts` | Create — unit tests |

## Out of Scope

- **DO NOT** modify any `data/games/` files
- **DO NOT** implement `reveal` or `commitResource` (separate tickets)
- **DO NOT** change existing effect behavior
- **DO NOT** modify agent code, simulator code, or FITL game spec files
- **DO NOT** implement poker-specific hand-rank-score logic (that lives in GameSpecDoc macros, a later ticket)
- **DO NOT** add Texas Hold 'Em GameSpecDoc files

## Acceptance Criteria

### Tests That Must Pass

1. **New**: `test/unit/kernel/evaluate-subset.test.ts` — all 8 tests above pass
2. **Regression**: `npm test` — all existing tests continue to pass
3. **Build**: `npm run build` succeeds with no type errors
4. **Lint**: `npm run lint` passes
5. **Typecheck**: `npm run typecheck` passes

### Invariants That Must Remain True

1. `EffectAST` exhaustive check in `effectTypeOf()` compiles — no `never` gaps
2. `SUPPORTED_EFFECT_KINDS` includes `'evaluateSubset'`
3. GameState immutability — `applyEvaluateSubset` returns new state, never mutates
4. `compute` effects per subset do NOT permanently alter GameState — only `in` effects do
5. Subset enumeration is deterministic: same input → same enumeration order → same tiebreaking
6. `combinations(items, k)` is a pure function with no side effects
7. C(N,K) budget: for K > 20 or C(N,K) > 10000, the kernel should warn (configurable threshold)
8. Existing FITL tests pass unchanged
9. Zod schema round-trips for valid `evaluateSubset` EffectAST objects
