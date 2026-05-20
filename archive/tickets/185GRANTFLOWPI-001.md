# 185GRANTFLOWPI-001: Phase 1 — Preview status integrity for un-driven grant obligations

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/` (policy-preview finalization status, policy-eval ref stats + summary), kernel types-core trace breakdown
**Deps**: `archive/specs/185-grant-flow-preview-integrity.md`

## Problem

The action-selection preview finalizes (`completed`) when the decision stack empties — including when a pending free-operation grant has only been marked `offered` by `outcomeGrantResolve` but its effect has not executed (effects execute later via a separate `freeOperation: true` move; verified `microturn/apply.ts:746-770` marks `offered` and pops the frame, while `apply-move.ts:1417-1462` runs effects). The ref layer then records numeric `ready` values against that pre-effect state: `summarizeReadyRefStats` includes any candidate whose `previewOutcome === 'ready'` (`policy-eval.ts:1500-1553`), and `summarizePreviewOutcomes` collapses `postGrantCap` into the `depthCap` counter (`policy-eval.ts:1637-1639`). This is the Foundation #20 violation at the heart of the uniform FITL ARVN opponent-margin preview: `preview.victory.currentMargin.<nva|vc>` reports `ready` (~75% of the time) even though it was resolved before any opponent-affecting effect landed.

This ticket stops the false-`ready` lie with **no continuation-behavior change** — the lowest-risk, highest-integrity-value slice. Phase 2 (ticket 003) later drives the continuation so the effects actually become visible; this ticket guarantees that until then (and whenever continuation is capped), the refs are honestly non-`ready`.

## Assumption Reassessment (2026-05-20)

1. `PolicyPreviewTraceOutcome` (`policy-preview.ts:167-176`) is a union `ready | stochastic | random | hidden | unresolved | failed | depthCap | postGrantCap | noPreviewDecision | gated` — verified this session. There is **no** status representing "stopped at an offered/unresolved grant obligation"; this ticket adds `grantFlowPartial`.
2. `summarizeReadyRefStats` includes a candidate iff `previewOutcome === 'ready'` (`policy-eval.ts:1500-1553`); `summarizePreviewOutcomes` collapses `postGrantCap` into `depthCap` (`policy-eval.ts:1637-1639`); `PolicyPreviewOutcomeBreakdownTrace` aggregates unavailability categories — all verified this session.
3. Grant lifecycle phases are `sequenceWaiting | ready | offered | consumed | exhausted | skipped | expired` (`contracts/turn-flow-free-operation-grant-contract.ts:87`); the `offered` phase is the pre-effect state this ticket must detect.
4. `freeOperationCap` is declared as a summary counter here per spec §4.4 but is only *populated* once continuation exists (ticket 003) and can hit a free-operation cap; until then it stays `0`. This is intentional, not dead code.

## Architecture Check

1. The fix lands at the ref-resolution layer (where the lie manifests), not only at the drive outcome — the drive returns `completed` and the ref layer must not promote that to `ready` for opponent/standing refs when an in-chain grant obligation remains unresolved. This is the architecturally complete location (Foundation #15).
2. No game-specific logic: detection keys on the generic pending-free-operation-grant phase and the origin candidate's seat/turn, never on FITL/NVA/VC identifiers (Foundation #1).
3. No backwards-compatibility shim: the new status is added to the existing union and all repository-owned consumers (ref stats, summary, seat-matrix, turn-shape mapping) are updated in this change (Foundation #14).
4. Foundation #20 is the load-bearing principle — unavailable preview refs must expose a distinct non-`ready` status and not be silently coerced into numeric contributions.

## What to Change

### 1. Add `grantFlowPartial` finalization status

In `policy-preview.ts`, when `driveSyntheticCompletion` finalizes (`completed`) but the finalized state has a pending free-operation grant in phase `offered` (conservatively also `ready`/`sequenceWaiting`) that belongs to the origin candidate's consequence chain — in Phase 1, conservatively: same origin seat and turn, grant created during the candidate's application — the opponent/standing refs resolved against that state MUST carry a non-`ready` status. Add `grantFlowPartial` to `PolicyPreviewTraceOutcome` (and the unavailability-reason union it composes). Self-only refs already resolved on the finalized state remain `ready`.

### 2. Ref-layer enforcement

In `policy-eval.ts`: `summarizeReadyRefStats` and `allReadyValuesUniform` MUST exclude refs whose candidate finalized with a non-`ready` grant-flow status. `allReadyValuesUniform` MUST NOT trigger deepening or no-signal classification on excluded refs.

### 3. Seat-matrix integrity

In `policy-evaluation-core.ts`, per-candidate × per-seat trace recording (Spec 180 surface) must carry the per-seat status when a role resolution is unavailable due to a pre-effect grant-flow state.

### 4. Un-collapse the summary

In `policy-eval.ts`, keep `postGrantCap` distinct from ordinary `depthCap`; add `freeOperationCap` and `grantFlowPartial` counters. Add the corresponding fields to `PolicyPreviewOutcomeBreakdownTrace` in `kernel/types-core.ts`.

### 5. Turn-shape mapping

Ensure `turnShapePreviewStatus` (`turn-shape-eval.ts:40-56`) maps `grantFlowPartial` to `partial` (it already maps `postGrantCap`/`depthCap` to `partial`).

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — finalization status, union)
- `packages/engine/src/agents/policy-eval.ts` (modify — readyRefStats, allReadyValuesUniform, summarizePreviewOutcomes)
- `packages/engine/src/agents/policy-evaluation-core.ts` (modify — seat-matrix status)
- `packages/engine/src/agents/turn-shape-eval.ts` (modify — status mapping)
- `packages/engine/src/kernel/types-core.ts` (modify — `PolicyPreviewOutcomeBreakdownTrace` fields)
- `packages/engine/test/architecture/preview-signal-integrity/grant-flow-status.test.ts` (new)

## Out of Scope

- Driving the continuation to execute granted effects — that is ticket 003 (Phase 2). This ticket only makes the un-driven/capped state honest.
- Populating `freeOperationCap` (declared here, populated by ticket 003) and the `grantFlow` cap-class registry (ticket 002).
- Trace segments / exit-reason taxonomy (ticket 004) and WASM parity (ticket 005).

## Acceptance Criteria

### Tests That Must Pass

1. A preview finalizing at an `offered` (or unresolved) in-chain grant reports a non-`ready` status (`grantFlowPartial`) for opponent/standing refs; self-only refs resolved on the finalized state stay `ready`.
2. `summarizeReadyRefStats` and `allReadyValuesUniform` exclude such refs; no deepening / no-signal classification fires on them.
3. `summarizePreviewOutcomes` reports `postGrantCap`, `freeOperationCap`, and `grantFlowPartial` distinctly from `depthCap`.
4. Against current FITL ARVN candidates, the previously `ready`-uniform `preview.victory.currentMargin.<nva|vc>` refs now report a non-`ready` grant-flow status.
5. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. No opponent/standing preview ref resolves as `ready` against a state with an unresolved in-chain free-operation grant obligation (Foundation #20).
2. Continuation behavior is unchanged by this ticket — the drive still stops where it did before; only the reported status and ref-stat inclusion change.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-signal-integrity/grant-flow-status.test.ts` — stopped-before-grant-effect → `grantFlowPartial`/unavailable; `postGrantCap` distinct from `depthCap`; `readyRefStats` excludes partial refs; `allReadyValuesUniform` does not fire on partial refs. Mark `// @test-class: architectural-invariant`.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/architecture/preview-signal-integrity/grant-flow-status.test.js`
2. `pnpm turbo lint && pnpm turbo typecheck && pnpm -F @ludoforge/engine test`

## Outcome

Completed: 2026-05-20

What changed:

- Added `grantFlowPartial` as a preview unavailability/status reason for previews that stop with a newly unresolved same-seat free-operation grant obligation, while preserving self-only preview refs as value-bearing when they can still be resolved from the finalized state.
- Added `freeOperationCap` to the trace/status vocabulary and outcome breakdown as the Phase 1-declared future cap bucket; it remains zero until the continuation/cap work in later Spec 185 tickets can populate it.
- Kept `postGrantCap` distinct from `depthCap` in preview usage summaries and inner-preview summaries.
- Updated policy diagnostics, seat-matrix/turn-shape status handling, trace types, Zod schemas, generated `Trace.schema.json`, and existing trace fixtures/goldens for the expanded outcome-breakdown contract.
- Added `packages/engine/test/architecture/preview-signal-integrity/grant-flow-status.test.ts` to prove opponent/standing refs are `grantFlowPartial`, self-only refs remain usable, ready-ref stats exclude the partial refs, and cap counters remain distinct.

Deviations from original plan:

- `packages/engine/src/agents/policy-evaluation-core.ts` did not require a direct edit. Seat-matrix integrity is carried by the existing status propagation path once `grantFlowPartial` is surfaced by preview resolution and accepted by trace/status consumers.
- The ticket's source-size gate used the user-approved 2026-05-20 Option 1 minimal-touch deferral for pre-existing oversized source files. No extraction/refactor was folded into this ticket.

Generated artifact provenance:

- `packages/engine/schemas/Trace.schema.json` was regenerated with `pnpm -F @ludoforge/engine run schema:artifacts` from `packages/engine/src/kernel/schemas-core.ts`/`types-core.ts`.
- Golden trace fixtures were refreshed only to include the new zero-valued outcome-breakdown fields required by the trace contract.

Verification:

- `pnpm -F @ludoforge/engine build` — passed.
- `node --test packages/engine/dist/test/architecture/preview-signal-integrity/grant-flow-status.test.js` — passed.
- `node --test packages/engine/dist/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.js packages/engine/dist/test/architecture/preview-post-grant/post-grant-cap-exit-witness.test.js packages/engine/dist/test/architecture/preview-post-grant/trace-shape-outcome-grant-continuation.test.js` — passed.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — passed.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `node --test packages/engine/dist/test/integration/policy-preview-inner-fitl-canary-golden.test.js` — passed after the golden fixture contract refresh.
- `pnpm -F @ludoforge/engine test` — passed, `160/160 files passed`.

Source-size ledger:

- `packages/engine/src/agents/policy-preview.ts`: 1367 -> 1410 lines, pre-existing oversized file, +43 lines for grant-flow detection/status.
- `packages/engine/src/agents/policy-eval.ts`: 1706 -> 1720 lines, pre-existing oversized file, +14 lines for distinct counters/ref-stat filtering.
- `packages/engine/src/agents/policy-preview-inner.ts`: 640 -> 651 lines, pre-existing oversized file, +11 lines for mirrored outcome-breakdown counters.
- `packages/engine/src/agents/policy-agent.ts`: 936 -> 942 lines, pre-existing oversized file, +6 lines for optional advisory counters.
- `packages/engine/src/kernel/types-core.ts`: 2737 -> 2744 lines, pre-existing oversized file, +7 lines for trace type expansion.
- `packages/engine/src/kernel/schemas-core.ts`: 3025 -> 3033 lines, pre-existing oversized file, +8 lines for schema enum/breakdown expansion.
- `packages/engine/src/agents/turn-shape-eval.ts`: 97 -> 99 lines, within guidance.
- `packages/engine/test/architecture/preview-signal-integrity/grant-flow-status.test.ts`: new, 200 lines.

Archive status:

- Ready to archive. Remaining Spec 185 work stays in active tickets `185GRANTFLOWPI-002` through `185GRANTFLOWPI-006`.
