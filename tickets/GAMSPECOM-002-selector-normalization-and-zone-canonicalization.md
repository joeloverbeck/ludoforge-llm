# GAMSPECOM-002 - Selector Normalization and Zone Canonicalization

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

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
- `src/cnl/compiler.ts`
- `test/unit/cnl/compile-selectors.test.ts` (new)
- `test/unit/cnl/compile-zones.test.ts` (new)

## Out of Scope
- Macro expansion (`grid`, `hex`, `draw:each`, `refillToSize`, `discardDownTo`).
- Action/effect AST lowering.
- Binding scope validation.
- Spatial adjacency graph validation.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/compile-selectors.test.js`
- `node --test dist/test/unit/cnl/compile-zones.test.js`

### Invariants that must remain true
- No compiled zone id is left as bare base; all compiled IDs are canonicalized.
- `hand:each` never survives to post-expansion/compiled output.
- Normalization is deterministic and independent of source object key order.
- Invalid selector diagnostics include stable `path` and actionable `suggestion` when safely derivable.
