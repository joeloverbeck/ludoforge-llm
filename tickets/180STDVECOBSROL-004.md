# 180STDVECOBSROL-004: Phase 3 - previewUsage seat matrix

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes - trace metadata and schema.
**Deps**: `archive/tickets/180STDVECOBSROL-001.md`

## Problem

`previewUsage.readyRefStats` summarizes preview refs by ref name, but it does not show which candidate and seat produced a ready, hidden, depth-capped, or unresolved value. Spec 180 needs a bounded per-candidate x per-seat matrix so ordinary-operation standing signal can be debugged without custom one-off trace scripts.

## Assumption Reassessment (2026-05-17)

1. The trigger report needed a custom aggregation script because the trace lacks per-seat matrix data.
2. The matrix should be materialized only when active considerations request preview seat aggregates or standing projection.
3. The matrix reuses existing preview outcome statuses; no new status taxonomy is needed.

## Architecture Check

1. Matrix size is bounded by candidate cap x seat count x requested refs.
2. Trace additions are deterministic and schema-backed.
3. The matrix is diagnostic metadata, not an alternate rules engine.

## What to Change

### 1. Materialize the matrix on demand

Add `previewUsage.seatMatrix.byCandidate.<stableMoveKey>.perSeatRefs.<refName>.<seatId>` when requested refs need it.

### 2. Update trace schema and tests

Pin the serialized shape and replay identity for matrix-bearing traces.

## Files to Touch

- `packages/engine/src/agents/policy-eval.ts` (modify)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify if evaluator supplies per-seat status)
- `packages/engine/src/kernel/types-core.ts` and `packages/engine/src/kernel/schemas-core.ts` (modify)
- `packages/engine/schemas/*.json` (regenerate)
- trace-shape and determinism tests under `packages/engine/test/`

## Out of Scope

- Role primitives.
- FITL ARVN campaign witness.
- New score semantics beyond reporting already-computed status cells.

## Acceptance Criteria

### Tests That Must Pass

1. Matrix appears for a profile that requests preview seat aggregates or standing projection.
2. Matrix is omitted for profiles without those requests.
3. Same seed produces byte-identical matrix JSON.
4. Generated trace schema is in sync.

### Invariants

1. Matrix generation remains bounded and deterministic.
2. Matrix status values reuse `PolicyPreviewTraceOutcome`.

## Test Plan

### New/Modified Tests

1. Trace-shape test for `previewUsage.seatMatrix`.
2. Determinism test for byte-identical matrix output.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Focused compiled trace-shape and determinism tests.
3. `pnpm -F @ludoforge/engine run schema:artifacts:check`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm run check:ticket-deps`
