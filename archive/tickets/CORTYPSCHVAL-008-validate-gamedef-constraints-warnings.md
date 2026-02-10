# CORTYPSCHVAL-008 - `validateGameDef` Constraints, Selectors, and Warnings

**Status**: ✅ COMPLETED

## Goal
Complete remaining `validateGameDef` categories for metadata, bounds, selector constraints, scoring consistency, adjacency warnings, and ownership consistency.

## Reassessed Assumptions (2026-02-10)
- `src/kernel/validate-gamedef.ts` and `test/unit/validate-gamedef.test.ts` already exist and already cover the earlier reference-integrity slice from `CORTYPSCHVAL-007`.
- `src/kernel/index.ts` already exports `validateGameDef`; this ticket should not require API/export changes unless implementation requires new helper exports (none expected).
- Current repository usage treats zone selectors as concrete zone IDs (for example `market:none`) rather than decomposing selector syntax into a separate base-zone lookup; ownership checks in this ticket must align with that current shape.
- `specs/02-core-types-schemas-validation.md` still requires this semantic slice (metadata/selectors/bounds/scoring/adjacency/ownership), so this ticket remains valid but should avoid schema/type redesign.
- Existing tests are unit-style under `test/unit/validate-gamedef.test.ts`; this ticket should extend that file rather than introducing a new suite.

## Updated Scope
- Extend `validateGameDef` with the missing semantic validations from Spec 02:
  - player selector bounds checks (`PlayerSel.id`)
  - metadata validity checks (`players` and `maxTriggerDepth`)
  - variable bound consistency checks (`min <= init <= max`)
  - scoring/end-condition consistency checks
  - adjacency asymmetry warnings
  - ownership selector consistency checks consistent with current concrete zone selector representation
- Add only focused unit tests required to cover these new categories and any discovered edge-case invariants.
- Preserve existing exports and type surface (no breaking API changes).

## File List Expected To Touch
- `src/kernel/validate-gamedef.ts`
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

## Outcome
- Completion date: 2026-02-10
- What was actually changed:
  - Extended `validateGameDef` semantic checks with diagnostics for:
    - `PlayerSel.id` bounds (`PLAYER_SELECTOR_ID_OUT_OF_BOUNDS`)
    - metadata validity (`META_PLAYERS_MIN_INVALID`, `META_PLAYERS_RANGE_INVALID`, `META_MAX_TRIGGER_DEPTH_INVALID`)
    - variable bounds (`VAR_BOUNDS_INVALID`)
    - scoring consistency (`SCORING_REQUIRED_FOR_SCORE_RESULT`, `SCORING_UNUSED`)
    - asymmetric adjacency warnings (`ZONE_ADJACENCY_ASYMMETRIC`)
    - zone selector ownership consistency (`ZONE_SELECTOR_OWNERSHIP_INVALID`)
  - Added/expanded unit tests in `test/unit/validate-gamedef.test.ts` for all acceptance checks and valid baseline behavior.
- Deviations from originally planned assumptions/scope:
  - No `src/kernel/index.ts` update was needed because `validateGameDef` export already existed.
  - Ownership validation was implemented against the repository's current concrete selector usage (for example `market:none`) instead of introducing selector/base-zone decomposition or schema redesign.
- Verification results:
  - `npm test` passed (includes `npm run build` pretest and unit/integration test execution).
