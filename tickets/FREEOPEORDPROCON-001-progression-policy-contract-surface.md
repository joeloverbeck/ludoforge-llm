# FREEOPEORDPROCON-001: Progression Policy Contract Surface (schema + types + validation constants)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — contracts, schemas, Zod schemas, JSON schema artifacts
**Deps**: None (first ticket in the series)

## Problem

Ordered free-operation sequences have no explicit authoring-level progression policy. The runtime cannot distinguish between "strict" (current implicit default) and "implement what can in order" (new). This ticket introduces the type surface and schema plumbing — no runtime logic yet.

## Assumption Reassessment (2026-03-12)

1. `TurnFlowFreeOperationGrantContract` (`contracts/turn-flow-free-operation-grant-contract.ts:31-34`) defines `sequence` as `{ batch: string; step: number }` — no `progressionPolicy` field exists yet.
2. `EventCardFreeOperationGrantSchema` (`schemas-extensions.ts:86-107`) defines `sequence` as `z.object({ batch, step }).strict()` — adding a new field here will be rejected by `.strict()` until the schema is updated.
3. `GameDef.schema.json` and `Trace.schema.json` contain `sequenceBatchId` and `freeOperationSequenceContexts` but no `progressionPolicy` anywhere.
4. The contract violation collector in `turn-flow-free-operation-grant-contract.ts` has no rule for mixed progression policies within a batch.

## Architecture Check

1. Adding a typed, closed union (`'strictInOrder' | 'implementWhatCanInOrder'`) at the contract level is the minimal change to make progression intent explicit.
2. The policy lives in `GameSpecDoc` authoring (sequence field) and is lowered through the compiler — not a kernel concept. This preserves the GameSpecDoc-authors-intent / runtime-executes boundary.
3. No aliases or backwards-compatibility shims. Omission means `strictInOrder` (current default, documented explicitly).

## What to Change

### 1. Contract type (`turn-flow-free-operation-grant-contract.ts`)

Add a const array and type for progression policy values:

```ts
export const TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES = [
  'strictInOrder',
  'implementWhatCanInOrder',
] as const;

export type TurnFlowFreeOperationGrantProgressionPolicy =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_PROGRESSION_POLICY_VALUES)[number];
```

Extend the `sequence` shape in `TurnFlowFreeOperationGrantContract` to include `progressionPolicy?: TurnFlowFreeOperationGrantProgressionPolicy`.

Add a contract violation for mixed progression policies within the same batch (new violation code, e.g., `'SEQUENCE_MIXED_PROGRESSION_POLICY'`).

### 2. Zod schema (`schemas-extensions.ts`)

Update `EventCardFreeOperationGrantSchema`'s `sequence` object (line 87-92) to accept `progressionPolicy: z.enum(PROGRESSION_POLICY_VALUES).optional()`.

### 3. Effect-issued grant schema

Find the effect-issued `grantFreeOperation` schema (in `schemas-extensions.ts` or its helper) and add the same `progressionPolicy` field to the `sequence` sub-object so event-issued and effect-issued paths share the same contract surface.

### 4. JSON schema artifacts

Regenerate `GameDef.schema.json` via `pnpm turbo schema:artifacts`. The `progressionPolicy` enum should appear inside the free-operation grant sequence definition.

### 5. Contract violation collector

In `collectTurnFlowFreeOperationGrantContractViolations` (or the batch-level validation helper), add a rule that rejects batches where grants disagree on `progressionPolicy`.

## Files to Touch

- `packages/engine/src/contracts/turn-flow-free-operation-grant-contract.ts` (modify) — new const array, type, sequence shape extension, violation code
- `packages/engine/src/kernel/schemas-extensions.ts` (modify) — Zod schema update for event-issued and effect-issued grant `sequence` field
- `packages/engine/schemas/GameDef.schema.json` (regenerate)
- `packages/engine/schemas/Trace.schema.json` (regenerate if trace references the grant schema)
- `packages/engine/schemas/EvalReport.schema.json` (regenerate if affected)

## Out of Scope

- Runtime state changes (`TurnFlowFreeOperationSequenceBatchContext`, `skippedStepIndices`) — that is FREEOPEORDPROCON-002.
- Kernel readiness logic (`isPendingFreeOperationGrantSequenceReady`) — that is FREEOPEORDPROCON-004.
- Validation of `requireMoveZoneCandidatesFrom` interaction with `implementWhatCanInOrder` — that is FREEOPEORDPROCON-003.
- MACV data rework — that is FREEOPEORDPROCON-006.
- Any runtime behavioral change.

## Acceptance Criteria

### Tests That Must Pass

1. Unit test: a grant with `sequence: { batch: 'x', step: 0, progressionPolicy: 'strictInOrder' }` parses successfully through the Zod schema.
2. Unit test: a grant with `sequence: { batch: 'x', step: 0, progressionPolicy: 'implementWhatCanInOrder' }` parses successfully.
3. Unit test: a grant with `sequence: { batch: 'x', step: 0 }` (no progressionPolicy) parses successfully — field is optional.
4. Unit test: a grant with `sequence: { batch: 'x', step: 0, progressionPolicy: 'bogus' }` is rejected by Zod.
5. Unit test: contract violation reported when two grants in the same batch disagree on `progressionPolicy` (e.g., step 0 has `strictInOrder`, step 1 has `implementWhatCanInOrder`).
6. Unit test: no violation when all grants in a batch share the same `progressionPolicy`.
7. Existing suite: `pnpm turbo test` — no regressions.
8. Schema artifacts: `pnpm turbo schema:artifacts` passes (JSON schemas regenerated and checked in).

### Invariants

1. Omitting `progressionPolicy` must remain valid and implicitly mean `strictInOrder`.
2. No existing test or game data file breaks — no behavioral change yet.
3. The progression policy type is a closed enum with exactly two values.
4. Event-issued and effect-issued grant schemas both accept the same `progressionPolicy` field.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — new cases for progressionPolicy schema validation and mixed-batch rejection
2. `packages/engine/test/unit/kernel/free-operation-grant-overlap.test.ts` — verify overlap detection still works with progressionPolicy present

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo schema:artifacts`
3. `pnpm turbo lint && pnpm turbo typecheck`
