# TEXHOLKERPRIGAMTOU-001: `reveal` Effect - Types, Schemas, Runtime, Compilation, Hashing, and Tests

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Dependencies**: None (first ticket in the chain)
**Blocks**: TEXHOLKERPRIGAMTOU-007, TEXHOLKERPRIGAMTOU-008, TEXHOLKERPRIGAMTOU-009
**Spec Reference**: `specs/33-texas-holdem-kernel-primitives-gamespecdoc-tournament.md` (Phase 1.1)

## Reassessed Assumptions (Corrected)

1. Effect dispatch is implemented in `src/kernel/effect-dispatch.ts` and exported via `src/kernel/effects.ts`; there is no `src/kernel/apply-effects.ts`.
2. Binder coverage is enforced by `src/cnl/binder-surface-registry.ts` + `test/unit/binder-surface-registry.test.ts`; adding a new effect requires registry updates.
3. Exhaustiveness and variant count are enforced by `test/unit/types-exhaustive.test.ts`; adding a new `EffectAST` variant requires updating this test.
4. AST/schema coverage is centralized in existing tests (for example `test/unit/schemas-ast.test.ts`), so this ticket should extend those tests in addition to adding runtime tests.
5. The previous assumption `GameState.reveals: Record<zoneId, PlayerId[]>` is too lossy for `reveal.filter`. To preserve semantics and future extensibility, reveals must store structured grants.

## Architecture Decision (Updated Scope)

`reveal` will be a generic kernel primitive with durable, explicit state:

- `GameState.reveals?: Readonly<Record<string, readonly RevealGrant[]>>`
- `RevealGrant` shape:
  - `observers: 'all' | readonly PlayerId[]`
  - `filter?: readonly TokenFilterPredicate[]`

Rationale:
- Preserves `filter` semantics instead of dropping them.
- Supports accumulation without overwriting prior reveal grants.
- Keeps engine generic and reusable across hidden-information games.

## What to Change

### 1. Add `reveal` to `EffectAST`

**File**: `src/kernel/types-ast.ts`

```ts
| {
    readonly reveal: {
      readonly zone: ZoneRef;
      readonly to: 'all' | PlayerSel;
      readonly filter?: readonly TokenFilterPredicate[];
    };
  }
```

### 2. Add structured reveal state types

**File**: `src/kernel/types-core.ts`

Add:

```ts
export interface RevealGrant {
  readonly observers: 'all' | readonly PlayerId[];
  readonly filter?: readonly TokenFilterPredicate[];
}
```

And in `GameState`:

```ts
readonly reveals?: Readonly<Record<string, readonly RevealGrant[]>>;
```

### 3. Add Zod schema for `reveal` effect

**File**: `src/kernel/schemas-ast.ts`

Add variant to `effectAstSchemaInternal`:

```ts
z.object({
  reveal: z.object({
    zone: ZoneRefSchema,
    to: z.union([z.literal('all'), PlayerSelSchema]),
    filter: z.array(TokenFilterPredicateSchema).optional(),
  }).strict(),
}).strict()
```

### 4. Add `RevealGrantSchema` and `reveals` in GameState schema

**File**: `src/kernel/schemas-core.ts`

Add `RevealGrantSchema` and wire into `GameStateSchema`:

```ts
reveals: z.record(StringSchema, z.array(RevealGrantSchema)).optional()
```

### 5. Register `reveal` in effect-kind and binder surfaces

**Files**:
- `src/cnl/effect-kind-registry.ts`
- `src/cnl/binder-surface-registry.ts`

Add `'reveal'` as a supported effect kind and define binder/zone selector reference paths for it.

### 6. Implement reveal runtime effect

**File**: `src/kernel/effects-reveal.ts` (new)

Implement `applyReveal`:
- Resolve `zone` via `resolveZoneRef`
- Validate zone exists in current state (runtime error if missing, consistent with other token/zone effects)
- Resolve observers:
  - `to: 'all'` -> `observers: 'all'`
  - `to: PlayerSel` -> resolve players and store deduped/sorted list
- Preserve optional `filter`
- Append to per-zone reveal grants (do not overwrite)
- Return immutable updated state

### 7. Add dispatch routing

**File**: `src/kernel/effect-dispatch.ts`

- Add `'reveal'` handling in `effectTypeOf`
- Route `dispatchEffect` to `applyReveal`

### 8. Add YAML-to-AST lowering for `reveal`

**File**: `src/cnl/compile-effects.ts`

In `lowerEffectNode`, add `source.reveal` handling:
- `zone` via `lowerZoneSelector`
- `to` as `'all'` or `lowerPlayerSelector`
- `filter` lowered using shared token-filter lowering logic

### 9. Add effect validation for `reveal`

**File**: `src/kernel/validate-gamedef-behavior.ts`

Add `reveal` branch that validates:
- `zone`
- `to` (if selector)
- `filter` token predicate values

### 10. Include reveal state in Zobrist hashing

**Files**:
- `src/kernel/types-core.ts` (`ZobristFeature` union)
- `src/kernel/zobrist.ts`

Add stable hashing for reveal grants so state hash reflects hidden-information disclosure state.

### 11. Tests (new + updates)

**New file**: `test/unit/effects-reveal.test.ts`

Add tests:
1. `reveal` appends a zone grant for a specific player selector
2. `reveal` with `to: 'all'` stores public grant
3. multiple `reveal` effects accumulate grants
4. reveal preserves `filter` metadata in state
5. unknown zone throws runtime error (not warning)

**Update existing tests**:
- `test/unit/schemas-ast.test.ts` (include `reveal` in “parses all EffectAST variants”)
- `test/unit/compile-effects.test.ts` (lower `reveal` deterministically)
- `test/unit/types-exhaustive.test.ts` (new `EffectAST` count + exhaustiveness switch)
- `test/unit/binder-surface-registry.test.ts` (effect kind coverage)
- `test/unit/zobrist-hash-updates.test.ts` (hash changes when reveals change)

## Files to Touch

| File | Change Type |
|------|-------------|
| `src/kernel/types-ast.ts` | Modify |
| `src/kernel/types-core.ts` | Modify |
| `src/kernel/schemas-ast.ts` | Modify |
| `src/kernel/schemas-core.ts` | Modify |
| `src/cnl/effect-kind-registry.ts` | Modify |
| `src/cnl/binder-surface-registry.ts` | Modify |
| `src/kernel/effects-reveal.ts` | Create |
| `src/kernel/effect-dispatch.ts` | Modify |
| `src/cnl/compile-effects.ts` | Modify |
| `src/cnl/compile-conditions.ts` | Modify (export token-filter lowering helper) |
| `src/kernel/validate-gamedef-behavior.ts` | Modify |
| `src/kernel/zobrist.ts` | Modify |
| `test/unit/effects-reveal.test.ts` | Create |
| `test/unit/schemas-ast.test.ts` | Modify |
| `test/unit/compile-effects.test.ts` | Modify |
| `test/unit/types-exhaustive.test.ts` | Modify |
| `test/unit/binder-surface-registry.test.ts` | Modify |
| `test/unit/zobrist-hash-updates.test.ts` | Modify |

## Out of Scope

- No updates to `data/games/*`
- No Texas Hold 'Em GameSpecDoc content files yet
- No `evaluateSubset` or `commitResource` implementation in this ticket
- No agent/simulator-specific behavior changes

## Acceptance Criteria

1. `reveal` is fully represented in types, schemas, compiler, validator, and runtime dispatch.
2. `GameState.reveals` stores structured reveal grants and remains optional.
3. `stateHash` changes deterministically when reveal grants change.
4. New reveal runtime tests pass.
5. Updated schema/compile/exhaustive/binder/hash tests pass.
6. `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test` all pass.

## Outcome

- **Completion date**: 2026-02-15
- **What changed vs plan**:
  - Implemented `reveal` end-to-end across AST/types, schemas, effect dispatch/runtime, CNL lowering, validator, and Zobrist hashing.
  - Adopted structured reveal grants in `GameState.reveals` (`zone -> RevealGrant[]`) to preserve `filter` semantics and support extensible hidden-info policy.
  - Added `src/kernel/effects-reveal.ts` and integrated it through `effect-dispatch`.
  - Extended compiler token-filter reuse by exporting `lowerTokenFilterArray` from `compile-conditions`.
  - Added and updated unit tests for runtime behavior, schema coverage, compiler lowering, union exhaustiveness, and hash behavior.
- **Deviations**:
  - Unknown-zone behavior was finalized as runtime error (consistent with existing zone effects), not warning.
  - Binder-surface test updates were structural only via `SUPPORTED_EFFECT_KINDS` + registry map consistency; no new explicit assertion case was required.
- **Verification results**:
  - `npm run build` passed
  - `npm run typecheck` passed
  - `npm run lint` passed
  - `npm test` passed
