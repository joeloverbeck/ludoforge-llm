# CROGAMPRIELE-007: Zone behaviors — deck semantics kernel primitive (B2)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel types, draw effect handler, compiler zone materialization, cross-validation, GameSpecDoc types
**Deps**: None (independent kernel primitive)

## Problem

Both games manually orchestrate card/deck lifecycle: shuffle → draw-from-top → discard → reshuffle-when-empty. Every card/deck game will reinvent this pattern. The DSL says `moveToken` when the designer thinks "deal from deck." A `behavior` field on `ZoneDef` with deck semantics (`drawFrom` order + auto-reshuffle) eliminates this gap.

## Assumption Reassessment (2026-03-02)

1. `ZoneDef` in `types-core.ts:87-98` — confirmed. No `behavior` field exists.
2. `applyDraw` in `effects-token.ts:533-596` always takes from front of array. No random or bottom extraction.
3. `applyShuffle` in `effects-token.ts:705-715` uses Fisher-Yates. Extract to shared utility for reshuffle reuse.
4. `materializeZoneDefs` in `compile-zones.ts:20-134` maps `GameSpecZoneDef` → `ZoneDef` via `createZoneDef` (lines 363-387, 10 positional params, 2 call sites at 93-106 and 111-125). Refactor to options object.
5. `pushEffectZoneDiagnostics` in `cross-validate.ts:973-1029` validates zone references in effects. Zone-level `reshuffleFrom` validation needs a new validation block.
6. `GameSpecZoneDef` in `game-spec-doc.ts:51-66` — `behavior` field needs to be added.
7. `ZoneDefSchema` in `schemas-core.ts:67-87` uses `.strict()` (Zod). Must add `behavior` to Zod schema so compiled GameDefs with behavior pass validation. JSON Schema auto-generated via `buildSchemaArtifactMap()`.
8. New compiler diagnostic codes needed in `compiler-diagnostic-codes.ts` for behavior validation.
9. New xref diagnostic codes needed in `cross-validate-diagnostic-codes.ts` for `reshuffleFrom` validation.

## Architecture Check

1. Zone behaviors are kernel-level because the draw effect handler must consult zone metadata at runtime to determine extraction order and auto-reshuffle logic.
2. `behavior` is a discriminated union on `type` — extensible for future behaviors (e.g., `'market'`).
3. Auto-reshuffle uses the GameState's RNG to preserve determinism.
4. The `shuffle` effect is unchanged — it works independently of zone behaviors.

## What to Change

### 1. Add `ZoneBehavior` and `DeckBehavior` types + `behavior` field on `ZoneDef` in `types-core.ts`

```typescript
export interface DeckBehavior {
  readonly type: 'deck';
  readonly drawFrom: 'top' | 'bottom' | 'random';
  readonly reshuffleFrom?: ZoneId;
}

export type ZoneBehavior = DeckBehavior;

// Add to ZoneDef:
readonly behavior?: ZoneBehavior;
```

### 2. Add `behavior` to `GameSpecZoneDef` in `game-spec-doc.ts`

```typescript
// In GameSpecZoneDef:
readonly behavior?: {
  readonly type: string;
  readonly drawFrom?: string;
  readonly reshuffleFrom?: string;
};
```

### 3. Modify `applyDraw` in `effects-token.ts`

Currently `applyDraw` takes from front of array. Modify to:

1. After resolving `fromZoneId`, look up the zone def: `def.zones.find(z => z.id === fromZoneId)` (or use a pre-built zone map if available in context).
2. If zone has `behavior?.type === 'deck'`:
   a. **Auto-reshuffle**: If `sourceTokens.length < count` and `behavior.reshuffleFrom` is set:
      - Move all tokens from `reshuffleFrom` zone into the source zone.
      - Shuffle the source zone using the state's RNG (extract Fisher-Yates from `applyShuffle` into a shared utility).
      - Re-read `sourceTokens` from the updated state.
      - Continue drawing.
   b. **Extraction order** based on `behavior.drawFrom`:
      - `'top'`: take from index 0 (front of array) — current behavior.
      - `'bottom'`: take from last index (`sourceTokens.slice(-moveCount)`).
      - `'random'`: select `moveCount` random indices using state RNG.
3. If zone has no `behavior` or different type: use current front-of-array behavior unchanged.

### 4. Extract Fisher-Yates shuffle to shared utility

The Fisher-Yates logic in `applyShuffle` (around line 687) should be extracted into a reusable function like `shuffleTokens(tokens: readonly Token[], rng: RngState): { tokens: readonly Token[]; rng: RngState }` so both `applyShuffle` and the auto-reshuffle in `applyDraw` can use it.

### 5. Pass through `behavior` in `materializeZoneDefs` (compile-zones.ts)

In `createZoneDef` and its callers in `materializeZoneDefs`:
1. Accept `behavior` field from `GameSpecZoneDef`.
2. Validate `behavior.type` is `'deck'` (only recognized type initially).
3. If `behavior.type === 'deck'`: validate `drawFrom` is `'top' | 'bottom' | 'random'`.
4. If `ordering` is not `'stack'` and `behavior.type === 'deck'`: emit warning diagnostic.
5. Pass through `behavior` to the output `ZoneDef`.
6. Convert `reshuffleFrom` string to `ZoneId` branded type.

### 6. Add `reshuffleFrom` cross-validation in `cross-validate.ts`

In a new validation block (near existing zone-reference validation):
1. For each zone in `def.zones` that has `behavior?.reshuffleFrom`:
   a. Validate `reshuffleFrom` references a declared zone ID.
   b. Validate `reshuffleFrom` is not the zone itself (no self-reshuffle).
2. Emit diagnostics for violations.

### 7. Create unit tests

Test file covering:
- Draw from deck with `drawFrom: 'top'` — takes from front of array (existing behavior).
- Draw from deck with `drawFrom: 'bottom'` — takes from end of array.
- Draw from deck with `drawFrom: 'random'` — takes random tokens using RNG.
- Auto-reshuffle: deck runs out, `reshuffleFrom` is set → tokens move from reshuffle zone, deck is shuffled, drawing continues.
- Auto-reshuffle determinism: same seed + same actions = same reshuffle order.
- No reshuffle when `reshuffleFrom` is absent: draw on empty deck draws 0 tokens.
- Zone without `behavior` — draw works exactly as current.
- Compile zones: `behavior` field passes through to `ZoneDef`.
- Cross-validation: `reshuffleFrom` referencing non-existent zone produces diagnostic.
- Cross-validation: `reshuffleFrom` referencing self produces diagnostic.
- Cross-validation: `reshuffleFrom` referencing valid zone passes.
- Warning: `behavior.type: 'deck'` with non-`stack` ordering.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify — add `ZoneBehavior`, `DeckBehavior`, `behavior` on `ZoneDef`)
- `packages/engine/src/kernel/schemas-core.ts` (modify — add `behavior` to `ZoneDefSchema`)
- `packages/engine/src/kernel/effects-token.ts` (modify — extract Fisher-Yates, `applyDraw` extraction order + auto-reshuffle)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add `behavior` to `GameSpecZoneDef`)
- `packages/engine/src/cnl/compile-zones.ts` (modify — refactor `createZoneDef` to options, pass through `behavior`)
- `packages/engine/src/cnl/compiler-diagnostic-codes.ts` (modify — add 3 behavior codes)
- `packages/engine/src/cnl/cross-validate.ts` (modify — validate `reshuffleFrom` zone references)
- `packages/engine/src/cnl/cross-validate-diagnostic-codes.ts` (modify — add 2 xref codes)
- `packages/engine/schemas/GameDef.schema.json` (regenerated)
- `packages/engine/test/unit/effects-token-deck-behavior.test.ts` (new)
- `packages/engine/test/unit/compile-zones-behavior.test.ts` (new)
- `packages/engine/test/unit/cross-validate-zone-behavior.test.ts` (new)

## Scope Additions (vs original ticket)

- **Zod schema**: `behavior` field added to `ZoneDefSchema` in `schemas-core.ts` (required because `.strict()` rejects unknown fields)
- **JSON Schema regeneration**: `GameDef.schema.json` regenerated from updated Zod schema
- **Compiler diagnostic codes**: 3 new codes in `compiler-diagnostic-codes.ts` for behavior validation
- **Xref diagnostic codes**: 2 new codes in `cross-validate-diagnostic-codes.ts` for `reshuffleFrom` validation
- **`createZoneDef` refactor**: Positional params → options object (contained refactor, 2 call sites)

## Out of Scope

- Future zone behavior types (e.g., `'market'`) — only `'deck'` is implemented
- Wiring into `compiler-core.ts` (CROGAMPRIELE-008)
- Phase action defaults (CROGAMPRIELE-006)
- Game spec migrations (CROGAMPRIELE-010, -011)
- `shuffle` effect — unchanged, works independently of zone behaviors
- Any changes to `applyMove` or legal move enumeration

## Acceptance Criteria

### Tests That Must Pass

1. `drawFrom: 'top'` takes tokens from index 0 (front of array).
2. `drawFrom: 'bottom'` takes tokens from last index.
3. `drawFrom: 'random'` uses state RNG for random selection.
4. Auto-reshuffle: empty deck + `reshuffleFrom` triggers token transfer, shuffle, and continued draw.
5. Auto-reshuffle is deterministic: same seed = same shuffle order.
6. No `reshuffleFrom` on empty deck: draw returns 0 tokens, no error.
7. Zone without `behavior`: draw works identically to current behavior.
8. `behavior` field passes through `materializeZoneDefs` to compiled `ZoneDef`.
9. Invalid `reshuffleFrom` (non-existent zone) produces cross-validation diagnostic.
10. Self-referencing `reshuffleFrom` produces cross-validation diagnostic.
11. Existing suite: `pnpm turbo test`

### Invariants

1. `behavior` is entirely optional — zones without it have zero behavior change.
2. Determinism preserved: same seed + same actions = same draw/reshuffle results.
3. `shuffle` effect is unaffected by zone behaviors.
4. No mutation of `GameDef` or `GameState`.
5. Fisher-Yates shuffle utility is used by both `applyShuffle` and auto-reshuffle (DRY).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-token-deck-behavior.test.ts` — validates draw ordering (top/bottom/random), auto-reshuffle, determinism, no-reshuffle fallback. Rationale: core new runtime behavior.
2. `packages/engine/test/unit/compile-zones-behavior.test.ts` — validates `behavior` passthrough in zone materialization + ordering warning. Rationale: compile-time field propagation.
3. `packages/engine/test/unit/cross-validate-zone-behavior.test.ts` — validates `reshuffleFrom` zone reference checks. Rationale: correctness of cross-validation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/effects-token-deck-behavior.test.js`
3. `node --test packages/engine/dist/test/unit/compile-zones-behavior.test.js`
4. `node --test packages/engine/dist/test/unit/cross-validate-zone-behavior.test.js`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

**Completion date**: 2026-03-02

**What changed**:
- `types-core.ts`: Added `DeckBehavior` interface, `ZoneBehavior` discriminated union type, `behavior?` optional field on `ZoneDef`
- `schemas-core.ts`: Added `DeckBehaviorSchema`, `ZoneBehaviorSchema`, `behavior` optional field on `ZoneDefSchema`
- `game-spec-doc.ts`: Added `behavior?` to `GameSpecZoneDef`
- `effects-token.ts`: Extracted `shuffleTokenArray` utility from `applyShuffle`; modified `applyDraw` with deck behavior support (drawFrom top/bottom/random, auto-reshuffle from designated zone)
- `compile-zones.ts`: Refactored `createZoneDef` from 10 positional params to `CreateZoneDefOptions` interface; added `compileBehavior` helper with validation; passes `behavior` through to compiled `ZoneDef`
- `compiler-diagnostic-codes.ts`: Added 3 codes (`CNL_COMPILER_ZONE_BEHAVIOR_TYPE_INVALID`, `CNL_COMPILER_ZONE_BEHAVIOR_DRAW_FROM_INVALID`, `CNL_COMPILER_ZONE_BEHAVIOR_ORDERING_MISMATCH`)
- `cross-validate.ts`: Added zone behavior `reshuffleFrom` validation block (missing zone, self-reference)
- `cross-validate-diagnostic-codes.ts`: Added 2 codes (`CNL_XREF_ZONE_BEHAVIOR_RESHUFFLE_MISSING`, `CNL_XREF_ZONE_BEHAVIOR_RESHUFFLE_SELF`)
- `GameDef.schema.json`: Regenerated with `behavior` field
- 3 new test files: `effects-token-deck-behavior.test.ts` (11 tests), `compile-zones-behavior.test.ts` (10 tests), `cross-validate-zone-behavior.test.ts` (5 tests)

**Deviations from original ticket**:
- Scope expanded to include Zod schema update, JSON Schema regeneration, compiler diagnostic codes, xref diagnostic codes, and `createZoneDef` refactor — all were necessary but not in the original ticket scope
- `createZoneDef` refactored from positional params to options object (contained change, 2 call sites)

**Verification**: `pnpm turbo build` passed, 3317 tests passed (0 failures), `pnpm turbo typecheck` passed, `pnpm turbo lint` passed, `pnpm -F @ludoforge/engine run schema:artifacts -- --check` passed
