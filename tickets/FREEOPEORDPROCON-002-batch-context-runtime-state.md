# FREEOPEORDPROCON-002: Batch Context Runtime State Extension

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel types, Zod runtime schema, JSON schema artifacts
**Deps**: archive/tickets/FREEOPEORDPROCON-001-progression-policy-contract-surface.md

## Problem

`TurnFlowFreeOperationSequenceBatchContext` (`types-turn-flow.ts:191-193`) only stores `capturedMoveZonesByKey`. To support `implementWhatCanInOrder`, the batch context must also record which policy governs the batch and which step indices were skipped because they were unimplementable at emission time. Without this state, the readiness engine (ticket 004) has no basis for letting later steps proceed past skipped earlier steps.

## Assumption Reassessment (2026-03-12)

1. `TurnFlowFreeOperationSequenceBatchContext` is `{ capturedMoveZonesByKey: Record<string, readonly string[]> }` — confirmed at `types-turn-flow.ts:191-193`.
2. `TurnFlowRuntimeState.freeOperationSequenceContexts` maps batch IDs to these contexts at line 244.
3. The Zod schema for `freeOperationSequenceContexts` in `schemas-extensions.ts:535-544` mirrors this shape.
4. No `progressionPolicy` or `skippedStepIndices` exists anywhere in runtime state today.

## Architecture Check

1. Extending the existing `TurnFlowFreeOperationSequenceBatchContext` is architecturally correct — the spec explicitly calls for this over a parallel structure, to avoid fragmenting batch state.
2. Both new fields are optional (absent for `strictInOrder` batches with no skipped steps), preserving backward compatibility of existing serialized state.
3. `skippedStepIndices` is a sorted readonly number array — minimal, deterministic, immutable.

## What to Change

### 1. Type extension (`types-turn-flow.ts:191-193`)

Extend `TurnFlowFreeOperationSequenceBatchContext`:

```ts
export interface TurnFlowFreeOperationSequenceBatchContext {
  readonly capturedMoveZonesByKey: Readonly<Record<string, readonly string[]>>;
  readonly progressionPolicy?: 'strictInOrder' | 'implementWhatCanInOrder';
  readonly skippedStepIndices?: readonly number[];
}
```

### 2. Zod schema (`schemas-extensions.ts:535-544`)

Update the `freeOperationSequenceContexts` schema to accept the new optional fields:

```ts
z.object({
  capturedMoveZonesByKey: z.record(...),
  progressionPolicy: z.enum(['strictInOrder', 'implementWhatCanInOrder']).optional(),
  skippedStepIndices: z.array(z.number().int().min(0)).optional(),
}).strict()
```

### 3. JSON schema artifacts

Regenerate via `pnpm turbo schema:artifacts`. The `freeOperationSequenceContexts` definition in `GameDef.schema.json` and `Trace.schema.json` must reflect the two new optional fields.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify) — extend `TurnFlowFreeOperationSequenceBatchContext`
- `packages/engine/src/kernel/schemas-extensions.ts` (modify) — Zod schema for batch context
- `packages/engine/schemas/GameDef.schema.json` (regenerate)
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate if affected)

## Out of Scope

- Populating `progressionPolicy` or `skippedStepIndices` at grant emission time — that is FREEOPEORDPROCON-003.
- Consulting `skippedStepIndices` in readiness logic — that is FREEOPEORDPROCON-004.
- Validation rejection rules for `requireMoveZoneCandidatesFrom` — that is FREEOPEORDPROCON-003.
- MACV data changes — that is FREEOPEORDPROCON-006.
- Any behavioral runtime change — this ticket is types + schemas only.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: a `TurnFlowFreeOperationSequenceBatchContext` value with only `capturedMoveZonesByKey` still parses successfully (backward compat).
2. Unit test: a context with `progressionPolicy: 'implementWhatCanInOrder'` and `skippedStepIndices: [0]` parses successfully.
3. Unit test: a context with `skippedStepIndices: [-1]` is rejected (min 0).
4. Unit test: a context with `progressionPolicy: 'invalid'` is rejected.
5. Existing suite: `pnpm turbo test` — no regressions.
6. Schema artifacts: `pnpm turbo schema:artifacts` passes.

### Invariants

1. Existing runtime state without the new fields remains valid (optional fields).
2. `skippedStepIndices` values must be non-negative integers.
3. The type imports the progression policy type from FREEOPEORDPROCON-001 (or re-declares the literal union — whichever is idiomatic for the codebase).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-sequence-context-contract.test.ts` — new cases for parsing contexts with/without new fields
2. `packages/engine/test/helpers/free-operation-sequence-context-fixtures.ts` — add fixture with `progressionPolicy` and `skippedStepIndices`

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo lint && pnpm turbo typecheck`
