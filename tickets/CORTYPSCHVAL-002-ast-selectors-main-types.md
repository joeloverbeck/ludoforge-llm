# CORTYPSCHVAL-002 - Define AST, Selector, and Core Domain Types

## Goal
Implement exhaustive immutable TypeScript definitions for selectors, ASTs, and main domain types (`GameDef`, `GameState`, runtime logs, agent interface, mechanic bundle).

## File List Expected To Touch
- `src/kernel/types.ts`
- `src/kernel/index.ts`
- `test/unit/types-exhaustive.test.ts`

## Implementation Notes
- Add all selector types: `PlayerSel`, `ZoneSel`, `TokenSel`.
- Add all AST unions exactly as specified:
  - `ConditionAST` (5 groups of variants)
  - `ValueExpr`
  - `Reference`
  - `EffectAST` (13 variants)
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
  - compile-time checks that `EffectAST` models exactly 13 variants.
  - compile-time checks that `OptionsQuery` models exactly 8 variants.
  - compile-time checks that `PlayerSel` models exactly 7 variants.
  - compile-time check that `MoveLog` includes `legalMoveCount: number`.
- Existing smoke tests continue passing.

### Invariants That Must Remain True
- `PlayerSel` has exactly 7 variants.
- `EffectAST` has exactly 13 variants.
- `OptionsQuery` has exactly 8 variants.
- `ZoneDef` includes `adjacentTo?: readonly ZoneId[]`.
- All interface fields remain `readonly`.
