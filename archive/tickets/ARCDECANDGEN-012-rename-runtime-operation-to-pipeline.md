# ARCDECANDGEN-012: Rename Runtime Operation Helpers to Pipeline Terminology

**Status**: ✅ COMPLETED
**Phase**: 4A — part 2 (Unified Action Resolution Pipeline — runtime layer)
**Priority**: P1
**Complexity**: S
**Dependencies**: ARCDECANDGEN-011 (type-level pipeline rename), ARCDECANDGEN-007 (apply-move split)

## Goal

Finish the runtime naming migration from operation-profile terminology to action-pipeline terminology in kernel execution/legality helpers.

## Assumption Reassessment (vs current codebase)

1. `ActionPipelineDef` and pipeline field names are already in place in runtime code.
- Current state: `legality`, `costValidation`, `costEffects`, `stages`, `atomicity`, and `actionPipelines` are already used.
- Impact: this ticket is **not** a field-schema rename.

2. Runtime helper naming is still mixed.
- Current state: helper APIs used `resolveOperationProfile`, `toOperationExecutionProfile`, and `OperationExecutionProfile` in `src/kernel/apply-move-pipeline.ts`, consumed by `apply-move.ts`, `legal-moves.ts`, and `legal-choices.ts`.
- Impact: this ticket focused on helper/type naming consistency and call-site updates.

3. Proposed new test file in original ticket did not match current test architecture.
- Current state: behavior coverage already exists in `test/unit/kernel/apply-move.test.ts`, `test/unit/kernel/legal-moves.test.ts`, `test/unit/kernel/legal-choices.test.ts`, and `test/unit/applicability-dispatch.test.ts`.
- Impact: extended/adjusted existing tests instead of introducing a new `test/unit/action-pipeline.test.ts` file.

4. Original invariant “no operationProfile string anywhere in src/kernel/” was too broad for this ticket.
- Current state: non-runtime surfaces still intentionally use operation terminology (for example diagnostic code names and `operationProfileId` in turn-flow types) and are out of scope for this runtime-only ticket.
- Impact: narrowed invariants to runtime helper/export/call-site naming touched by this ticket.

## Updated Scope

### Files modified
- `src/kernel/apply-move-pipeline.ts`
- `src/kernel/apply-move.ts`
- `src/kernel/legal-moves.ts`
- `src/kernel/legal-choices.ts`
- `test/unit/applicability-dispatch.test.ts`

## Out of Scope

- Compiler/CNL schema names and diagnostics
- YAML/GameSpecDoc shape changes
- Non-runtime operation terminology outside touched runtime helper flows
- New gameplay features or semantics changes

## Acceptance Criteria

### Required behavior
- Runtime behavior remains unchanged: selected pipeline resolution and execution semantics are identical.
- `applyMove`, `legalMoves`, and `legalChoices` continue selecting pipelines exactly as before.

### Required renames
- `resolveOperationProfile` → `resolveActionPipeline`
- `toOperationExecutionProfile` → `toExecutionPipeline`
- `OperationExecutionProfile` → `ExecutionPipeline`
- Updated local variable names and test descriptions/assertions to pipeline language in touched files.

### Invariants
- No references to `resolveOperationProfile`, `toOperationExecutionProfile`, or `OperationExecutionProfile` remain in `src/kernel/`.
- Runtime helper module remains generic and action-pipeline oriented, aligned with Spec 32 architecture decomposition/generalization direction.

### Tests verified
- `npm run build`
- `node --test dist/test/unit/kernel/apply-move.test.js dist/test/unit/kernel/legal-moves.test.js dist/test/unit/kernel/legal-choices.test.js dist/test/unit/applicability-dispatch.test.js`
- `npm test`

## Architecture Assessment

The rename is beneficial relative to the prior mixed naming because it removes conceptual duplication (`operation profile` vs `action pipeline`) in the runtime layer and aligns the kernel with Spec 32’s decomposition/generalization direction. This improves extensibility and maintainability by reducing ambiguous mental models at call sites without introducing compatibility shims or behavior branches.

## Outcome

- Completion date: 2026-02-13
- Actually changed:
  - Renamed runtime helper interface/functions and all runtime call sites to pipeline terminology.
  - Renamed key local variables and user-facing runtime error wording in touched runtime files to pipeline terminology.
  - Updated applicability dispatch test language and added one edge-case test for single-candidate pipeline selection behavior.
- Deviations from original plan:
  - Did not add `test/unit/action-pipeline.test.ts`; strengthened existing test architecture instead.
  - Did not rename non-runtime operation terminology (diagnostic code families, turn-flow type fields), kept explicitly out of scope.
- Verification results:
  - Targeted runtime-related unit tests passed.
  - Full `npm test` suite passed.
