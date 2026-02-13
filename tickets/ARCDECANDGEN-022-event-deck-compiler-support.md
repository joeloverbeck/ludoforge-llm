# ARCDECANDGEN-022: Event Deck Compiler Support

**Phase**: 8C (Generic Event Deck Subsystem — compiler)
**Priority**: P2
**Complexity**: M
**Dependencies**: ARCDECANDGEN-020 (event deck types), ARCDECANDGEN-008 (CompileSectionResults), ARCDECANDGEN-010 (cross-validation)

## Goal

Add compiler support for the new `eventDecks` GameSpecDoc YAML section with proper ASTs. Maintain backward compatibility with the legacy `eventCardSet` data asset path (with deprecation warning). Add event deck cross-references to the cross-validation pass.

## File List (files to touch)

### Files to modify
- `src/cnl/compile-event-cards.ts` — add `lowerEventDecks` for new YAML path; update `lowerEventCards` to emit deprecation warning and convert to `EventDeckDef`
- `src/cnl/game-spec-doc.ts` — add `eventDecks` section to GameSpecDoc type
- `src/cnl/validate-extensions.ts` — validate `eventDecks` section structure
- `src/cnl/cross-validate.ts` — add cross-refs for eventDecks (drawZone → zones, discardZone → zones, effect zone refs → zones)
- `src/cnl/compiler-core.ts` — wire `lowerEventDecks` into compilation pipeline
- `src/cnl/section-identifier.ts` — recognize `eventDecks` section

### New/modified test files
- `test/unit/event-deck.test.ts` — add compiler-focused tests
- `test/integration/event-deck-integration.test.ts` — add FITL-specific tests

## Out of Scope

- **No kernel execution changes** (done in 021)
- **No `cardDriven` interaction** (done in 023)
- **No full FITL event YAML migration** — this spec defines compiler support; migrating all FITL event data is a separate effort
- **No changes to** `src/kernel/` (beyond cross-validate imports)
- **No changes to** `src/agents/`, `src/sim/`

## Acceptance Criteria

### Tests that must pass
- All existing tests pass
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests
1. **"eventDecks YAML section compiles to EventDeckDef[]"** — one deck with 2 cards → correct structure with `EffectAST[]`
2. **"eventDecks cross-ref validates drawZone exists"** — nonexistent drawZone → diagnostic
3. **"legacy eventCardSet data asset compiles with deprecation warning"** — old path → succeeds with warning
4. **"both eventDecks and eventCardSet produce same GameDef structure"** — compile same cards via both paths → deep-equal
5. **"FITL event cards compile via eventDecks with proper ASTs"** (integration) — `compileProductionSpec()`, all sides have `EffectAST[]`
6. **"FITL event deck cross-refs pass validation"** (integration) — zero `CNL_XREF_*` diagnostics for event decks

### Invariants that must remain true
- Legacy `eventCardSet` data asset path still works with deprecation warning
- Both YAML paths compile to the same `GameDef.eventDecks` field
- Event deck cross-refs (drawZone, discardZone) are validated by cross-validation pass
- `eventDecks` is optional — absent section produces no diagnostics
