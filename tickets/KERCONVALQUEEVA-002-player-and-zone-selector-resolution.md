# KERCONVALQUEEVA-002 - Player and Zone Selector Resolution

**Status**: TODO

## Goal
Implement deterministic selector resolution primitives for players and zones, including scalar cardinality helpers.

## Scope
- Add `resolvePlayerSel`, `resolveSinglePlayerSel` with support for all Spec 04 `PlayerSel` forms.
- Add `resolveZoneSel`, `resolveSingleZoneSel` for `zoneId:ownerSpec` parsing and expansion.
- Enforce deduplication + deterministic sorting (`PlayerId` ascending, `ZoneId` lexicographic).
- Return descriptive cardinality and missing-selector errors via `EvalError`.

## File List Expected To Touch
- `src/kernel/resolve-selectors.ts`
- `src/kernel/index.ts`
- `test/unit/resolve-selectors.test.ts`

## Out Of Scope
- Query execution over resolved selectors.
- Reference/value/condition evaluation.
- Spatial graph traversal (`adjacent`/`connected`) semantics.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/resolve-selectors.test.ts`:
  - `'actor'`, `'active'`, `'all'`, `'allOther'`, `{ id }`, `{ chosen }`, `{ relative: 'left'|'right' }` resolve correctly.
  - `resolvePlayerSel('all')` is sorted and deduplicated.
  - invalid `{ id }` and non-player `{ chosen }` throw typed errors.
  - `resolveZoneSel('deck:none')`, `resolveZoneSel('hand:actor')`, `resolveZoneSel('hand:all')` resolve correctly.
  - unknown zone base/owner variant throws descriptive error with candidates.
  - `resolveSinglePlayerSel` and `resolveSingleZoneSel` throw `SELECTOR_CARDINALITY` on 0 or >1 matches.
- Existing schema tests remain green:
  - `test/unit/schemas-ast.test.ts`

### Invariants That Must Remain True
- Selector resolution is pure and does not mutate `def`, `state`, or `bindings`.
- Deterministic ordering contract is preserved for all multi-result selectors.
- Scalar helper functions never silently choose from multi-target results.
