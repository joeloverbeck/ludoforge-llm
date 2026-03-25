# 82EFFASTTYPTAG-007: CI Exhaustiveness, Contiguity, and Round-Trip Tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — new test file in `packages/engine/test/unit/`
**Deps**: 82EFFASTTYPTAG-001, 82EFFASTTYPTAG-002, 82EFFASTTYPTAG-003, 82EFFASTTYPTAG-004

## Problem

Spec 82 requires CI-level tests that guard against future drift:
1. `EFFECT_KIND_TAG` keys must exactly match `EffectKind` keys (exhaustiveness).
2. Tag values must be contiguous 0..N-1 (contiguity).
3. Compiled GameDefs must have `_k` fields matching their property keys
   (tag consistency).
4. Serialized GameDef JSON must round-trip with `_k` fields preserved.

These are regression guards — they catch future additions of new effect kinds
that forget to update `EFFECT_KIND_TAG`.

## Assumption Reassessment (2026-03-25)

1. The compile-time `_effectTagExhaustive` check (ticket 001) catches missing
   keys at build time. Runtime tests provide defense-in-depth. Confirmed.
2. `registry` in `effect-registry.ts` has exactly 34 entries. Confirmed.
3. Production specs (FITL, Texas Hold'em) can be compiled via
   `compileProductionSpec()` from `test/helpers/production-spec-helpers.ts`.
   Confirmed.
4. `tagEffectAsts()` from ticket 002 provides the comparison utility.

## Architecture Check

1. These are pure validation tests — no production code changes.
2. Tests use existing infrastructure (`compileProductionSpec`,
   `tagEffectAsts`, `EFFECT_KIND_TAG`, `registry`).
3. Tests are game-agnostic — they validate structural properties of the tag
   system, not game-specific behavior.

## What to Change

### 1. New test file: `effect-kind-tag-invariants.test.ts`

#### Test: Exhaustiveness
```typescript
assert.strictEqual(
  Object.keys(EFFECT_KIND_TAG).length,
  Object.keys(registry).length,
  'EFFECT_KIND_TAG must cover all EffectKind variants',
);
```

#### Test: Key parity
```typescript
const tagKeys = new Set(Object.keys(EFFECT_KIND_TAG));
const registryKeys = new Set(Object.keys(registry));
assert.deepStrictEqual(tagKeys, registryKeys);
```

#### Test: Contiguity
```typescript
const tagValues = Object.values(EFFECT_KIND_TAG).sort((a, b) => a - b);
assert.deepStrictEqual(
  tagValues,
  Array.from({ length: tagValues.length }, (_, i) => i),
  'EFFECT_KIND_TAG values must be contiguous starting from 0',
);
```

#### Test: TAG_TO_KIND consistency
```typescript
for (const [kind, tag] of Object.entries(EFFECT_KIND_TAG)) {
  assert.strictEqual(TAG_TO_KIND[tag], kind);
}
```

#### Test: Tag consistency on compiled GameDef (FITL)
Compile the FITL production spec, walk all EffectAST nodes, and verify
each node's `_k` matches `EFFECT_KIND_TAG[propertyKey]`.

#### Test: Tag consistency on compiled GameDef (Texas Hold'em)
Same as above for Texas Hold'em.

#### Test: Round-trip serialization
Serialize a compiled GameDef to JSON, parse it back, and verify all `_k`
fields are preserved with correct values.

## Files to Touch

- `packages/engine/test/unit/effect-kind-tag-invariants.test.ts` (new)

## Out of Scope

- Type definitions — ticket 001
- Builder/tagger creation — ticket 002
- Dispatch changes — ticket 003
- Compiler migration — ticket 004
- Schema changes — ticket 005
- Test fixture migration — ticket 006
- Performance benchmarking
- Changes to any production source files

## Acceptance Criteria

### Tests That Must Pass

1. `effect-kind-tag-invariants.test.ts` — all 7 tests described above pass.
2. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `EFFECT_KIND_TAG` and `registry` have identical key sets.
2. Tag values are contiguous 0..N-1.
3. `TAG_TO_KIND[EFFECT_KIND_TAG[k]] === k` for every `k`.
4. Every EffectAST node in compiled GameDefs has `_k ===
   EFFECT_KIND_TAG[propertyKey]`.
5. JSON round-trip preserves `_k` fields.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effect-kind-tag-invariants.test.ts` (new) —
   exhaustiveness, contiguity, consistency, round-trip.

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/test/unit/effect-kind-tag-invariants.test.ts`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo test`

## Outcome

- **Completion date**: 2026-03-25
- **What changed**: Created `packages/engine/test/unit/effect-kind-tag-invariants.test.ts` with 7 CI-level invariant tests covering exhaustiveness, key parity, contiguity, TAG_TO_KIND consistency, tag consistency on both FITL and Texas Hold'em compiled GameDefs, and JSON round-trip preservation.
- **Deviations**: The tag consistency tests (FITL/Texas Hold'em) use a custom recursive walker (`collectTagMismatches`) instead of the `tagEffectAsts`-based comparison suggested in the ticket. This is because `tagEffectAsts` over-tags `ValueExpr` objects that share the `if` property key with `EffectKind.if`, causing false positives on deep equality. The custom walker validates only objects that already carry a `_k` field.
- **Verification**: All 7 new tests pass. Full engine suite passes (4782 tests, 0 failures).
