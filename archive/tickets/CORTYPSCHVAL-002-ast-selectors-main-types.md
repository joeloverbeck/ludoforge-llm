# CORTYPSCHVAL-002 - Define AST, Selector, and Core Domain Types

**Status**: ✅ COMPLETED

## Goal
Implement exhaustive immutable TypeScript definitions for selectors, ASTs, and main domain types (`GameDef`, `GameState`, runtime logs, agent interface, mechanic bundle).

## Assumptions Reassessed (2026-02-10)
- `src/kernel/types.ts` exists but currently contains only foundation/runtime shell types from ticket 001, not selector/AST/main domain definitions.
- `src/kernel/index.ts` already re-exports `./types.js`, so adding exports in `src/kernel/types.ts` is sufficient for public API surface.
- `test/unit/types-exhaustive.test.ts` does not exist yet and must be created.
- Existing tests include `test/unit/smoke.test.ts` and `test/unit/types-foundation.test.ts`; acceptance should include keeping both passing.
- Spec 02 uses `ParamDef` for action parameters. This ticket keeps compatibility by introducing a `ParamDef` type and exporting `ParameterDef` for mechanic bundle parameters as separately scoped types.

## Updated Scope
- Expand `src/kernel/types.ts` with Spec 02 selector unions, AST unions, core definition/state/runtime interfaces, and mechanic/agent contracts.
- Preserve existing foundation exports and avoid breaking existing runtime shell types.
- Add `test/unit/types-exhaustive.test.ts` for compile-time union exhaustiveness/count invariants and `MoveLog.legalMoveCount`.
- Keep this ticket strictly type-level: no Zod schemas, no JSON schema artifacts, no semantic validators.
- Resolve Spec 02 counting discrepancy by aligning to the enumerated `EffectAST` variants (14 concrete variants), not the stale count text.

## File List Expected To Touch
- `src/kernel/types.ts`
- `test/unit/types-exhaustive.test.ts`
- `tickets/CORTYPSCHVAL-002-ast-selectors-main-types.md`

## Implementation Notes
- Add all selector types: `PlayerSel`, `ZoneSel`, `TokenSel`.
- Add all AST unions exactly as specified:
  - `ConditionAST` (5 groups of variants)
  - `ValueExpr`
  - `Reference`
  - `EffectAST` (14 variants)
  - `OptionsQuery` (8 variants)
- Add full type interfaces: `VariableDef`, `ZoneDef`, `TokenTypeDef`, `Token`, `TurnStructure`, `PhaseDef`, `ActionDef`, `TriggerDef`, `EndCondition`, `ScoringDef`, `GameDef`, `GameState`, `Move`, `MoveLog`, `StateDelta`, `TriggerFiring`, `GameTrace`, `EvalReport`, `Metrics`, `MechanicBundle`, `ParameterDef`, `Agent`.
- Ensure all interface properties are `readonly`.

## Out Of Scope
- Zod schemas.
- JSON schemas.
- Serialization/deserialization helpers.
- `validateGameDef` implementation.

## Acceptance Criteria
### Specific Tests That Must Pass
- `test/unit/types-exhaustive.test.ts`:
  - compile-time exhaustive switch/assert-never checks for `PlayerSel`, `EffectAST`, and `OptionsQuery`.
  - compile-time checks that `EffectAST` models exactly 14 variants (as actually enumerated in Spec 02).
  - compile-time checks that `OptionsQuery` models exactly 8 variants.
  - compile-time checks that `PlayerSel` models exactly 7 variants.
  - compile-time check that `MoveLog` includes `legalMoveCount: number`.
- Existing smoke tests continue passing.

### Invariants That Must Remain True
- `PlayerSel` has exactly 7 variants.
- `EffectAST` has exactly 14 variants.
- `OptionsQuery` has exactly 8 variants.
- `ZoneDef` includes `adjacentTo?: readonly ZoneId[]`.
- All interface fields remain `readonly`.

## Outcome
- Completion date: 2026-02-10
- What actually changed:
  - Expanded `src/kernel/types.ts` from foundation-only runtime shell types to full selector, AST, core domain, runtime log, serialized DTO, mechanic bundle, and agent contract type definitions aligned to Spec 02.
  - Added `test/unit/types-exhaustive.test.ts` with compile-time exhaustiveness assertions for `PlayerSel`, `EffectAST`, and `OptionsQuery`, exact union cardinality checks, and `MoveLog.legalMoveCount` contract coverage.
  - Updated this ticket assumptions/scope/acceptance criteria to reflect current repository state and the `EffectAST` variant-count discrepancy.
- Deviations from original plan:
  - `src/kernel/index.ts` did not require edits because it already re-exported `src/kernel/types.ts`.
  - The stale `EffectAST` count of 13 was corrected to 14, matching the actually enumerated variants in Spec 02.
- Verification:
  - `npm test` passed, including `dist/test/unit/types-exhaustive.test.js`, `dist/test/unit/types-foundation.test.js`, and `dist/test/unit/smoke.test.js`.
