# FREEOPEORDPROCON-002: Batch Context Runtime State Contract

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel runtime types, runtime-state writers, Zod runtime schema, JSON schema artifacts
**Deps**: archive/tickets/FREEOPEORDPROCON-001-progression-policy-contract-surface.md

## Problem

`TurnFlowFreeOperationSequenceBatchContext` still stores only `capturedMoveZonesByKey`, and batch context is created opportunistically when a consumed grant captures move-zone candidates. That is too weak for the ordered-progression architecture in [specs/60-free-operation-ordered-progression-contract.md](/home/joeloverbeck/projects/ludoforge-llm/specs/60-free-operation-ordered-progression-contract.md):

1. later tickets need a canonical per-batch place to read/write ordered progression state
2. context creation tied to capture-side effects is an architectural leak
3. a batch with no sequence-context capture currently has no runtime batch context at all

This ticket establishes the canonical runtime batch-context shape and ensures ordered batches materialize that context at emission time. It does not yet evaluate skips or change readiness rules.

## Assumption Reassessment (2026-03-12)

1. `sequence.progressionPolicy` is already implemented on the authoring/contract surface:
   - shared contract constants/types exist in `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts`
   - kernel grant types already expose `sequence.progressionPolicy` in `packages/engine/src/kernel/types-turn-flow.ts`
   - AST/CNL/schema tests already cover progression policy parsing and lowering
2. `TurnFlowFreeOperationSequenceBatchContext` in `packages/engine/src/kernel/types-turn-flow.ts` still only contains `capturedMoveZonesByKey`.
3. The runtime Zod schema in `packages/engine/src/kernel/schemas-extensions.ts` mirrors that minimal shape exactly.
4. Event-issued emission in `packages/engine/src/kernel/turn-flow-eligibility.ts` emits sequenced grants but does not create batch context at issuance time.
5. Effect-issued emission in `packages/engine/src/kernel/effects-turn-flow.ts` likewise emits sequenced grants without initializing batch context.
6. Runtime capture logic in `packages/engine/src/kernel/turn-flow-eligibility.ts` creates batch context only when a consumed grant has `captureMoveZoneCandidatesAs`.
7. Readiness logic remains separate work:
   - `packages/engine/src/kernel/free-operation-grant-authorization.ts`
   - `packages/engine/src/kernel/free-operation-discovery-analysis.ts`
8. Skip evaluation remains separate work:
   - `tickets/FREEOPEORDPROCON-005-emission-time-skip-evaluation.md`

## Architecture Check

1. Extending the existing batch context is still the right architecture. A parallel progression-state map would fragment one batch's state across multiple locations.
2. The cleaner long-term model is to materialize batch context when an ordered batch is emitted, not when a later capture happens. That makes batch state canonical instead of incidental.
3. This ticket should not change readiness semantics or viability probing. It should only establish the runtime-state contract that later tickets consume.
4. `capturedMoveZonesByKey` remains in the same context object; progression metadata belongs beside it because both are batch-scoped runtime facts.
5. The context written by the runtime should be canonical:
   - `progressionPolicy` should always be populated for emitted sequenced batches
   - `skippedStepIndices` should exist as an array, initialized empty, so later tickets can append deterministically instead of branching on undefined state

## What to Change

### 1. Extend runtime batch context type

Update `packages/engine/src/kernel/types-turn-flow.ts`:

```ts
export interface TurnFlowFreeOperationSequenceBatchContext {
  readonly capturedMoveZonesByKey: Readonly<Record<string, readonly string[]>>;
  readonly progressionPolicy: TurnFlowFreeOperationGrantProgressionPolicy;
  readonly skippedStepIndices: readonly number[];
}
```

### 2. Extend runtime Zod schema

Update the `freeOperationSequenceContexts` entry in `packages/engine/src/kernel/schemas-extensions.ts` to require:

```ts
z.object({
  capturedMoveZonesByKey: z.record(StringSchema.min(1), z.array(StringSchema.min(1))),
  progressionPolicy: z.enum(TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES),
  skippedStepIndices: z.array(IntegerSchema.min(0)),
}).strict()
```

### 3. Initialize batch context at emission time

When event-issued or effect-issued sequenced grants are emitted, initialize or preserve the batch context for that batch:

- create the batch context the first time a `sequenceBatchId` is introduced
- set `progressionPolicy` from the grant's `sequence.progressionPolicy`, defaulting to `strictInOrder`
- initialize `capturedMoveZonesByKey` to `{}` and `skippedStepIndices` to `[]`
- preserve existing captured keys if the batch context already exists

This must happen in both emission paths:

- `packages/engine/src/kernel/turn-flow-eligibility.ts`
- `packages/engine/src/kernel/effects-turn-flow.ts`

### 4. Preserve capture updates against the extended shape

When a consumed grant captures move zones, update only `capturedMoveZonesByKey` while preserving:

- `progressionPolicy`
- `skippedStepIndices`

### 5. JSON schema artifacts

Regenerate schema artifacts so runtime schemas reflect the extended batch context:

- `packages/engine/schemas/Trace.schema.json`
- `packages/engine/schemas/EvalReport.schema.json` if affected
- `packages/engine/schemas/GameDef.schema.json` only if generation touches shared components transitively

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify) — extend `TurnFlowFreeOperationSequenceBatchContext`
- `packages/engine/src/kernel/schemas-extensions.ts` (modify) — runtime batch-context Zod schema
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify) — initialize/preserve batch context for event-issued sequenced grants; preserve extended fields during capture updates
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify) — initialize/preserve batch context for effect-issued sequenced grants
- `packages/engine/schemas/Trace.schema.json` (regenerate)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate if affected)
- `packages/engine/schemas/GameDef.schema.json` (regenerate if affected)

## Out of Scope

- Evaluating viability and populating non-empty `skippedStepIndices` — that is `tickets/FREEOPEORDPROCON-005-emission-time-skip-evaluation.md`
- Consulting `skippedStepIndices` in readiness/discovery — that is `tickets/FREEOPEORDPROCON-004-sequence-readiness-engine.md`
- Cross-step validation rules for skip-capable batches — that is `tickets/FREEOPEORDPROCON-003-validation-rules-cross-step-context-rejection.md`
- MACV game-data rework — that is `tickets/FREEOPEORDPROCON-006-macv-data-rework.md`

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: runtime schema accepts a batch context with `capturedMoveZonesByKey`, `progressionPolicy`, and `skippedStepIndices`.
2. Unit test: runtime schema rejects a batch context missing `progressionPolicy`.
3. Unit test: runtime schema rejects a batch context missing `skippedStepIndices`.
4. Unit test: runtime schema rejects negative `skippedStepIndices`.
5. Integration or unit test: event-issued sequenced grants initialize batch context at emission time, even before any capture occurs.
6. Integration or unit test: effect-issued sequenced grants initialize batch context at emission time, even before any capture occurs.
7. Integration test: consuming a capture grant preserves `progressionPolicy` and `skippedStepIndices` while writing `capturedMoveZonesByKey`.
8. Existing suite: `pnpm turbo schema:artifacts`, `pnpm turbo lint`, `pnpm turbo typecheck`, and the relevant engine tests pass.

### Invariants

1. Every emitted sequenced batch has exactly one canonical runtime batch context entry.
2. Batch context no longer depends on whether any step captures move-zone candidates.
3. `progressionPolicy` is canonicalized to a concrete runtime value at emission time; omitted authoring policy becomes `strictInOrder`.
4. `skippedStepIndices` is always an ordered array in runtime state, even when empty.
5. Existing sequence-context capture behavior is preserved.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-sequence-context-contract.test.ts`
   Add runtime batch-context schema acceptance/rejection cases for `progressionPolicy` and `skippedStepIndices`.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
   Add or update coverage proving sequenced batch context exists immediately after grant emission and survives capture updates with the new fields intact.
3. `packages/engine/test/helpers/free-operation-sequence-context-fixtures.ts`
   Update fixture runtime state to the new canonical batch-context shape if needed by unit tests.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo lint`
4. `pnpm turbo typecheck`

## Outcome

- Completion date: 2026-03-12
- What actually changed:
  - Extended `TurnFlowFreeOperationSequenceBatchContext` to require `progressionPolicy` and `skippedStepIndices` alongside `capturedMoveZonesByKey`.
  - Updated the runtime Zod/schema artifact surface so trace/runtime schemas require the same canonical batch-context shape.
  - Initialized batch context eagerly in both event-issued and effect-issued grant emission paths, defaulting omitted authoring policy to `strictInOrder`.
  - Preserved `progressionPolicy` and `skippedStepIndices` during later capture updates instead of recreating batch context with only capture data.
  - Tightened overlap classification so eager batch-context creation does not accidentally change equivalence semantics for plain sequenced grants without sequence-context captures.
- Deviations from original plan:
  - The ticket was corrected before implementation because `progressionPolicy` contract work had already landed in ticket 001 and corresponding tests.
  - The implementation included a small follow-on fix in `free-operation-grant-overlap.ts` because eager batch-context materialization exposed an existing assumption that “context exists” implied sequence-context semantics.
- Verification results:
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-sequence-context-contract.test.js packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed after a fresh engine build.
  - `pnpm turbo schema:artifacts` passed and regenerated checked-in schema artifacts.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo typecheck` passed.
  - `pnpm turbo lint` passed with pre-existing workspace warnings only; no new lint errors were introduced by this ticket.
