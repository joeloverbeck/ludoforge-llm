# 180STDVECOBSROL-004: Phase 3 - previewUsage seat matrix

**Status**: COMPLETED
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

## Implementation Outcome (2026-05-17)

Status: completed.

What landed:

1. `previewUsage.seatMatrix.byCandidate.<stableMoveKey>.perSeatRefs.<refName>.<seatId>` is recorded while evaluating preview refs inside `seatAgg`. Ready cells include `{ status: "ready", value }`; unavailable cells reuse the existing preview outcome status vocabulary.
2. The matrix is omitted when preview refs are evaluated outside a seat aggregate.
3. `PolicyPreviewUsageTrace` and the generated trace schema include the optional `seatMatrix` block. The schema generator rewrote `GameDef.schema.json`, `Trace.schema.json`, and `EvalReport.schema.json`; only `Trace.schema.json` persisted as a diff because it serializes this ticket-owned trace contract.
4. Focused trace-shape and determinism tests were added for matrix presence, hidden/unavailable statuses, off-by-default behavior, and byte-identical matrix JSON.

Touched-file scope:

- Done: `packages/engine/src/agents/policy-eval.ts`
- Done: `packages/engine/src/agents/policy-evaluation-core.ts`
- Done: `packages/engine/src/kernel/types-core.ts`
- Done: `packages/engine/src/kernel/schemas-core.ts`
- Done: `packages/engine/schemas/Trace.schema.json`
- Done: trace-shape test `packages/engine/test/architecture/preview-standing/spec-180-seat-matrix-trace.test.ts`
- Done: determinism test `packages/engine/test/determinism/spec-180-seat-matrix-replay-identity.test.ts`
- Owned test fixture support: `packages/engine/test/architecture/preview-standing/standing-preview-fixture.ts`

Source-size ledger:

| Path | Before lines | After lines | Crossed cap? | Active growth | Extraction/defer rationale | Successor |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/agents/policy-eval.ts` | 1582 | 1613 | preexisting oversize + active growth | +31 | User approved Option 1 source-size deferral; file is the canonical previewUsage summarizer hub and extraction would widen the Phase 3 trace-contract ticket. | none |
| `packages/engine/src/agents/policy-evaluation-core.ts` | 2246 | 2280 | preexisting oversize + active growth | +34 | User approved Option 1 source-size deferral; file is the canonical evaluator hub where preview ref resolution and `seatAgg` seat context meet. | none |
| `packages/engine/src/kernel/types-core.ts` | 2346 | 2376 | preexisting oversize + active growth | +30 | User approved Option 1 source-size deferral; file is the canonical exported trace type hub. | none |
| `packages/engine/src/kernel/schemas-core.ts` | 2780 | 2799 | preexisting oversize + active growth | +19 | User approved Option 1 source-size deferral; file is the canonical trace schema source hub. | none |

Verification plan:

1. `pnpm -F @ludoforge/engine build` - passed after the ticket outcome transcription.
2. `node --test packages/engine/dist/test/architecture/preview-standing/spec-180-seat-matrix-trace.test.js packages/engine/dist/test/determinism/spec-180-seat-matrix-replay-identity.test.js` - passed after the ticket outcome transcription.
3. `pnpm -F @ludoforge/engine run schema:artifacts:check` - passed after schema regeneration and after the ticket outcome transcription.
4. `pnpm -F @ludoforge/engine test` - passed after fixing same-package verification fallout in the new determinism test marker (`@test-class: architectural-invariant`). The lane emitted normal class-summary advisory labels for convergence/golden/unclassified buckets; no ticket-owned failures remained.
5. `pnpm run check:ticket-deps` - passed post-status (`6 active tickets and 2404 archived tickets`).

Late-edit proof validity:

- No-invalidation: terminal status/proof transcription and post-status dependency-check transcription only; no scope, acceptance, command semantics, touched-file ownership, follow-up ownership, dependency ownership, or source/test/schema behavior changed.
