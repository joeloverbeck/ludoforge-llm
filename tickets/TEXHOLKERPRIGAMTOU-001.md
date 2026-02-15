# TEXHOLKERPRIGAMTOU-001: `reveal` Effect — Types, Schemas, Runtime, Compilation & Unit Tests

**Status**: TODO
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: None (first ticket in the chain)
**Blocks**: TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009

## Summary

Add the `reveal` effect as a new kernel primitive. This is a generic hidden-information primitive that discloses zone/token information to specified observers. Used for poker showdowns, FITL underground guerrillas, fog-of-war, etc.

## What to Change

### 1. Add `reveal` to `EffectAST` union

**File**: `src/kernel/types-ast.ts`

Add a new variant to the `EffectAST` union type:

```typescript
| {
    readonly reveal: {
      readonly zone: ZoneRef;
      readonly to: 'all' | PlayerSel;
      readonly filter?: readonly TokenFilterPredicate[];
    };
  }
```

### 2. Add `reveals` field to `GameState`

**File**: `src/kernel/types-core.ts`

Add an optional `reveals` field to the `GameState` interface:

```typescript
readonly reveals?: Readonly<Record<string, readonly PlayerId[]>>;
```

Key format: zoneId → list of players who can see it beyond normal visibility.

### 3. Add Zod schema for `reveal` effect

**File**: `src/kernel/schemas-ast.ts`

Add a new variant to `effectAstSchemaInternal` (the `z.union([...])` array):

```typescript
z.object({
  reveal: z.object({
    zone: ZoneRefSchema,
    to: z.union([z.literal('all'), PlayerSelSchema]),
    filter: z.array(TokenFilterPredicateSchema).optional(),
  }).strict(),
}).strict(),
```

### 4. Add `reveals` to `GameState` Zod schema

**File**: `src/kernel/schemas-core.ts`

Add `reveals` as an optional field in the `GameStateSchema`:

```typescript
reveals: z.record(StringSchema, z.array(IntegerSchema)).optional(),
```

### 5. Register `reveal` in effect-kind-registry

**File**: `src/cnl/effect-kind-registry.ts`

Add `'reveal'` to the `SUPPORTED_EFFECT_KINDS` array.

### 6. Implement `reveal` effect application

**File**: `src/kernel/effects-token.ts` (or new file `src/kernel/effects-reveal.ts` if effects-token.ts is already large)

Implement `applyReveal`:
- Resolve zone from `ZoneRef`
- If `to: 'all'`, set reveals[zoneId] to a sentinel (empty array or all player IDs)
- If `to: PlayerSel`, resolve the player(s) and add to reveals[zoneId]
- If `filter` is provided, apply token filter predicates (note: the reveals map tracks zone-level visibility; per-token filtering is advisory metadata)
- Accumulate reveals — multiple reveals should union observers, not overwrite

### 7. Add dispatch routing

**File**: `src/kernel/effect-dispatch.ts`

- Add `if ('reveal' in effect) return 'reveal';` to `effectTypeOf`
- Add `if ('reveal' in effect) return applyReveal(effect, ctx);` to `dispatchEffect`
- Import `applyReveal` from wherever it's implemented

### 8. Add YAML-to-AST lowering

**File**: `src/cnl/compile-effects.ts`

Add a handler in `lowerEffectNode` for `source.reveal`:
- Lower `zone` via `canonicalizeZoneSelector`
- Lower `to` (handle 'all' literal vs PlayerSel)
- Lower `filter` array if present via `TokenFilterPredicate` lowering

### 9. Add validation for reveal references

**File**: `src/kernel/validate-gamedef-behavior.ts`

Add a case for `'reveal' in effect` that validates:
- `zone` references a declared zone
- `to` (if PlayerSel) references valid player selectors

### 10. Add Zobrist hashing for reveals (if needed)

**File**: `src/kernel/zobrist.ts`

Consider whether `reveals` state needs to contribute to `stateHash`. If reveals are informational-only (don't affect game logic), they may be excluded. If they gate legal move enumeration, they must be included.

### 11. Write unit tests

**File**: `test/unit/kernel/reveal.test.ts` (new)

Tests:
1. `reveal` changes `GameState.reveals` correctly — zone gains observer
2. `reveal` with filter only reveals matching tokens (filter stored/applied correctly)
3. `reveal` to `'all'` marks zone as publicly visible
4. `reveal` to specific player adds to observer set
5. Multiple reveals accumulate (second reveal adds to existing observer list, doesn't overwrite)
6. Reveal of unknown zone produces a runtime warning (not a crash)

## Files to Touch

| File | Change Type |
|------|-------------|
| `src/kernel/types-ast.ts` | Modify — add `reveal` to `EffectAST` union |
| `src/kernel/types-core.ts` | Modify — add `reveals` to `GameState` |
| `src/kernel/schemas-ast.ts` | Modify — add reveal Zod schema to effect union |
| `src/kernel/schemas-core.ts` | Modify — add reveals to GameState schema |
| `src/cnl/effect-kind-registry.ts` | Modify — add `'reveal'` to registry |
| `src/kernel/effect-dispatch.ts` | Modify — add reveal dispatch routing |
| `src/kernel/effects-token.ts` (or new `effects-reveal.ts`) | Modify/Create — implement `applyReveal` |
| `src/cnl/compile-effects.ts` | Modify — add reveal YAML lowering |
| `src/kernel/validate-gamedef-behavior.ts` | Modify — add reveal validation |
| `src/kernel/zobrist.ts` | Modify — add reveals hashing if needed |
| `test/unit/kernel/reveal.test.ts` | Create — unit tests |

## Out of Scope

- **DO NOT** modify any `data/games/` files (those are later tickets)
- **DO NOT** modify `evaluateSubset` or `commitResource` (those are separate tickets)
- **DO NOT** change existing effect behavior (setVar, moveToken, forEach, etc.)
- **DO NOT** modify agent code (`src/agents/`)
- **DO NOT** modify simulator code (`src/sim/`)
- **DO NOT** modify any FITL game spec files
- **DO NOT** add Texas Hold 'Em GameSpecDoc files

## Acceptance Criteria

### Tests That Must Pass

1. **New**: `test/unit/kernel/reveal.test.ts` — all 6 tests above pass
2. **Regression**: `npm test` — all existing tests continue to pass (no breakage)
3. **Build**: `npm run build` succeeds with no type errors
4. **Lint**: `npm run lint` passes
5. **Typecheck**: `npm run typecheck` passes

### Invariants That Must Remain True

1. The `EffectAST` type remains a discriminated union — `effectTypeOf()` exhaustive check in `effect-dispatch.ts` must compile without `never` gaps
2. The `SUPPORTED_EFFECT_KINDS` array in `effect-kind-registry.ts` includes `'reveal'` and remains sorted/consistent with actual implementations
3. GameState immutability — `applyReveal` must return a new state object, never mutate
4. Existing FITL tests pass unchanged — no regression
5. Zod schema round-trips: a valid `reveal` EffectAST object passes `EffectASTSchema.parse()` and `effectAstSchemaInternal.parse()`
6. `reveals` field is optional on GameState — existing states without it remain valid
