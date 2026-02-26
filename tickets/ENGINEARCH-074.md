# ENGINEARCH-074: Emit trace annotation when `replaceRemainingStages` skips pipeline stages

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Yes — kernel trace emission in `apply-move.ts`
**Deps**: none

## Problem

When `replaceRemainingStages: true` causes the stage loop in `apply-move.ts` to `break`, there is no trace entry recording that stages were skipped. This makes it difficult to debug compound move behavior from traces alone — the trace shows the SA executing but gives no indication that subsequent operation stages were intentionally suppressed.

## Assumption Reassessment (2026-02-26)

1. `apply-move.ts:706-708` performs a `break` after the SA fires when `replaceRemainingStages === true`.
2. The `emittedEvents` array and `executionTraceEntries` array are the trace emission channels used in this function.
3. No existing trace event kind covers "stages skipped" or "stages replaced" semantics.
4. The trace schema (`Trace.schema.json`) would need a new event kind if a structured trace entry is desired, or an informational annotation could be added to existing trace infrastructure.

## Architecture Check

1. A trace annotation is a diagnostic improvement — it doesn't change execution semantics, only observability.
2. The trace system is game-agnostic; a "stages replaced" annotation is a generic compound-move concept.
3. No backwards-compatibility concerns — new trace entries are additive.

## What to Change

### 1. Emit a trace entry when stages are skipped

After the `break` in `apply-move.ts`, or just before it, push a trace annotation into `emittedEvents` or `executionTraceEntries` indicating which stages were skipped. The exact shape depends on the trace schema conventions.

Suggested annotation:
```typescript
{
  kind: 'compoundStagesReplaced',
  actionId: String(action.id),
  afterStage: insertAfter,
  totalStages: executionProfile.resolutionStages.length,
  skippedStages: executionProfile.resolutionStages.length - insertAfter - 1,
}
```

### 2. Update trace schema if using structured events

If the annotation uses a new event kind, add it to the Zod schema and regenerate JSON schemas.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify — if new trace event type)
- `packages/engine/src/kernel/schemas-core.ts` (modify — if new trace event type)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/test/unit/kernel/apply-move.test.ts` (modify)

## Out of Scope

- Trace viewer/renderer changes in the runner
- Retroactive trace annotations for other compound move behaviors

## Acceptance Criteria

### Tests That Must Pass

1. When `replaceRemainingStages: true`, trace output includes a stages-replaced annotation
2. When `replaceRemainingStages` is absent/false, no stages-replaced annotation appears
3. Annotation contains correct stage counts
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Trace annotations are informational only — they do not affect game state
2. Existing trace consumers are not broken by the new annotation kind

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/apply-move.test.ts` — Assert trace annotation presence/absence for `replaceRemainingStages`

### Commands

1. `pnpm -F @ludoforge/engine test -- --test-name-pattern "replaceRemainingStages"`
2. `pnpm turbo build && pnpm -F @ludoforge/engine test`
