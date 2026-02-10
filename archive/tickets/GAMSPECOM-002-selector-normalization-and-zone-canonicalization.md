# GAMSPECOM-002 - Selector Normalization and Zone Canonicalization

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Reassessed Assumptions (2026-02-10)
- `src/cnl/compiler.ts` currently provides API/diagnostic scaffolding and intentionally returns `CNL_COMPILER_NOT_IMPLEMENTED` for semantic lowering.
- `src/cnl/compile-selectors.ts` and `src/cnl/compile-zones.ts` do not exist yet and should be introduced as focused utilities.
- Unit tests in this repository are under `test/unit/` (not `test/unit/cnl/`), and compiled tests run from `dist/test/unit/`.
- This ticket should deliver deterministic selector/zone normalization primitives and materialization utilities, without attempting full `compileGameSpecToGameDef` integration (covered by later compiler tickets).

## Goal
Implement deterministic normalization of player selectors and zone selectors, including zone-owner materialization rules required by runtime contracts.

## Implementation Tasks
1. Add `compile-selectors` utilities for player selector normalization:
   - `activePlayer|active -> 'active'`
   - `actor -> 'actor'`
   - `all -> 'all'`
   - `allOther -> 'allOther'`
   - `left|right -> { relative: ... }`
   - numeric strings -> `{ id: number }`
   - `$binding` -> `{ chosen: '$binding' }` in `PlayerSel` contexts.
2. Add zone selector canonicalization to `zoneBase:qualifier` form.
3. Implement ambiguity/error diagnostics for bare-zone selectors that cannot resolve uniquely.
4. Implement zone owner materialization for compiled zone defs:
   - unowned base zones => `base:none`
   - `owner: player` => `base:0..(players.max-1)`.
5. Add focused tests for selector normalization and materialization.

## File List (Expected to Touch)
- `src/cnl/compile-selectors.ts` (new)
- `src/cnl/compile-zones.ts` (new)
- `src/cnl/index.ts`
- `test/unit/compile-selectors.test.ts` (new)
- `test/unit/compile-zones.test.ts` (new)

## Out of Scope
- Macro expansion (`grid`, `hex`, `draw:each`, `refillToSize`, `discardDownTo`).
- Action/effect AST lowering.
- Binding scope validation.
- Spatial adjacency graph validation.
- End-to-end `compileGameSpecToGameDef` lowering integration beyond exposing reusable normalization/materialization helpers.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compile-selectors.test.js`
- `node --test dist/test/unit/compile-zones.test.js`

### Invariants that must remain true
- No materialized zone def id is left as a bare base; generated zone ids are canonicalized.
- Zone selectors are emitted in `zoneBase:qualifier` form when normalization succeeds.
- Bare selectors for player-owned or mixed bases emit deterministic ambiguity diagnostics.
- Invalid selector diagnostics include stable `path` and actionable `suggestion` when safely derivable.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Added `src/cnl/compile-selectors.ts` with deterministic player selector normalization and zone-owner qualifier normalization.
  - Added `src/cnl/compile-zones.ts` with zone materialization (`base:none`, `base:0..max-1`) and zone selector canonicalization plus ambiguity/unknown-base diagnostics.
  - Exported new compiler utilities from `src/cnl/index.ts`.
  - Added focused unit coverage in `test/unit/compile-selectors.test.ts` and `test/unit/compile-zones.test.ts`.
- **Deviations from original plan**:
  - Full `compileGameSpecToGameDef` lowering integration remains deferred, consistent with reassessed scope and downstream tickets.
  - Test paths were corrected from `test/unit/cnl/...` to the repository's actual `test/unit/...` structure.
- **Verification**:
  - `npm run build` passed.
  - `node --test dist/test/unit/compile-selectors.test.js` passed.
  - `node --test dist/test/unit/compile-zones.test.js` passed.
  - `npm test` passed.
