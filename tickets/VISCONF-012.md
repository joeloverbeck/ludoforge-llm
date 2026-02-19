# VISCONF-012: Update engine tests (remove visual assertions, relocate card animation tests)

**Spec**: 42 (Per-Game Visual Config), D14
**Priority**: P1
**Depends on**: VISCONF-009 (compiler changes — tests must match new compiler behavior)
**Blocks**: Nothing (final ticket)

---

## Summary

Update all engine test files that reference removed visual fields. Remove visual assertions from compilation tests, update fixtures, and relocate card animation compilation tests to the runner (or delete them if runner tests in VISCONF-007 cover the same logic).
Also add negative validation coverage proving legacy visual keys in `GameSpecDoc` are rejected with error diagnostics so modders cannot reintroduce presentation fields into engine specs.

---

## Engine test files to modify

| File | Change |
|------|--------|
| `packages/engine/test/unit/compile-zones.test.ts` | Remove assertions on `layoutRole` and `visual` in compiled zone output |
| `packages/engine/test/unit/card-animation-metadata.test.ts` | Delete entire file (card animation is no longer compiled by engine) |
| `packages/engine/test/integration/texas-card-animation-metadata.test.ts` | Delete entire file (card animation extraction from Texas Hold'em is no longer engine concern) |
| `packages/engine/test/unit/compiler-structured-results.test.ts` | Remove `cardAnimation` section from structured results assertions |
| `packages/engine/test/unit/data-assets.test.ts` | Remove assertions on `visual` fields in data asset extraction (resolveMapSpaceVisuals, buildTokenTypeVisualsMap, mergeZoneVisualHints) |
| `packages/engine/test/unit/schemas-top-level.test.ts` | Update schema validation fixtures to exclude visual fields |
| `packages/engine/test/unit/json-schema.test.ts` | Update JSON schema validation fixtures to exclude visual fields |
| `packages/engine/test/unit/fitl-production-map-cities.test.ts` | Remove assertions on zone `visual` properties (shape, color, label) in city zone output |
| `packages/engine/test/unit/fitl-production-map-provinces-locs.test.ts` | Remove assertions on zone `visual` properties in province/LoC zone output |
| `packages/engine/test/unit/fitl-production-piece-inventory.test.ts` | Remove assertions on `visual` properties in piece type output |
| `packages/engine/test/integration/fitl-derived-values.test.ts` | Remove visual field references if any are asserted in derived value tests |
| `packages/engine/test/unit/validate-spec.test.ts` (or existing validator test file) | Add negative tests asserting removed visual keys now fail with `severity: 'error'` diagnostics |

## Engine test files to check (may not need changes)

| File | Check for |
|------|-----------|
| `packages/engine/test/fixtures/*.json` | Any fixture GameDef JSON with visual fields — strip them |
| `packages/engine/test/helpers/*.ts` | Any helper that constructs GameDef/ZoneDef with visual fields |

---

## Detailed requirements

### card-animation-metadata.test.ts — DELETE

This test file tests `lowerCardAnimationMetadata()` which is removed in VISCONF-009. The equivalent testing responsibility moves to the runner (VISCONF-007 tests `resolveCardTokenTypeIds` and card context building).

### texas-card-animation-metadata.test.ts — DELETE

This integration test validates card animation metadata extraction for Texas Hold'em, which is no longer an engine concern.

### compile-zones.test.ts

Remove:
- Assertions that compiled zones have `layoutRole` field
- Assertions that compiled zones have `visual` field
- Any test fixture zones that include `layoutRole` or `visual`

Keep:
- All assertions on `id`, `zoneKind`, `ownerPlayerIndex`, `owner`, `visibility`, `ordering`, `adjacentTo`, `category`, `attributes`

### data-assets.test.ts

Remove:
- Tests for `resolveMapSpaceVisuals()` (function removed)
- Tests for `mergeZoneVisualHints()` (function removed)
- Tests for `buildTokenTypeVisualsMap()` (function removed)
- Assertions on `visual` field in extracted zones or token types

Keep:
- Tests for non-visual data asset extraction (zone IDs, categories, attributes, adjacency, token properties)

### fitl-production-map-*.test.ts

Remove assertions like:
- `expect(zone.visual.shape).toBe('circle')` (cities)
- `expect(zone.visual.color).toBe('#5b7fa5')` (city color)
- `expect(zone.visual.label).toBe('Saigon')` (city label)
- `expect(zone.visual.shape).toBe('rectangle')` (provinces)
- `expect(zone.visual.shape).toBe('line')` (LoCs)

Keep:
- Zone ID assertions
- Category assertions
- Attribute assertions (terrainTags, population, econValue, etc.)
- Adjacency assertions

### fitl-production-piece-inventory.test.ts

Remove assertions like:
- `expect(piece.visual.color).toBe('#e63946')`
- `expect(piece.visual.shape).toBe('cube')`
- `expect(piece.visual.activeSymbol).toBe('star')`

Keep:
- Piece type ID assertions
- Status dimension assertions
- Transition assertions
- Faction assignment assertions

### compiler-structured-results.test.ts

Remove:
- `cardAnimation` from the structured section results
- Any assertion that `sections.cardAnimation` exists or has specific values

### Test fixtures

Search `packages/engine/test/fixtures/` for any `.json` or `.ts` fixture files that include visual fields. Strip those fields. Common patterns to look for:
- `"visual":`
- `"layoutRole":`
- `"cardAnimation":`
- `"layoutMode":`
- `"color":` (in faction context)
- `"displayName":` (in faction context)

### New strict-boundary tests

Add tests that parse/validate minimal specs containing one legacy visual field at a time and assert:
- compile/validation returns diagnostics with `severity: 'error'`
- diagnostic path points to the offending visual key (for example `doc.metadata.cardAnimation`, `doc.zones.0.layoutRole`)
- no backward-compat aliasing path is accepted

---

## Out of scope

- Engine type changes (VISCONF-008)
- Compiler changes (VISCONF-009)
- Game spec YAML changes (VISCONF-010)
- Bootstrap JSON changes (VISCONF-011)
- Runner test changes (covered in VISCONF-004, 005, 006, 007)
- Writing new runner tests for relocated card animation logic

---

## Acceptance criteria

### Tests that must pass

1. `pnpm -F @ludoforge/engine test` — ALL engine tests pass
2. `pnpm -F @ludoforge/engine test:e2e` — ALL E2E tests pass
3. `pnpm -F @ludoforge/engine typecheck` — no type errors in test files
4. `pnpm turbo test` — full suite passes (engine + runner)
5. New strict-boundary tests pass for removed visual keys (error severity expected)

### Verification

1. `grep -r 'visual\|layoutRole\|cardAnimation\|layoutMode\|displayName' packages/engine/test/ --include='*.ts' | grep -v 'node_modules' | grep -v '.d.ts'` returns zero hits (with allowance for the word "visual" in comments or variable names unrelated to engine types)
2. `card-animation-metadata.test.ts` and `texas-card-animation-metadata.test.ts` no longer exist
3. All remaining test assertions reference only non-visual GameDef fields

### Invariants

- No engine test asserts the existence or value of any visual field
- Production FITL/Texas Hold'em spec compilation tests still validate all non-visual aspects (zone structure, token properties, scenarios, variables, phases, actions, triggers)
- Test coverage for non-visual compilation logic is unchanged
- Legacy visual keys in GameSpecDoc are verified as hard errors, not warnings
- `pnpm turbo build && pnpm turbo test` passes end-to-end
