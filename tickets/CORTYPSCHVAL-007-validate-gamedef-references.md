# CORTYPSCHVAL-007 - `validateGameDef` Reference Integrity Checks

## Goal
Implement the first `validateGameDef(def): Diagnostic[]` slice focused on broken references and duplicate identifiers.

## File List Expected To Touch
- `src/kernel/validate-gamedef.ts`
- `src/kernel/diagnostics.ts`
- `src/kernel/index.ts`
- `test/unit/validate-gamedef.test.ts`

## Implementation Notes
Implement diagnostics for these categories:
- Identifier uniqueness across namespaces (`zones`, `tokenTypes`, `phases`, `actions`, `triggers`, vars).
- Zone reference integrity.
- Variable reference integrity (`gvar`, `pvar`).
- Token type integrity (`createToken.type`).
- Phase reference integrity (actions and phase-based triggers).
- Action reference integrity for `actionResolved` trigger events.
- Param domain validity for `tokensInZone` and `intsInRange`.
- Include deterministic ordering and stable codes.
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
