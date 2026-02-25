# FITLGOLT4-006: Add Deferred Event Effect Lifecycle Trace Entries

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — turn-flow/apply-move trace emission, trace schema
**Deps**: archive/tickets/FITLGOLT4-002.md

## Problem

Deferred event effects are now queued and released, but the trace stream does not explicitly record when a deferred payload is created, released, and executed. This reduces debuggability and makes root-cause analysis of ordering behavior harder in deterministic replay workflows.

## Assumption Reassessment (2026-02-25)

1. Deferred payloads are already modeled in runtime (`pendingDeferredEventEffects`) and are released by free-op grant consumption (`consumeTurnFlowFreeOperationGrant`), while execution happens in `apply-move.ts`.
2. Current trigger trace entries include turn-flow lifecycle/eligibility and operation markers, but no explicit deferred lifecycle entry kind (queue/release/execute are currently invisible).
3. Existing integration coverage (`event-effect-timing.test.ts`) verifies deferred behavior via state outcomes only; it does not assert deferred trace observability contracts.
4. `TriggerLogEntry` and its schema union are owned in `types-core.ts` and `schemas-core.ts` (not just extension schemas), so those files must be part of scope.

## Architecture Check

1. Explicit deferred lifecycle tracing is more robust than inferring lifecycle from state diffs; it improves deterministic replay/debugging while preserving gameplay semantics.
2. Lifecycle trace entries must be emitted from the actual lifecycle boundaries: queueing in turn-flow eligibility, release in grant-consumption, execution in apply-move. This keeps architecture honest and avoids synthetic post-hoc reconstruction.
3. Released payloads should carry stable deferred identity metadata through execution (no aliasing, no lossy conversion), so `released` and `executed` entries can correlate deterministically.
4. The trace model remains engine-agnostic: generic deferred metadata only (`deferredId`, `actionId`, `requiredGrantBatchIds`, `stage`), with no FITL-specific branches.

## What to Change

### 1. Define deferred lifecycle trace entry shape

Add a new trace entry kind for deferred lifecycle events with minimal generic metadata:
- deferred id
- action id
- required grant batch ids
- stage (`queued` | `released` | `executed`)

### 2. Emit lifecycle entries at key transitions

- Emit `queued` when deferred payload is attached to runtime.
- Emit `released` when all required grant batches are satisfied and payload is returned for execution.
- Emit `executed` after deferred effects are applied.
- Preserve deferred identity across release/execution boundaries so entries can be correlated by `deferredId`.

### 3. Update trace schemas/contracts

Update trigger log type/schema unions and generated artifacts so entries are validated and serialized consistently.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/src/kernel/schemas-extensions.ts` (modify)
- `packages/engine/schemas/Trace.schema.json` (modify)
- `packages/engine/schemas/EvalReport.schema.json` (modify)
- `packages/engine/test/unit/trace-contract.test.ts` (modify)
- `packages/engine/test/integration/event-effect-timing.test.ts` (modify)

## Out of Scope

- Changes to event timing semantics
- FITL data encoding updates
- Golden playbook turn expansions

## Acceptance Criteria

### Tests That Must Pass

1. New/updated tests assert deferred lifecycle trace entries for queue/release/execute phases.
2. Trace contract tests validate new entry shape.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Deferred lifecycle traces are deterministic for same state+move sequence.
2. Trace payload stays generic and reusable across games.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/event-effect-timing.test.ts` — assert lifecycle trace stages for deferred event effects.
2. `packages/engine/test/unit/trace-contract.test.ts` — schema/shape assertions for new trace kind.

### Commands

1. `pnpm -F @ludoforge/engine run schema:artifacts`
2. `pnpm turbo build --filter @ludoforge/engine`
3. `node --test "packages/engine/dist/test/unit/trace-contract.test.js" "packages/engine/dist/test/integration/event-effect-timing.test.js"`
4. `pnpm -F @ludoforge/engine test`

## Outcome

- Completion date: 2026-02-25
- What changed vs originally planned:
  - Added `turnFlowDeferredEventLifecycle` as a new engine-agnostic `TriggerLogEntry` kind with stages `queued`, `released`, and `executed`.
  - Preserved deferred identity across release/execution by introducing a released deferred payload shape carrying `deferredId` and `requiredGrantBatchIds` (instead of lossy release payload conversion).
  - Emitted lifecycle entries at real lifecycle boundaries:
    - queue in `applyTurnFlowEligibilityAfterMove`
    - release in `applyTurnFlowEligibilityAfterMove` (no-grant immediate-release path) and `consumeTurnFlowFreeOperationGrant`
    - executed in `applyReleasedDeferredEventEffects`
  - Updated trigger log schema unions and regenerated `Trace.schema.json` and `EvalReport.schema.json`.
  - Strengthened tests with explicit lifecycle stage assertions in `event-effect-timing.test.ts` and trace-contract/schema acceptance coverage.
- Verification results:
  - `pnpm -F @ludoforge/engine run schema:artifacts` passed.
  - `pnpm turbo build --filter @ludoforge/engine` passed.
  - `node --test dist/test/unit/trace-contract.test.js dist/test/integration/event-effect-timing.test.js dist/test/unit/json-schema.test.js dist/test/unit/schemas-top-level.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo lint --filter @ludoforge/engine` passed.
