# CROGAMPRIELE-007: Zone behaviors — deck semantics kernel primitive (B2)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — kernel types, draw effect handler, compiler zone materialization, cross-validation, GameSpecDoc types
**Deps**: None (independent kernel primitive)

## Problem

Both games manually orchestrate card/deck lifecycle: shuffle → draw-from-top → discard → reshuffle-when-empty. Every card/deck game will reinvent this pattern. The DSL says `moveToken` when the designer thinks "deal from deck." A `behavior` field on `ZoneDef` with deck semantics (`drawFrom` order + auto-reshuffle) eliminates this gap.

## Assumption Reassessment (2026-03-01)

1. `ZoneDef` in `types-core.ts:87-98` has `id`, `zoneKind?`, `isInternal?`, `ownerPlayerIndex?`, `owner`, `visibility`, `ordering`, `adjacentTo?`, `category?`, `attributes?`. No `behavior` field exists.
2. `applyDraw` in `effects-token.ts:533-594` always takes from front of array (`sourceTokens.slice(0, moveCount)`). No random or bottom extraction.
3. `applyShuffle` in `effects-token.ts` (around line 687) uses Fisher-Yates. This logic should be extracted to a shared utility for reshuffle reuse.
4. `materializeZoneDefs` in `compile-zones.ts:20-108` maps `GameSpecZoneDef` properties into `ZoneDef` via `createZoneDef`. New `behavior` field needs to be passed through.
5. `pushEffectZoneDiagnostics` in `cross-validate.ts:968-1024` validates zone references in effects. Zone-level `reshuffleFrom` validation needs a new validation block.
6. `GameSpecZoneDef` in `game-spec-doc.ts:33-48` — `behavior` field needs to be added.

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
- `packages/engine/src/kernel/effects-token.ts` (modify — `applyDraw` extraction order + auto-reshuffle)
- `packages/engine/src/kernel/effects-token.ts` (modify — extract Fisher-Yates from `applyShuffle` to shared utility)
- `packages/engine/src/cnl/game-spec-doc.ts` (modify — add `behavior` to `GameSpecZoneDef`)
- `packages/engine/src/cnl/compile-zones.ts` (modify — pass through `behavior` in `materializeZoneDefs`)
- `packages/engine/src/cnl/cross-validate.ts` (modify — validate `reshuffleFrom` zone references)
- `packages/engine/test/unit/effects-token-deck-behavior.test.ts` (new)
- `packages/engine/test/unit/compile-zones-behavior.test.ts` (new)
- `packages/engine/test/unit/cross-validate-zone-behavior.test.ts` (new)

## Out of Scope

- Future zone behavior types (e.g., `'market'`) — only `'deck'` is implemented
- Wiring into `compiler-core.ts` (CROGAMPRIELE-008)
- Phase action defaults (CROGAMPRIELE-006)
- JSON Schema updates (CROGAMPRIELE-009)
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
