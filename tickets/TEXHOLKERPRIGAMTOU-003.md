# TEXHOLKERPRIGAMTOU-003: `commitResource` Effect — Types, Schemas, Runtime, Compilation & Unit Tests

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: None (independent of TEXHOLKERPRIGAMTOU-001, -002)
**Blocks**: TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## Summary

Add the `commitResource` effect as a new kernel primitive. This is a generic resource-transfer primitive with built-in validation and all-in clamping. Used for betting, auctions, bidding, wagering — any game with resource commitment mechanics.

## What to Change

### 1. Add `commitResource` to `EffectAST` union

**File**: `src/kernel/types-ast.ts`

Add a new variant to the `EffectAST` union type:

```typescript
| {
    readonly commitResource: {
      readonly from: { readonly scope: 'pvar'; readonly player: PlayerSel; readonly var: string };
      readonly to: { readonly scope: 'global' | 'pvar'; readonly var: string; readonly player?: PlayerSel };
      readonly amount: NumericValueExpr;
      readonly min?: NumericValueExpr;
      readonly max?: NumericValueExpr;
      readonly actualBind?: string;
    };
  }
```

### 2. Add Zod schema for `commitResource` effect

**File**: `src/kernel/schemas-ast.ts`

Add a new variant to `effectAstSchemaInternal`:

```typescript
z.object({
  commitResource: z.object({
    from: z.object({
      scope: z.literal('pvar'),
      player: PlayerSelSchema,
      var: StringSchema,
    }).strict(),
    to: z.object({
      scope: z.union([z.literal('global'), z.literal('pvar')]),
      var: StringSchema,
      player: PlayerSelSchema.optional(),
    }).strict(),
    amount: NumericValueExprSchema,
    min: NumericValueExprSchema.optional(),
    max: NumericValueExprSchema.optional(),
    actualBind: StringSchema.optional(),
  }).strict(),
}).strict(),
```

### 3. Register `commitResource` in effect-kind-registry

**File**: `src/cnl/effect-kind-registry.ts`

Add `'commitResource'` to the `SUPPORTED_EFFECT_KINDS` array.

### 4. Implement `commitResource` effect application

**File**: New file `src/kernel/effects-resource.ts`

Implement `applyCommitResource`:

1. Resolve `from.player` to a concrete PlayerId
2. Read source balance: `state.perPlayerVars[playerId][from.var]`
3. Evaluate `amount` expression
4. Clamp to [0, sourceBalance]:
   - `actual = Math.min(amount, sourceBalance)`
   - `actual = Math.max(actual, 0)`
5. All-in semantics: if `min` is specified and `actual < min`, set `actual = sourceBalance` (transfer everything remaining)
6. Max capping: if `max` is specified and `actual > max`, set `actual = max`
7. Apply transfer:
   - Deduct `actual` from source: `perPlayerVars[playerId][from.var] -= actual`
   - Add `actual` to destination: if `to.scope === 'global'`, add to `globalVars[to.var]`; if `to.scope === 'pvar'`, add to `perPlayerVars[toPlayerId][to.var]`
8. Bind `actualBind` if specified: add to bindings map so downstream effects can read the actual transferred amount
9. Emit varChanged events for both source and destination

**Critical**: The transfer must be atomic — both deduction and addition happen in the same state transition. Never leave state in a half-transferred condition.

### 5. Add dispatch routing

**File**: `src/kernel/effect-dispatch.ts`

- Add `if ('commitResource' in effect) return 'commitResource';` to `effectTypeOf`
- Add `if ('commitResource' in effect) return applyCommitResource(effect, ctx);` to `dispatchEffect`
- Import `applyCommitResource` from `effects-resource.ts`

### 6. Add YAML-to-AST lowering

**File**: `src/cnl/compile-effects.ts`

Add a handler in `lowerEffectNode` for `source.commitResource`:
- Lower `from.player` via `normalizePlayerSelector`
- Lower `to.player` via `normalizePlayerSelector` (if present)
- Lower `amount` via `lowerNumericValueNode`
- Lower `min`, `max` via `lowerNumericValueNode` (if present)

### 7. Add validation

**File**: `src/kernel/validate-gamedef-behavior.ts`

Add a case for `'commitResource' in effect` that validates:
- `from.var` is a declared per-player variable
- `to.var` is a declared global or per-player variable (depending on `to.scope`)
- `from.player` and `to.player` selectors are valid

### 8. Write unit tests

**File**: `test/unit/kernel/commit-resource.test.ts` (new)

Tests:
1. Exact transfer: `amount <= sourceBalance` → exact amount transferred
2. All-in clamping: `amount > sourceBalance` → transfers all remaining (sourceBalance)
3. All-in trigger: `sourceBalance < min` → transfers all remaining
4. Max capping: `amount > max` → capped at `max`
5. `actualBind` reflects the true transferred amount (not the requested amount)
6. Zero transfer: `amount = 0` → no-op, both variables unchanged
7. **Property test**: `source + destination total preserved` — sum before == sum after for every transfer
8. Transfer to global var: `to.scope === 'global'` works correctly
9. Transfer to another player's var: `to.scope === 'pvar'` with different player works correctly

## Files to Touch

| File | Change Type |
|------|-------------|
| `src/kernel/types-ast.ts` | Modify — add `commitResource` to `EffectAST` union |
| `src/kernel/schemas-ast.ts` | Modify — add commitResource Zod schema to effect union |
| `src/cnl/effect-kind-registry.ts` | Modify — add `'commitResource'` to registry |
| `src/kernel/effects-resource.ts` | Create — implement `applyCommitResource` |
| `src/kernel/effect-dispatch.ts` | Modify — add commitResource dispatch routing |
| `src/cnl/compile-effects.ts` | Modify — add commitResource YAML lowering |
| `src/kernel/validate-gamedef-behavior.ts` | Modify — add commitResource validation |
| `test/unit/kernel/commit-resource.test.ts` | Create — unit tests |

## Out of Scope

- **DO NOT** modify any `data/games/` files
- **DO NOT** implement `reveal` or `evaluateSubset` (separate tickets)
- **DO NOT** change existing effect behavior (setVar, addVar, etc.)
- **DO NOT** modify agent code, simulator code, or FITL game spec files
- **DO NOT** add Texas Hold 'Em GameSpecDoc files
- **DO NOT** implement side-pot logic (that's GameSpecDoc macro territory)

## Acceptance Criteria

### Tests That Must Pass

1. **New**: `test/unit/kernel/commit-resource.test.ts` — all 9 tests above pass
2. **Regression**: `npm test` — all existing tests continue to pass
3. **Build**: `npm run build` succeeds with no type errors
4. **Lint**: `npm run lint` passes
5. **Typecheck**: `npm run typecheck` passes

### Invariants That Must Remain True

1. `EffectAST` exhaustive check in `effectTypeOf()` compiles — no `never` gaps
2. `SUPPORTED_EFFECT_KINDS` includes `'commitResource'`
3. GameState immutability — `applyCommitResource` returns new state, never mutates
4. **Chip conservation**: `source.before + destination.before == source.after + destination.after` for every transfer — no resources created or destroyed
5. Source variable never goes below its `min` bound (0 for chip stacks)
6. Destination variable never exceeds its `max` bound
7. `actualBind` is always set to the real transferred amount, not the requested amount
8. Existing FITL tests pass unchanged
9. Zod schema round-trips for valid `commitResource` EffectAST objects
