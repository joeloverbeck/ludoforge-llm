# ENGINEARCH-074: Emit trace annotation when `replaceRemainingStages` skips pipeline stages

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel trace emission plus trigger-log type/schema extension
**Deps**: none

## Problem

When `replaceRemainingStages: true` causes the staged-operation loop in `apply-move.ts` to `break`, no trigger-log entry records that remaining stages were intentionally skipped. This reduces trace explainability for compound moves: state changes show what happened, but not that stage suppression was deliberate behavior.

## Assumption Reassessment (2026-02-26, corrected)

1. Confirmed: `apply-move.ts` breaks from staged execution when `stageIdx === insertAfter` and `replaceRemainingStages === true`.
2. Confirmed: operation-level diagnostic entries are emitted via `executionTraceEntries` and merged into `triggerFirings`.
3. Confirmed: existing trigger-log kinds include `operationFree` and `operationPartial`, but none encode "remaining stages were replaced/skipped".
4. Corrected ownership: operation trace-entry types live in `packages/engine/src/kernel/types-operations.ts`, their schemas live in `packages/engine/src/kernel/schemas-extensions.ts`, and aggregation into `TriggerLogEntry` happens in `types-core.ts`/`schemas-core.ts`.
5. Corrected tests location: `replaceRemainingStages` behavioral coverage is in `packages/engine/test/unit/kernel/apply-move.test.ts`.
6. Existing tests already verify execution semantics of `replaceRemainingStages` (state outcomes), but do not verify trace annotation presence/shape for this behavior.

## Architecture Check

1. This change should remain observational only: no gameplay semantics or state transitions change.
2. A dedicated operation trace kind is architecturally cleaner than overloading generic trigger entries or free-form metadata blobs.
3. The concept is engine-generic (staged operation + compound insertion), not game-specific, so it satisfies Agnostic Engine constraints.
4. Preferred design: keep operation diagnostics cohesive by introducing a new operation trace-entry contract next to `operationFree`/`operationPartial`.
5. This repository direction should prioritize clean contracts over compatibility shims; if strict trace consumers break on new kinds, update those consumers directly rather than adding aliases.

## What to Change

### 1. Emit a structured operation trace entry when stages are skipped

In the staged-operation path in `apply-move.ts`, when `replaceRemainingStages === true` causes an early break, push an entry into `executionTraceEntries` before breaking.

Suggested contract:
```typescript
{
  kind: 'operationCompoundStagesReplaced',
  actionId: String(action.id),
  profileId: actionPipeline.id,
  insertAfterStage: insertAfter,
  totalStages: executionProfile.resolutionStages.length,
  skippedStageCount: executionProfile.resolutionStages.length - insertAfter - 1,
}
```

### 2. Extend trigger-log type/schema contracts

Add the new entry in operation trace contracts and include it in `TriggerLogEntry` union wiring:

- `types-operations.ts` (new interface)
- `types-core.ts` (union inclusion)
- `schemas-extensions.ts` (new Zod schema)
- `schemas-core.ts` (union inclusion)
- regenerate `packages/engine/schemas/Trace.schema.json`

### 3. Add/strengthen tests for trace invariants

Add assertions that verify trace entry presence, absence, and correct counts for `replaceRemainingStages` true/false.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/types-operations.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)
- `packages/engine/test/unit/schemas-top-level.test.ts` (modify)
- `packages/engine/test/unit/json-schema.test.ts` (modify as needed)

## Out of Scope

- Trace viewer/renderer changes in the runner
- Retroactive trace annotations for other compound move behaviors

## Acceptance Criteria

### Tests That Must Pass

1. When `replaceRemainingStages: true`, trace output includes a stages-replaced annotation
2. When `replaceRemainingStages` is absent/false, no stages-replaced annotation appears
3. Annotation contains correct stage counts
4. Existing engine suite passes: `pnpm -F @ludoforge/engine test`
5. JSON schema validation accepts the new trigger-log entry kind

### Invariants

1. Trace annotations are informational only — they do not affect game state
2. New trace entry remains operation-generic and does not encode game-specific details
3. Stage-count fields are derived deterministically from matched pipeline stages and insert index

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — Assert trace annotation presence/absence and stage-count correctness for `replaceRemainingStages`
2. `packages/engine/test/unit/schemas-top-level.test.ts` — Assert `TriggerLogEntrySchema` accepts the new entry kind
3. `packages/engine/test/unit/json-schema.test.ts` — Assert top-level trace schema accepts the new entry kind

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo build`
3. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-26
- Implemented:
  - Added `operationCompoundStagesReplaced` trigger-log entry contract and schema.
  - Emitted the new trace entry in `apply-move.ts` when `replaceRemainingStages: true` breaks staged execution.
  - Added/updated tests for runtime behavior and schema acceptance.
  - Regenerated schema artifacts (`Trace.schema.json`, `EvalReport.schema.json`).
- Deviations from original plan:
  - Used `actionPipeline.id` (not `executionProfile.id`) because `ExecutionPipeline` does not carry an `id`.
  - Strengthened coverage with an edge case asserting `skippedStageCount = 0` when replacement occurs after the final stage.
- Verification results:
  - `pnpm turbo schema:artifacts` passed
  - `pnpm turbo build` passed
  - `pnpm -F @ludoforge/engine test` passed (`297` passed, `0` failed)
  - `pnpm turbo lint` passed
