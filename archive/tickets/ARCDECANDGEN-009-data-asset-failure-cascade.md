# ARCDECANDGEN-009: Data Asset Failure Cascade Semantics

**Status**: ✅ COMPLETED
**Phase**: 2B (Structured Compile Results)
**Priority**: P1
**Complexity**: S
**Dependencies**: ARCDECANDGEN-008 (CompileSectionResults must exist)

## Goal

Define and implement explicit cascade rules for when a data asset fails to compile. When a data asset failure derives a section (e.g., `map` → `zones`), the derived section is set to `null` in `CompileSectionResults` and a cascade diagnostic is emitted.

## Assumptions Reassessment (2026-02-13)

- `CompileSectionResults` currently uses `eventCards` (not `eventDecks`).
- Compiler diagnostic codes are not centrally registered in `src/cnl/compiler-diagnostics.ts`; codes are emitted at call sites.
- `src/cnl/compiler-core.ts` currently treats missing derived `tokenTypes` as `[]` (non-null), so `pieceCatalog` failure does not currently null `sections.tokenTypes`.
- `src/cnl/compiler-core.ts` currently emits `CNL_COMPILER_REQUIRED_SECTION_MISSING` for missing `zones` even when the miss is caused by failed map-asset derivation.

## Updated Scope

- Add explicit asset-failure signals from data-asset derivation for `map` and `pieceCatalog`.
- In compiler orchestration, emit cascade diagnostics only when:
  - the derived section is missing due to data-asset failure, and
  - there is no explicit YAML fallback section.
- Null `sections.tokenTypes` for `pieceCatalog` derivation failures with no explicit YAML fallback.
- Keep `eventCardSet` behavior as-is: no new cascade rule.

## File List (files to touch)

### Files to modify
- `src/cnl/compile-data-assets.ts` — expose whether map/pieceCatalog derivation failed
- `src/cnl/compiler-core.ts` — emit cascade diagnostics and null sections based on derivation-failure signals

### New/modified test files
- `test/unit/compiler-structured-results.test.ts` — add cascade-specific assertions

## Out of Scope

- **No changes to** `src/kernel/`
- **No changes to** `data/games/fire-in-the-lake.md`
- **No changes to** existing `lower*` function signatures
- **No cross-reference validation** (Phase 3)
- **eventCardSet** cascade — `eventCards` remains optional; no downstream cascade diagnostic needed

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests
1. **"map data asset failure nulls zones when no explicit YAML zones"** — spec with broken map asset, no explicit zones section → `sections.zones === null`, diagnostic `CNL_DATA_ASSET_CASCADE_ZONES_MISSING` emitted at severity `warning`
2. **"map data asset failure does NOT null zones when explicit YAML zones exist"** — spec with broken map asset BUT explicit zones section → `sections.zones !== null`, no cascade diagnostic
3. **"pieceCatalog failure nulls tokenTypes when no explicit YAML tokenTypes"** — same pattern for pieceCatalog → tokenTypes, diagnostic `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING`
4. **"eventCardSet failure does NOT cascade"** — broken eventCardSet data asset → no cascade diagnostic, `sections.eventCards === null` (direct failure, not cascade)

### Invariants that must remain true
- Cascade diagnostics are severity `warning` (not error) — they explain WHY downstream errors appear
- Cascade only fires when no explicit YAML section exists as fallback
- All cascade diagnostic codes follow the `CNL_DATA_ASSET_CASCADE_*` prefix

## Outcome

- **Completion date**: 2026-02-13
- **What changed**:
  - Added map/pieceCatalog derivation-failure signals to `deriveSectionsFromDataAssets`.
  - Wired cascade diagnostics in `compiler-core`:
    - `CNL_DATA_ASSET_CASCADE_ZONES_MISSING`
    - `CNL_DATA_ASSET_CASCADE_TOKEN_TYPES_MISSING`
  - Updated `compiler-core` behavior so `sections.tokenTypes` becomes `null` when pieceCatalog derivation fails and no explicit YAML `tokenTypes` fallback exists.
  - Added cascade-focused unit coverage in `test/unit/compiler-structured-results.test.ts`.
  - Updated malformed asset golden diagnostics fixture to include the new cascade warning.
- **Deviation from original plan**:
  - Did not modify `src/cnl/compiler-diagnostics.ts`; diagnostic codes are emitted where diagnostics are constructed in current architecture.
  - Updated contract references from `eventDecks` to `eventCards` to match current `CompileSectionResults`.
- **Verification results**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed.
