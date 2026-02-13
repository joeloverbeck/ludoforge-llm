# ARCDECANDGEN-008: Add `CompileSectionResults` to compiler output

**Phase**: 2A (Structured Compile Results)
**Priority**: P1
**Complexity**: M
**Dependencies**: ARCDECANDGEN-002 (compiler split must be done first)

## Goal

Change the return type of `compileGameSpecToGameDef` to include a `sections` field that captures each section's compile output independently. This enables partial compile results when only some sections fail, and prepares for cross-reference validation (Phase 3).

## File List (files to touch)

### Files to modify
- `src/cnl/compiler-core.ts` — add `CompileResult` and `CompileSectionResults` types; modify `compileExpandedDoc` to build `sections` incrementally as each `lower*` succeeds; wrap each `lower*` call in try-catch; assemble `gameDef` from `sections` only when all required sections succeeded
- `src/cnl/index.ts` — export `CompileResult` and `CompileSectionResults`

### Files that may need minor adjustments
- Callers of `compileGameSpecToGameDef` that destructure the return value — should still work since `gameDef` and `diagnostics` remain unchanged

### New test file to create
- `test/unit/compiler-structured-results.test.ts`

## Out of Scope

- **No changes to any `lower*` function signatures** — they still return individual section results
- **No changes to** `src/kernel/`, `src/agents/`, `src/sim/`
- **No changes to** GameSpecDoc YAML format
- **No changes to** `data/games/fire-in-the-lake.md`
- **No new diagnostic codes** (those come in ARCDECANDGEN-009)
- **No cross-reference validation** (that comes in ARCDECANDGEN-010)

## Acceptance Criteria

### Tests that must pass
- All 1078 existing tests pass (backward compatible — `result.gameDef` and `result.diagnostics` unchanged)
- `npm run typecheck` — passes
- `npm run lint` — passes

### New tests (in `test/unit/compiler-structured-results.test.ts`)
1. **"valid spec produces non-null gameDef and fully populated sections"** — compile `compile-valid.md`, assert `gameDef !== null`, assert every field in `sections` is non-null, assert `sections.zones` deep-equals `gameDef.zones` (and so on)
2. **"spec with broken actions still compiles zones and metadata"** — construct spec with valid metadata + zones but malformed actions, assert `gameDef === null`, `sections.metadata !== null`, `sections.zones !== null`, `sections.actions === null`
3. **"spec with broken metadata nulls gameDef but compiles zones"** — invalid metadata (empty id) but valid zones, assert `gameDef === null`, `sections.metadata === null`, `sections.zones !== null`
4. **"sections match gameDef fields exactly for production FITL spec"** — `compileProductionSpec()`, for each non-null field in `sections` assert deep equality with corresponding `gameDef` field
5. **"CompileSectionResults type has a key for every GameDef field"** — static type-level exhaustiveness check

### Invariants that must remain true
- `result.gameDef` is non-null if and only if `result.diagnostics` contains zero error-severity entries
- For a valid spec, every field in `result.sections` is non-null and matches the corresponding `gameDef` field
- For a spec with errors in only one section, all other sections compile to non-null values
- `result.gameDef === null` does NOT imply all sections are null
- Any code that only reads `result.gameDef` and `result.diagnostics` works identically (backward compat)
