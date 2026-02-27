# ENGINEARCH-102: Derive Illegal-Move Context Field Types from Canonical Kernel Contracts

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — runtime error context type cleanup + shared type reuse
**Deps**: archive/tickets/ENGINEARCH-101-runtime-error-contract-layer-decoupling.md

## Problem

Several `IllegalMoveContextByReason` fields in `runtime-error.ts` use inline literal unions that duplicate canonical kernel contracts. This creates type drift risk as core contracts evolve.

## Assumption Reassessment (2026-02-27)

1. Confirmed: `runtime-error.ts` still hardcodes inline unions for turn-flow action class values, pipeline atomicity values, and compound timing/field values.
2. Confirmed: canonical sources already exist in shared kernel contracts:
   - turn-flow action class in `types-turn-flow.ts`
   - action-pipeline atomicity in `types-operations.ts`
   - compound move timing/fields in `types-core.ts` (`Move['compound']` / `CompoundMovePayload`)
3. Discrepancy corrected: `turn-flow-contract.ts` is not the canonical source for runtime move/action contracts consumed by `runtime-error.ts`; scope should target shared type modules above.
4. Existing tests exercise behavior and some contract typing, but they do not currently assert all duplicated illegal-move context fields are derived from canonical contract types.
5. Scope correction: remove the duplicated inline unions and derive illegal-move context field types directly from canonical kernel contracts.

## Architecture Check

1. Deriving context fields from canonical contract types is cleaner and more robust than repeating string unions.
2. This preserves engine agnosticism: no game-specific identifiers or behavior are introduced.
3. No backward-compatibility aliases/shims; duplicated unions are replaced directly with canonical references.

## What to Change

### 1. Replace inline literal unions in illegal-move contexts

In `IllegalMoveContextByReason`, derive duplicated fields from canonical contracts for:
- mapped action class (`TurnFlowActionClass`)
- partial execution mode (`ActionPipelineDef['atomicity']`)
- compound timing (`NonNullable<Move['compound']>['timing']`)
- invalid compound field (`keyof Pick<NonNullable<Move['compound']>, 'insertAfterStage' | 'replaceRemainingStages'>`)

### 2. Keep contract references in shared kernel type modules

Do not introduce game-specific schema files or ad hoc per-feature literals. Reuse existing shared kernel contracts directly unless a neutral shared alias is strictly required.

### 3. Strengthen contract tests

Update runtime-error contract tests with compile-time checks that illegal-move context field types stay aligned with canonical contract sources.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)
- `packages/engine/src/kernel/types-turn-flow.ts` / `types-operations.ts` / `types-core.ts` (modify only if a neutral shared alias is strictly required)

## Out of Scope

- Illegal-move reason taxonomy changes.
- Runtime behavior changes unrelated to typing.

## Acceptance Criteria

### Tests That Must Pass

1. `IllegalMoveContextByReason` no longer hardcodes duplicated literal unions where canonical types already exist.
2. Runtime error contract tests remain green and include compile-time assertions for canonical type derivation.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime error contracts derive from single-source kernel contracts where applicable.
2. Kernel remains game-agnostic with no game-specific branches.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — add compile-time assertions that illegal-move context fields are derived from canonical contract types.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

Implemented with one scope correction from assumptions reassessment:

1. Updated scope to use canonical shared type modules (`types-turn-flow.ts`, `types-operations.ts`, `types-core.ts` via `Move`) instead of `turn-flow-contract.ts` as a source for runtime error contract derivation.
2. Replaced duplicated inline unions in `packages/engine/src/kernel/runtime-error.ts` with canonical derivations:
   - `mappedActionClass` -> `TurnFlowActionClass`
   - `partialExecutionMode` -> `ActionPipelineDef['atomicity']`
   - `timing` -> `NonNullable<Move['compound']>['timing']`
   - `invalidField` -> `keyof Pick<NonNullable<Move['compound']>, 'insertAfterStage' | 'replaceRemainingStages'>`
3. Strengthened `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` with compile-time contract checks asserting these illegal-move context fields remain assignable from canonical types and reject non-canonical literals.
4. Validation completed successfully: `pnpm turbo build`, targeted runtime-error contract test, `pnpm -F @ludoforge/engine test` (311/311), and `pnpm turbo lint`.
5. Follow-up architecture hardening: removed duplicated `FreeOperationActionClass` union from `free-operation-denial-contract.ts` and bound `FreeOperationBlockExplanation.actionClass` to canonical `TurnFlowActionClass`, with layering guard tests updated accordingly.
