# FITLGOLT4-006: Add Deferred Event Effect Lifecycle Trace Entries

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — turn-flow/apply-move trace emission, trace schema
**Deps**: archive/tickets/FITLGOLT4-002.md

## Problem

Deferred event effects are now queued and released, but the trace stream does not explicitly record when a deferred payload is created, released, and executed. This reduces debuggability and makes root-cause analysis of ordering behavior harder in deterministic replay workflows.

## Assumption Reassessment (2026-02-25)

1. Deferred payloads are enqueued in turn-flow runtime and released on free-op grant consumption.
2. Current trace entries cover regular turn-flow and action execution but do not expose explicit deferred lifecycle phases.
3. Existing FITLGOLT4 tickets do not include observability contracts for deferred lifecycle tracing.

## Architecture Check

1. Explicit lifecycle tracing improves long-term maintainability and deterministic debugging without altering gameplay semantics.
2. The trace model remains engine-agnostic (no FITL-specific fields or branching).
3. No compatibility shim is required; this is additive trace expressiveness for current architecture.

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

### 3. Update trace schemas/contracts

Update trace schema extensions and generated artifacts so entries are validated and serialized consistently.

## Files to Touch

- `packages/engine/src/kernel/types-turn-flow.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
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
