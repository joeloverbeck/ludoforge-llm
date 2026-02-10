# GAMSPECOM-003 - Macro Expansion: Board Macros and draw:each

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Extend macro expansion to cover deterministic board macros (`grid`, `hex`) and `draw:each` expansion into explicit effect AST structures.

## Implementation Tasks
1. Update `expandMacros` to expand `grid(rows, cols)` using `generateGrid` with strict integer validation.
2. Update `expandMacros` to expand `hex(radius)` using `generateHex` with strict integer validation.
3. Implement expansion of `draw: { ..., to: 'hand:each', ... }` into deterministic `forEach` + `draw to: hand:$p` structure.
4. Enforce `maxGeneratedZones` and `maxExpandedEffects` during expansion.
5. Add unit tests for valid/invalid board macro args and `draw:each` output shape.

## File List (Expected to Touch)
- `src/cnl/expand-macros.ts`
- `src/cnl/compiler-diagnostics.ts`
- `test/unit/cnl/expand-macros-board.test.ts` (new)
- `test/unit/cnl/expand-macros-draw-each.test.ts` (new)

## Out of Scope
- `refillToSize` and `discardDownTo` expansion.
- Full `GameSpecDoc -> GameDef` lowering.
- `validateGameDef` post-compile validation.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/expand-macros-board.test.js`
- `node --test dist/test/unit/cnl/expand-macros-draw-each.test.js`
- Existing `node --test dist/test/unit/board-macros.test.js`

### Invariants that must remain true
- `grid(3,3)` deterministically produces 9 generated cells in stable order.
- `hex(1)` deterministically produces 7 generated cells in stable order.
- Invalid macro parameters produce blocking diagnostics and prevent valid compile output.
- `draw:each` sugar is fully eliminated from expanded documents.
