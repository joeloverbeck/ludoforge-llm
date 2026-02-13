# ARCDECANDGEN-011: Rename Operation Types to Pipeline Types

**Phase**: 4A — part 1 (Unified Action Resolution Pipeline — type layer)
**Priority**: P1
**Complexity**: M
**Dependencies**: ARCDECANDGEN-001 (types split), ARCDECANDGEN-005 (validate-gamedef split), ARCDECANDGEN-006 (schemas split)

## Goal

Rename `OperationProfileDef` → `ActionPipelineDef` and all related types. This ticket covers ONLY the type definitions and Zod/JSON schemas — no runtime code changes yet. The field renames are:

| Old | New |
|-----|-----|
| `OperationProfileDef` | `ActionPipelineDef` |
| `OperationLegalityDef` | removed — `legality` becomes `ConditionAST` directly |
| `OperationCostDef` | removed — flattened to `costValidation` + `costEffects` |
| `OperationTargetingDef` | `ActionTargetingDef` |
| `OperationResolutionStageDef` | `ActionResolutionStageDef` |
| `OperationProfilePartialExecutionDef` | removed — flattened to `atomicity: 'atomic' \| 'partial'` |
| `GameDef.operationProfiles` | `GameDef.actionPipelines` |
| `legality.when` | `legality` (direct ConditionAST) |
| `cost.validate` | `costValidation` |
| `cost.spend` | `costEffects` (required, empty array = no cost) |
| `partialExecution.mode: 'forbid'\|'allow'` | `atomicity: 'atomic'\|'partial'` |
| `resolution` | `stages` |
| `linkedSpecialActivityWindows` | `linkedWindows` |

## File List (files to touch)

### Files to modify
- `src/kernel/types-operations.ts` — rename types as listed above
- `src/kernel/types-core.ts` — `GameDef.operationProfiles` → `GameDef.actionPipelines`
- `src/kernel/schemas-extensions.ts` — update JSON Schema for renamed fields
- `src/kernel/validate-gamedef-extensions.ts` — update validation for renamed fields

## Out of Scope

- **No runtime code changes** — `apply-move.ts`, `legal-moves.ts`, `apply-move-pipeline.ts` are updated in ARCDECANDGEN-012
- **No compiler changes** — `compile-operations.ts` is updated in ARCDECANDGEN-013
- **No YAML changes** — `fire-in-the-lake.md` is updated in ARCDECANDGEN-013
- **No GameSpecDoc changes** — `game-spec-doc.ts` is updated in ARCDECANDGEN-013
- **No test changes** beyond what's needed to compile (type-only adjustments in test fixtures)

## Acceptance Criteria

### Tests that must pass
- `npm run typecheck` — passes (this is the primary gate for a types-only rename)
- `npm run lint` — passes
- `npm test` — may require test fixture updates where tests directly construct `OperationProfileDef` objects; those updates are in-scope

### Invariants that must remain true
- The new type shapes are functionally equivalent to the old ones (same data, renamed/flattened fields)
- `ActionPipelineDef.costEffects` is `readonly EffectAST[]` (required, not optional — empty `[]` means no cost)
- `ActionPipelineDef.atomicity` is `'atomic' | 'partial'` (where old `forbid` → `atomic`, old `allow` → `partial`)
- No `OperationProfileDef` string appears in `src/kernel/types-operations.ts`, `types-core.ts`, `schemas-extensions.ts`, or `validate-gamedef-extensions.ts`
