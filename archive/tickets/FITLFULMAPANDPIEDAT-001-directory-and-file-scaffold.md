# FITLFULMAPANDPIEDAT-001: Create data/games/ directory and fire-in-the-lake.md scaffold

**Status**: ✅ COMPLETED
**Spec**: 23 (Full Map and Piece Data)
**Priority**: P0
**Depends on**: Nothing
**Blocks**: FITLFULMAPANDPIEDAT-002 through FITLFULMAPANDPIEDAT-008

## Description

Create the `data/games/` directory structure and the initial `fire-in-the-lake.md` GameSpecDoc file with the outer YAML scaffold: metadata, `dataAssets` array containing three empty-payload envelopes for `map`, `pieceCatalog`, and `scenario` kinds. The file must parse via the existing `parseGameSpec` without errors (YAML syntax valid, sections recognized).

This ticket establishes the canonical file path and data-asset envelope structure. Subsequent tickets populate the payloads.

## Assumption reassessment (updated)

- The repository currently does not contain a `data/` directory, so this ticket must create both `data/` and `data/games/` before adding `fire-in-the-lake.md`.
- `parseGameSpec` parses fenced YAML blocks and does not require full semantic validation for this scaffold ticket; acceptance should focus on parse success and section shape.
- Empty envelope payloads for `map`, `pieceCatalog`, and `scenario` are acceptable at this stage, with semantic completeness deferred to tickets 002–008 and 009.

## File list

| File | Action |
|------|--------|
| `data/` | **Create directory** |
| `data/games/` | **Create directory** |
| `data/games/fire-in-the-lake.md` | **Create** |

## Out of scope

- Map spaces, adjacency, piece types, inventory, tracks, lattices (tickets 002–007)
- Scenario initial placements (Spec 24)
- Any changes to `src/` code
- Any changes to existing test fixtures in `test/fixtures/cnl/compiler/fitl-*.md`
- Any changes to existing integration tests

## Acceptance criteria

### Tests that must pass

- `npm run build` succeeds
- `npm test` passes (all existing tests unaffected)
- New unit test: `test/unit/fitl-production-data-scaffold.test.ts`
  - Reads `data/games/fire-in-the-lake.md` and calls `parseGameSpec`
  - Asserts the result has `dataAssets` with 3 entries (kinds: `map`, `pieceCatalog`, `scenario`)
  - Asserts `metadata.id` is `fire-in-the-lake`

### Invariants that must remain true

- No existing test file is modified
- No `src/` file is modified
- The `test/fixtures/cnl/compiler/fitl-*.md` fixtures remain unchanged
- All existing integration tests pass without modification

## Outcome

- Completion date: 2026-02-12
- What changed:
  - Created `data/games/fire-in-the-lake.md` with scaffold metadata and three `dataAssets` envelopes (`map`, `pieceCatalog`, `scenario`) using empty payload objects.
  - Added `test/unit/fitl-production-data-scaffold.test.ts` to verify parse success and scaffold shape.
  - Created `data/` and `data/games/` directories required by the canonical production path.
- Deviations from original plan:
  - The original file list omitted directory creation; ticket scope was corrected to include `data/` and `data/games/`.
  - Verification additionally included a direct run of the new compiled unit test (`node --test dist/test/unit/fitl-production-data-scaffold.test.js`) before full suite execution.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/fitl-production-data-scaffold.test.js` passed.
  - `npm test` passed.
