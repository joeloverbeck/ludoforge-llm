# ARCDECANDGEN-009: Data Asset Failure Cascade Semantics

**Phase**: 2B (Structured Compile Results)
**Priority**: P1
**Complexity**: S
**Dependencies**: ARCDECANDGEN-008 (CompileSectionResults must exist)

## Goal

Define and implement explicit cascade rules for when a data asset fails to compile. When a data asset failure derives a section (e.g., `map` → `zones`), the derived section is set to `null` in `CompileSectionResults` and a cascade diagnostic is emitted.

## File List (files to touch)

### Files to modify
- `src/cnl/compile-data-assets.ts` — implement cascade logic: when `map` asset fails and no explicit YAML zones exist, set `sections.zones = null` and emit `CNL_DATA_ASSET_CASCADE_ZONES_MISSING`; same for `pieceCatalog` → `tokenTypes`
- `src/cnl/compiler-core.ts` — wire cascade diagnostics into the compile pipeline
- `src/cnl/compiler-diagnostics.ts` — add new diagnostic codes: `CNL_DATA_ASSET_CASCADE_ZONES_MISSING`, `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING`

### New/modified test files
- `test/unit/compiler-structured-results.test.ts` — add cascade-specific tests (or create separate `test/unit/data-asset-cascade.test.ts`)

## Out of Scope

- **No changes to** `src/kernel/`
- **No changes to** `data/games/fire-in-the-lake.md`
- **No changes to** existing `lower*` function signatures
- **No cross-reference validation** (Phase 3)
- **eventCardSet** cascade — `eventDecks` is optional, no downstream cascade needed

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests
1. **"map data asset failure nulls zones when no explicit YAML zones"** — spec with broken map asset, no explicit zones section → `sections.zones === null`, diagnostic `CNL_DATA_ASSET_CASCADE_ZONES_MISSING` emitted at severity `warning`
2. **"map data asset failure does NOT null zones when explicit YAML zones exist"** — spec with broken map asset BUT explicit zones section → `sections.zones !== null`, no cascade diagnostic
3. **"pieceCatalog failure nulls tokenTypes when no explicit YAML tokenTypes"** — same pattern for pieceCatalog → tokenTypes, diagnostic `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING`
4. **"eventCardSet failure does NOT cascade"** — broken eventCardSet data asset → no cascade diagnostic, `sections.eventDecks === null` (direct failure, not cascade)

### Invariants that must remain true
- Cascade diagnostics are severity `warning` (not error) — they explain WHY downstream errors appear
- Cascade only fires when no explicit YAML section exists as fallback
- All cascade diagnostic codes follow the `CNL_DATA_ASSET_CASCADE_*` prefix
