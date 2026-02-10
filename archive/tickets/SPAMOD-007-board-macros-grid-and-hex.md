# SPAMOD-007 - Board Macros: `grid(rows, cols)` and `hex(radius)`

**Status**: ✅ COMPLETED  
**Spec**: `specs/07-spatial-model.md`  
**Depends on**: `SPAMOD-002`

## Goal
Add compiler-facing board topology generators so authored game definitions can declare deterministic spatial layouts without manual adjacency boilerplate.

## Assumptions Reassessed
- `src/cnl/compiler.ts` does not currently exist, and there is no active CNL compiler pipeline in this repository yet.
- `src/cnl/index.ts` is currently a stub module with no macro exports.
- Spatial graph/runtime infrastructure from `SPAMOD-002` is already implemented and can be reused in tests to verify macro topology invariants.
- Therefore, this ticket should deliver compiler-facing **macro expansion primitives** (with diagnostics) without introducing a new compiler implementation in scope.

## Scope
- Implement macro generators:
  - `generateGrid(rows, cols)` with `cell_<row>_<col>` IDs and 4-neighbor adjacency
  - `generateHex(radius)` with axial coordinates and `hex_<q>_<r>` IDs (`n` prefix for negatives)
- Validate macro parameters and return diagnostics on invalid input through macro expansion APIs.
- Add CNL module integration points by exporting macro expansion APIs from `src/cnl/index.ts` (no new compiler pipeline).
- Ensure generated zones include default attrs:
  - `owner: 'none'`
  - `visibility: 'public'`
  - `ordering: 'set'`

## File List Expected To Touch
- `src/cnl/expand-macros.ts` (new)
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
  - invalid params (`grid(0,3)`, `grid(2,-1)`, `hex(-1)`, non-integers) return diagnostics from macro expansion APIs.
- `npm run typecheck`

## Invariants That Must Remain True
- Macro outputs contain no dangling adjacency references.
- Generated adjacency is symmetric by construction.
- Generation order is deterministic for identical inputs.

## Outcome
- **Completion date**: 2026-02-10
- **What changed vs plan**:
  - Added `src/cnl/expand-macros.ts` with `generateGrid`, `generateHex`, and `expandBoardMacro` (diagnostic-returning expansion entrypoint).
  - Updated `src/cnl/index.ts` to export macro APIs.
  - Added `test/unit/board-macros.test.ts` covering topology generation, deterministic naming/order, symmetry, zone-count formula checks, and invalid-argument diagnostics.
- **Deviations from original plan**:
  - Did not add `src/cnl/compiler.ts`; the repository currently has no compiler pipeline to integrate with, so this ticket now provides compiler-facing primitives and index exports only.
- **Verification results**:
  - `npm run build` passed.
  - `node --test dist/test/unit/board-macros.test.js` passed.
  - `npm run test:unit` passed.
  - `npm run typecheck` passed.
