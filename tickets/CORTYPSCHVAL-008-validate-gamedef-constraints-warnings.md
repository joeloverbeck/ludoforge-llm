# CORTYPSCHVAL-008 - `validateGameDef` Constraints, Selectors, and Warnings

## Goal
Complete remaining `validateGameDef` categories for metadata, bounds, selector constraints, scoring consistency, adjacency warnings, and ownership consistency.

## File List Expected To Touch
- `src/kernel/validate-gamedef.ts`
- `src/kernel/index.ts`
- `test/unit/validate-gamedef.test.ts`

## Implementation Notes
Add diagnostic categories for:
- `PlayerSel.id` bounds validity.
- metadata validity (`players.min >= 1`, `min <= max`, integer `maxTriggerDepth >= 1`).
- variable bounds consistency (`min <= init <= max`).
- scoring/end-condition consistency (`score` result requires `def.scoring`, warning for unused scoring config).
- adjacency consistency warnings for asymmetric `adjacentTo` links.
- ownership consistency (`:none` only for unowned zones; owner-qualified selectors only for `owner: 'player'` zones).

## Out Of Scope
- Adding new schema types or AST variants.
- JSON schema generation.
- Serializer changes.
- Kernel behavior/runtime execution logic.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/validate-gamedef.test.ts`:
  - `PlayerSel.id` outside bounds yields error.
  - invalid players metadata yields error.
  - invalid `maxTriggerDepth` yields error.
  - variable bounds inconsistency yields error.
  - score end-condition without `scoring` yields error.
  - `scoring` configured but no score-capable usage yields warning.
  - asymmetric adjacency yields warning.
  - ownership selector mismatch yields error.
  - fully valid game def returns `[]` diagnostics.

### Invariants That Must Remain True
- Warnings remain non-blocking (`severity: 'warning'`).
- Error-level diagnostics are used for broken constraints.
- `validateGameDef` remains pure and deterministic.
