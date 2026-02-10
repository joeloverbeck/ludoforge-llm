# CORTYPSCHVAL-007 - `validateGameDef` Reference Integrity Checks

**Status**: ✅ COMPLETED

## Goal
Implement the first `validateGameDef(def): Diagnostic[]` slice focused on broken references and duplicate identifiers.

## Reassessed Assumptions (2026-02-10)
- `src/kernel/validate-gamedef.ts` does not exist yet and must be created.
- `test/unit/validate-gamedef.test.ts` does not exist yet and must be created.
- `src/kernel/diagnostics.ts` already defines `Diagnostic`; this ticket should consume it without changing diagnostic shape.
- `src/kernel/index.ts` currently does not export `validateGameDef`; it must be updated.
- Scope must match Spec 02 semantic checks for this slice only (reference integrity + duplicate IDs + param-domain checks), leaving metadata/selector/warning checks for later tickets.

## File List Expected To Touch
- `src/kernel/validate-gamedef.ts` (new)
- `src/kernel/index.ts`
- `test/unit/validate-gamedef.test.ts` (new)

## Implementation Notes
Implement diagnostics for these categories:
- Identifier uniqueness across namespaces (`zones`, `tokenTypes`, `phases`, `actions`, `triggers`, vars).
- Zone reference integrity.
- Variable reference integrity (`gvar`, `pvar`).
- Token type integrity (`createToken.type`).
- Phase reference integrity (actions and phase-based triggers).
- Action reference integrity for `actionResolved` trigger events.
- Param domain validity for `tokensInZone` and `intsInRange`.
- Deterministic ordering and stable codes.
- Include `alternatives` suggestions for misspelled references when possible.

## Out Of Scope
- Player selector bounds checks.
- Scoring/end-condition consistency.
- Adjacency symmetry warnings.
- Ownership selector consistency checks.
- Runtime schema validation.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/validate-gamedef.test.ts`:
  - duplicate action ID produces deterministic error diagnostic.
  - missing zone reference produces error diagnostic with suggestion/alternatives.
  - undefined `gvar` reference produces error diagnostic.
  - undefined `pvar` reference produces error diagnostic.
  - invalid phase reference produces error diagnostic with alternatives.
  - invalid action reference in trigger event produces error diagnostic.
  - invalid `createToken` type produces error diagnostic.
  - malformed `intsInRange` domain (`min > max`) produces error diagnostic.

### Invariants That Must Remain True
- Diagnostics are deterministic (same input, same output order).
- Every emitted diagnostic has non-empty `code`, `path`, and `message`.
- Broken references are always severity `error`.

## Outcome
- Completion date: 2026-02-10
- Actually changed:
  - Added `src/kernel/validate-gamedef.ts` with the first semantic `validateGameDef` slice for:
    - duplicate identifiers (zones, token types, phases, actions, triggers, global vars, per-player vars),
    - missing references (zones, gvars, pvars, token types, phases, actions),
    - malformed `intsInRange` domains (`min > max`),
    - deterministic diagnostics with stable `code`/`path`/`severity` and fuzzy `alternatives` suggestions.
  - Exported `validateGameDef` from `src/kernel/index.ts`.
  - Added `test/unit/validate-gamedef.test.ts` covering all acceptance scenarios in this ticket.
- Deviations from original plan:
  - `src/kernel/diagnostics.ts` was not modified because the existing `Diagnostic` shape already satisfied this ticket.
  - Zone reference checks currently validate the selector string as-is against declared zone IDs (no selector decomposition); this matches the current type/schema usage and keeps scope aligned with this ticket.
- Verification results:
  - Ran `npm run test` (includes build + unit/integration targets in this repo) and all tests passed, including the new `validateGameDef` suite.
