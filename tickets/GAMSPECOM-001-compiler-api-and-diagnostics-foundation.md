# GAMSPECOM-001 - Compiler API and Diagnostics Foundation

**Status**: TODO  
**Spec**: `specs/08b-game-spec-compiler.md`

## Goal
Create the compiler entry-point contracts, compile limits plumbing, and deterministic diagnostic utilities required by all later compiler tickets.

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
- `test/unit/cnl/compiler-api.test.ts` (new)
- `test/unit/cnl/compiler-diagnostics.test.ts` (new)

## Out of Scope
- Any semantic lowering from `GameSpecDoc` into `GameDef` fields.
- Macro expansion behavior.
- Selector normalization.
- Adjacency or `validateGameDef` integration.

## Acceptance Criteria
### Specific tests that must pass
- `npm run build`
- `node --test dist/test/unit/cnl/compiler-api.test.js`
- `node --test dist/test/unit/cnl/compiler-diagnostics.test.js`

### Invariants that must remain true
- Compiler APIs are total contracts: callers always get `{ gameDef, diagnostics }` objects, never thrown user-input exceptions.
- Diagnostic ordering is deterministic for identical input diagnostics.
- Every emitted diagnostic includes non-empty `code`, `path`, `severity`, and `message`.
- `CompileLimits` defaults remain: `maxExpandedEffects=20000`, `maxGeneratedZones=10000`, `maxDiagnosticCount=500`.
