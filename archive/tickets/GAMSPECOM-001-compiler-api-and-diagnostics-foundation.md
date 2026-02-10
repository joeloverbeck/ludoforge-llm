# GAMSPECOM-001 - Compiler API and Diagnostics Foundation

**Status**: ✅ COMPLETED  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Create the compiler entry-point contracts, compile limits plumbing, and deterministic diagnostic utilities required by all later compiler tickets.

## Assumption Reassessment (2026-02-10)
- `src/cnl/expand-macros.ts` already exists and currently implements board-macro helpers (`generateGrid`, `generateHex`, `expandBoardMacro`); this ticket should not replace that file or broaden macro behavior.
- Unit tests in this repository are organized under `test/unit/` (not `test/unit/cnl/`), so ticket test paths are updated to match real project layout.
- No compiler surface exists yet (`src/cnl/compiler.ts`, `src/cnl/compiler-diagnostics.ts` are absent), so this ticket remains responsible for introducing API contracts and deterministic diagnostic helpers as a foundation only.
- Full `GameSpecDoc -> GameDef` lowering is not present and remains explicitly out of scope for this ticket; a temporary total contract is acceptable as long as deterministic diagnostics and limits plumbing are in place.

## Implementation Tasks
1. Add `CompileLimits` and `CompileOptions` types matching Spec 08b defaults.
2. Add `compileGameSpecToGameDef` and `expandMacros` API signatures to a new compiler surface.
3. Implement diagnostic helper utilities for:
   - canonical severity ranking
   - deterministic sort keys
   - duplicate diagnostic suppression
   - diagnostic cap (`maxDiagnosticCount`)
4. Export new compiler APIs from `src/cnl/index.ts`.
5. Add API-shape and deterministic-order unit tests for the helpers.

## File List (Expected to Touch)
- `src/cnl/compiler.ts` (new)
- `src/cnl/compiler-diagnostics.ts` (new)
- `src/cnl/index.ts`
- `test/unit/compiler-api.test.ts` (new)
- `test/unit/compiler-diagnostics.test.ts` (new)

## Out of Scope
- Any semantic lowering from `GameSpecDoc` into `GameDef` fields.
- Macro expansion behavior.
- Selector normalization.
- Adjacency or `validateGameDef` integration.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/compiler-api.test.js`
- `node --test dist/test/unit/compiler-diagnostics.test.js`

### Invariants that must remain true
- Compiler APIs are total contracts: callers always get `{ gameDef, diagnostics }` objects, never thrown user-input exceptions.
- Diagnostic ordering is deterministic for identical input diagnostics.
- Every emitted diagnostic includes non-empty `code`, `path`, `severity`, and `message`.
- `CompileLimits` defaults remain: `maxExpandedEffects=20000`, `maxGeneratedZones=10000`, `maxDiagnosticCount=500`.

## Outcome
- Completion date: 2026-02-10
- Actually changed:
  - Added `src/cnl/compiler.ts` with `CompileLimits`, `CompileOptions`, limit-resolution plumbing, `expandMacros` contract surface, and a total `compileGameSpecToGameDef` foundation return shape.
  - Added `src/cnl/compiler-diagnostics.ts` with deterministic severity ranking, source-aware sort key/comparator, duplicate suppression, and `maxDiagnosticCount` capping.
  - Exported compiler APIs via `src/cnl/index.ts`.
  - Added unit tests: `test/unit/compiler-api.test.ts` and `test/unit/compiler-diagnostics.test.ts`.
- Deviations from original plan:
  - Ticket assumptions were corrected first to match actual repo structure (`test/unit/...` paths) and existing board-macro utilities in `src/cnl/expand-macros.ts`.
  - No semantic lowering was added; `compileGameSpecToGameDef` intentionally remains a foundation stub with deterministic diagnostics until later GAMSPECOM tickets.
- Verification results:
  - `npm run build` passed.
  - `node --test dist/test/unit/compiler-api.test.js` passed.
  - `node --test dist/test/unit/compiler-diagnostics.test.js` passed.
  - `npm test` passed.
