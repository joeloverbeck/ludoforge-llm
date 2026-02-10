# SPAMOD-007 - Board Macros: `grid(rows, cols)` and `hex(radius)`

**Status**: Proposed  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-002`

## Goal
Add compiler-facing board topology generators so authored game definitions can declare deterministic spatial layouts without manual adjacency boilerplate.

## Scope
- Implement macro generators:
  - `generateGrid(rows, cols)` with `cell_<row>_<col>` IDs and 4-neighbor adjacency
  - `generateHex(radius)` with axial coordinates and `hex_<q>_<r>` IDs (`n` prefix for negatives)
- Validate macro parameters and return diagnostics on invalid input.
- Add CNL/compiler integration points for macro expansion.
- Ensure generated zones include default attrs:
  - `owner: 'none'`
  - `visibility: 'public'`
  - `ordering: 'set'`

## File List Expected To Touch
- `src/cnl/expand-macros.ts` (new)
- `src/cnl/compiler.ts` (new or modify if introduced by adjacent ticket)
- `src/cnl/index.ts`
- `test/unit/board-macros.test.ts` (new)

## Out Of Scope
- Kernel query/effect runtime behavior.
- Runtime adjacency diagnostics for hand-authored zones.
- Parser grammar redesign outside macro invocation support.
- Non-required macro families beyond `grid` and `hex`.

## Acceptance Criteria
## Specific Tests That Must Pass
- `test/unit/board-macros.test.ts`
  - `grid(3,3)` count, naming, and symmetric 4-connectivity.
  - `grid(1,1)` yields single isolated zone.
  - `hex(0)`, `hex(1)`, `hex(2)` satisfy expected zone-count formula.
  - `hex` neighbor cardinality patterns are valid for generated topology.
  - invalid params (`grid(0,3)`, `grid(2,-1)`, `hex(-1)`, non-integers) return diagnostics.
- `npm run typecheck`

## Invariants That Must Remain True
- Macro outputs contain no dangling adjacency references.
- Generated adjacency is symmetric by construction.
- Generation order is deterministic for identical inputs.

