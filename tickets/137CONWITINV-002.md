# 137CONWITINV-002: Add `deriveFitlPopulationZeroSpaces` test helper

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test helper only
**Deps**: `specs/137-convergence-witness-invariant-promotion.md`

## Problem

Spec 137's rewritten bounded-termination test asserts that every population-0 space in FITL remains `neutral` on the `supportOpposition` lattice throughout every simulated trace — a generalization of the pre-distillation seed-1002 test, which pinned this check to the single space `phuoc-long:none`. The set of population-0 spaces must be derived from the compiled FITL `GameDef` (not hardcoded in the test) so the assertion survives future map revisions. No existing helper performs this derivation.

## Assumption Reassessment (2026-04-18)

1. FITL map data defines `spaces[].attributes.population` — verified at `data/games/fire-in-the-lake/40-content-data-assets.md` during Spec 137 reassessment. Population-0 spaces documented today: `phuoc-long`, `central-laos`, `southern-laos`, `northeast-cambodia`, `the-fishhook`, `the-parrots-beak`.
2. `compileProductionSpec()` from `packages/engine/test/helpers/production-spec-helpers.ts` produces a `GameDef` whose `dataAssets` array contains a `map` asset with `id === 'fitl-map-production'`.
3. `production-spec-helpers.ts` already mixes FITL-specific and Texas-specific helpers (e.g., `compileProductionSpec` for FITL, `compileTexasProductionSpec` for Texas, `getFitlProductionFixture`, `getTexasProductionFixture`). Adding a FITL-prefixed helper there is consistent with the existing pattern.

## Architecture Check

1. FITL-specific helper lives in `packages/engine/test/helpers/`, not in runtime/compiler/kernel code. Foundation #1 (Engine Agnosticism) preserved. The `Fitl` name prefix makes game specificity explicit at every call site.
2. Data-driven derivation: the helper reads the authoritative map asset from the compiled GameDef rather than replicating a hardcoded space list in test code. If the FITL map adds or removes a population-0 space, the helper automatically reflects the change.
3. No backwards-compat shim. Net-new export; no alias paths.

## What to Change

### 1. Add `deriveFitlPopulationZeroSpaces` export

Append to `packages/engine/test/helpers/production-spec-helpers.ts`:

```ts
export const deriveFitlPopulationZeroSpaces = (def: GameDef): readonly string[] => {
  const mapAsset = def.dataAssets?.find(
    (asset) => asset.kind === 'map' && asset.id === 'fitl-map-production',
  );
  if (mapAsset?.payload == null || typeof mapAsset.payload !== 'object') {
    return [];
  }
  const payload = mapAsset.payload as {
    readonly spaces?: readonly {
      readonly id: string;
      readonly attributes?: Readonly<Record<string, unknown>>;
    }[];
  };
  return (payload.spaces ?? [])
    .filter((space) => space.attributes?.population === 0)
    .map((space) => space.id);
};
```

Import `GameDef` from the same module source used by the existing helpers in this file.

### 2. Add a unit test

Create `packages/engine/test/unit/derive-fitl-population-zero-spaces.test.ts` with file-top marker `// @test-class: architectural-invariant` (the assertion holds across any legitimate FITL GameDef). The test:

- Compiles the FITL production spec via `compileProductionSpec()`.
- Calls `deriveFitlPopulationZeroSpaces(def)`.
- Asserts the returned set contains exactly the 6 documented population-0 spaces (`phuoc-long`, `central-laos`, `southern-laos`, `northeast-cambodia`, `the-fishhook`, `the-parrots-beak`), using set-equality rather than order-sensitive comparison.
- Asserts no space with non-zero population appears in the set — pick one positive-population space (e.g., `saigon`, `hue`) and verify exclusion.

## Files to Touch

- `packages/engine/test/helpers/production-spec-helpers.ts` (modify — add export)
- `packages/engine/test/unit/derive-fitl-population-zero-spaces.test.ts` (new)

## Out of Scope

- Generalizing the helper across games (Texas Hold'em has no spaces concept; YAGNI). If a second game ever needs similar derivation, extract a game-agnostic primitive then — not now.
- Moving or restructuring other FITL helpers in `production-spec-helpers.ts`.
- Consuming the helper from any test. Consumption is ticket 004's job.

## Acceptance Criteria

### Tests That Must Pass

1. The new unit test `derive-fitl-population-zero-spaces.test.ts` passes, proving the helper correctly enumerates population-0 spaces from the compiled FITL GameDef.
2. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. **Determinism**: same compiled GameDef → same ordered list of zone IDs.
2. **Game-agnosticism of engine code**: no FITL-specific logic added to `packages/engine/src/`. The helper lives entirely in `test/helpers/`.
3. **Authoritative source**: the helper derives from the `dataAssets` map payload, not from a duplicated hardcoded list.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/derive-fitl-population-zero-spaces.test.ts` — architectural-invariant classification; proves helper correctness against the FITL production GameDef. The test's property form ("every `population === 0` space is returned; no others are") is invariant across any FITL map revision.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo lint typecheck`
