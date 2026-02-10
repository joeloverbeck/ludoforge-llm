# GAMSPECOM-003 - Macro Expansion: Board Macros and draw:each

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Reassessed Assumptions (2026-02-10)
- `src/cnl/expand-macros.ts` already implements deterministic board macro primitives (`expandBoardMacro`, `generateGrid`, `generateHex`) with argument validation and dedicated diagnostics.
- `src/cnl/compiler.ts` currently owns the public `expandMacros` API but still returns the input document unchanged.
- Existing board macro coverage is in `test/unit/board-macros.test.ts`; the `test/unit/cnl/...` paths in this ticket are not aligned with the repository test layout.
- Full semantic lowering is still out of scope for this ticket; this ticket only needs deterministic macro-sugar elimination at the `GameSpecDoc` level.

## Goal
Extend macro expansion to cover deterministic board macros (`grid`, `hex`) and `draw:each` expansion into explicit effect AST structures.

## Implementation Tasks
1. Update `expandMacros` (in `src/cnl/compiler.ts`) to expand zone entries shaped as board macros:
   - `doc.zones[*] = { macro: 'grid', args: [rows, cols] }`
   - `doc.zones[*] = { macro: 'hex', args: [radius] }`
   - Use existing `expandBoardMacro` for deterministic expansion and diagnostics.
2. Implement `draw:each` sugar expansion in effect arrays:
   - Rewrite `draw: { ..., to: 'hand:each', ... }` to a deterministic `forEach` over `{ query: 'players' }`, binding `$p`, and nested `draw` with `to: 'hand:$p'`.
3. Enforce compile limits during macro expansion:
   - `maxGeneratedZones` for generated board zones.
   - `maxExpandedEffects` for additional expanded effect nodes from sugar expansion.
4. Add focused unit coverage for doc-level board macro and `draw:each` expansion behavior.

## File List (Expected to Touch)
- `src/cnl/compiler.ts`
- `src/cnl/expand-macros.ts` (only if helper extraction is needed)
- `test/unit/compiler-api.test.ts`
- `test/unit/expand-macros.test.ts` (new)

## Out of Scope
- `refillToSize` and `discardDownTo` expansion.
- Full `GameSpecDoc -> GameDef` lowering.
- `validateGameDef` post-compile validation.
- Changes to public compiler API signatures.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/board-macros.test.js`
- `node --test dist/test/unit/compiler-api.test.js`
- `node --test dist/test/unit/expand-macros.test.js`

### Invariants that must remain true
- `grid(3,3)` deterministically produces 9 generated cells in stable order.
- `hex(1)` deterministically produces 7 generated cells in stable order.
- Invalid macro parameters produce blocking diagnostics and remove the invalid macro from generated zones.
- `draw:each` sugar is fully eliminated from expanded documents.

## Outcome
- **Completion date**: 2026-02-10
- **What changed**:
  - Implemented doc-level macro expansion in `expandMacros` within `src/cnl/compiler.ts`.
  - Added zone macro expansion support for zone entries shaped as `{ macro, args }` using existing board macro primitives.
  - Added `draw:each` sugar expansion into deterministic `forEach` + `draw to: hand:$p` across setup/action/trigger/phase effect arrays, including nested `if`, `forEach`, and `let` effect blocks.
  - Enforced `maxGeneratedZones` and `maxExpandedEffects` with deterministic compiler diagnostics.
  - Added focused coverage in `test/unit/expand-macros.test.ts` and updated `test/unit/compiler-api.test.ts` for non-mutating expanded-doc return behavior.
- **Deviations from original plan**:
  - No changes were needed in `src/cnl/expand-macros.ts`; existing helpers were reused directly.
  - Test layout was corrected to repository conventions (`test/unit/...`), replacing the initially assumed `test/unit/cnl/...` paths.
- **Verification**:
  - `npm run build` passed.
  - `node --test dist/test/unit/board-macros.test.js dist/test/unit/compiler-api.test.js dist/test/unit/expand-macros.test.js` passed.
  - `npm test` passed.
