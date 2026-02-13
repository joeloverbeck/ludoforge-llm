# ARCDECANDGEN-011: Rename Operation Types to Pipeline Types

**Status**: ✅ COMPLETED
**Phase**: 4A — part 1 (Unified Action Resolution Pipeline rename across type/compiler/runtime/test layers)
**Priority**: P1
**Complexity**: M
**Dependencies**: ARCDECANDGEN-001 (types split), ARCDECANDGEN-005 (validate-gamedef split), ARCDECANDGEN-006 (schemas split)

## Goal

Rename `OperationProfileDef` → `ActionPipelineDef` and related fields end-to-end so the architecture vocabulary is pipeline-first with no aliases or backward-compat shims. The field renames are:

| Old | New |
|-----|-----|
| `OperationProfileDef` | `ActionPipelineDef` |
| `OperationLegalityDef` | removed — `legality` becomes `ConditionAST` directly |
| `OperationCostDef` | removed — flattened to `costValidation` + `costEffects` |
| `OperationTargetingDef` | `ActionTargetingDef` |
| `OperationResolutionStageDef` | `ActionResolutionStageDef` |
| `OperationProfilePartialExecutionDef` | removed — flattened to `atomicity: 'atomic' \| 'partial'` |
| `GameDef.operationProfiles` | `GameDef.actionPipelines` |
| `GameSpecDoc.operationProfiles` | `GameSpecDoc.actionPipelines` |
| `legality.when` | `legality` (direct ConditionAST) |
| `cost.validate` | `costValidation` |
| `cost.spend` | `costEffects` (required, empty array = no cost) |
| `partialExecution.mode: 'forbid'\|'allow'` | `atomicity: 'atomic'\|'partial'` |
| `resolution` | `stages` |
| `linkedSpecialActivityWindows` | `linkedWindows` |

## Reassessed Assumptions (Discrepancies Found)

The original ticket assumptions did not match repository reality:

- The old contract is not isolated to type/schema files. `operationProfiles` is wired through parser, spec validation, lowering, cross-validation, macro expansion, runtime move execution, and agent dispatch.
- Runtime/compiler changes are required in this same ticket to keep the build green with a hard rename and no aliasing.
- Test impact is broad (unit + integration) because many tests directly construct or assert operation-profile objects and paths.
- Root JSON schema artifacts must be regenerated/updated as part of this ticket because they encode old field names.

## File List (files to touch)

### Files to modify
- Kernel types/schemas/validation/runtime:
  - `src/kernel/types-operations.ts`
  - `src/kernel/types-core.ts`
  - `src/kernel/types.ts` (re-export impact)
  - `src/kernel/schemas-core.ts`
  - `src/kernel/schemas-extensions.ts`
  - `src/kernel/validate-gamedef-structure.ts`
  - `src/kernel/validate-gamedef-extensions.ts`
  - `src/kernel/apply-move.ts`
  - `src/kernel/apply-move-pipeline.ts`
  - `src/kernel/legal-moves.ts`
  - `src/agents/template-completion.ts`
- CNL/GameSpec compiler + validation + parser:
  - `src/cnl/game-spec-doc.ts`
  - `src/cnl/parser.ts`
  - `src/cnl/section-identifier.ts`
  - `src/cnl/validate-spec-shared.ts`
  - `src/cnl/validate-extensions.ts`
  - `src/cnl/validate-spec-core.ts`
  - `src/cnl/compile-operations.ts`
  - `src/cnl/compile-macro-expansion.ts`
  - `src/cnl/compiler-core.ts`
  - `src/cnl/cross-validate.ts`
- Schema artifacts:
  - `schemas/GameDef.schema.json`
  - any generated schema snapshots touched by the rename
- Tests:
  - impacted unit/integration tests and fixtures referencing old names/paths

## Out of Scope

- Redesigning targeting semantics beyond name migration.
- Introducing compatibility aliases (`operationProfiles`, `partialExecution`, `linkedSpecialActivityWindows`, etc.) in parser/runtime/schema.
- Non-related architecture refactors not required for this rename.

## Acceptance Criteria

### Tests that must pass
- `npm run typecheck` — passes
- `npm run lint` — passes
- `npm test` — passes
- Targeted suites covering parser/compiler/runtime pipeline behavior pass after hard rename

### Invariants that must remain true
- The new shapes preserve runtime semantics while renaming/flattening fields.
- `ActionPipelineDef.costEffects` is `readonly EffectAST[]` (required; empty `[]` means no cost).
- `ActionPipelineDef.atomicity` is `'atomic' | 'partial'` (mapping old `forbid` → `atomic`, `allow` → `partial`).
- No backward-compat aliases are accepted in parser/schema/runtime.
- Cross-validation and diagnostics point to new field paths (for example `doc.actionPipelines.*`).
- No `OperationProfileDef`/`operationProfiles` contract remains in source types/runtime/compiler/tests except historical docs/archives.

## Outcome

- **Completion date**: 2026-02-13
- **What changed**:
  - Implemented full hard rename from operation profiles to action pipelines across kernel types, CNL parser/compiler/validators, runtime move resolution, schemas, fixtures, and integration/unit tests.
  - Flattened pipeline fields as specified: `legality`, `costValidation`, `costEffects`, `stages`, `atomicity`, `linkedWindows`.
  - Updated FITL production game data to the new `actionPipelines` contract.
  - Updated `schemas/GameDef.schema.json` to match the new flattened pipeline structure.
- **Deviation vs original plan**:
  - Original ticket claimed type/schema-only scope with runtime/compiler deferred; implementation required and included runtime/compiler/parser/test updates in this ticket due hard-break/no-alias requirement.
- **Verification**:
  - `npm run typecheck` passed.
  - `npm run lint` passed.
  - `npm test` passed (unit + integration).
