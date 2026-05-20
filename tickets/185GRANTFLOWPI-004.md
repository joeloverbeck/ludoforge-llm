# 185GRANTFLOWPI-004: Phase 3 — Exit-reason taxonomy and grant-flow trace provenance

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/` (policy-preview exit reasons, policy-eval summary counters, trace), kernel types-core (trace schema)
**Deps**: `tickets/185GRANTFLOWPI-003.md`

## Problem

Once ticket 003 drives the grant-flow continuation, the preview must report *how* it exited and *what* it did, so operators and witnesses can distinguish "completed through the effect" from "stopped at a cap" from "stopped before the effect". Today the drive's exit reasons are coarse and `summarizePreviewOutcomes` collapses `postGrantCap` into `depthCap` (ticket 001 began un-collapsing it). This ticket completes the §6.2 taxonomy: distinct exit reasons, ordered per-candidate trace segments, and fully-populated summary counters (including `freeOperationCap`, which ticket 003 made reachable).

## Assumption Reassessment (2026-05-20)

1. Ticket 001 added the `grantFlowPartial`/`freeOperationCap` summary counter fields and un-collapsed `postGrantCap`; ticket 003 made `freeOperationCap` reachable via continuation. This ticket populates and surfaces them.
2. The WASM drive (`policy-wasm-preview-drive.ts:26`) does not emit the new statuses; bringing it to parity is ticket 005, explicitly out of scope here.
3. `turnShapePreviewStatus` (`turn-shape-eval.ts:40-56`) already maps capped outcomes to `partial`; new exit reasons must map consistently.

## Architecture Check

1. Trace provenance is the Foundation #9 (replay/auditability) + Foundation #20 (preview integrity) mechanism that makes the continuation's behavior inspectable; recording it where the drive runs keeps it authoritative.
2. Exit reasons and segments are generic (grant offer, free-operation selection, inner choice, grant consumption, deferred effects) — no game-specific names (Foundation #1).
3. The active cap class is surfaced in trace and reproducibility metadata (Foundation #10), completing the registry work from ticket 002.

## What to Change

### 1. Distinct exit reasons (§6.2)

`completed`, `stochastic`, `depthCap`, `postGrantCap`, `freeOperationCap`, `grantFlowPartial`, `failed` — each distinct in the drive's return and propagated to the ref/summary layer. Map each to the right `turnShapePreviewStatus` (`partial` for capped/partial; `unavailable`/`ready` as appropriate).

### 2. Ordered trace segments

Record per candidate: `stableMoveKey`, root `actionId`, preview mode, completion policy, grant-continuation enabled/capClass/cap, and ordered segments — `outcomeGrantResolve`, `grantOffered`, `freeOperationActionSelection`, `selectedFreeOperation`, `innerChoice`, `grantConsumed`/`grantSkipped`/`grantExpired`, `deferredEffectsReleased` — plus `exitReason` and final status. Extend the trace schema in `kernel/types-core.ts`.

### 3. Fully populate summary counters

`summarizePreviewOutcomes` records `freeOperationCap` and `grantFlowPartial` from real continuation outcomes; `PolicyPreviewOutcomeBreakdownTrace` reflects them.

### 4. Extend the existing smoke fixture

Update `post-grant-continuation-differentiates.test.ts` to assert the cap class + depth appear in the usage summary and that it makes no claim operation effects executed (it remains a lifecycle smoke test).

## Files to Touch

- `packages/engine/src/agents/policy-preview.ts` (modify — exit reasons, trace segments)
- `packages/engine/src/agents/policy-eval.ts` (modify — populate counters, summary)
- `packages/engine/src/agents/turn-shape-eval.ts` (modify — status mapping for new exit reasons)
- `packages/engine/src/kernel/types-core.ts` (modify — trace schema segments)
- `packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts` (modify)
- `packages/engine/test/architecture/preview-trace/grant-flow-trace.test.ts` (new)

## Out of Scope

- WASM parity-or-fallback (ticket 005).
- The end-to-end FITL witnesses (ticket 006).
- Defining cap-class budgets (ticket 002); this ticket only surfaces the active class in trace.

## Acceptance Criteria

### Tests That Must Pass

1. Trace records the §6.2 segments and a distinct `exitReason` for grant-flow candidates.
2. Each cap exit is surfaced as its specific cap (`postGrantCap` vs `freeOperationCap` vs `depthCap`), not as `failed` or `ready`; the active cap class appears in the usage summary.
3. `summarizePreviewOutcomes` reports `freeOperationCap` and `grantFlowPartial` from real outcomes.
4. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Cap exit is deterministic and surfaced as a cap (Foundation #10).
2. Every grant-flow candidate's trace is sufficient to reconstruct its continuation path (Foundation #9).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/architecture/preview-trace/grant-flow-trace.test.ts` — asserts cap class, depth, selected grant/free-operation action, and exit reason across completion / depthCap / postGrantCap / freeOperationCap / stochastic / failure. `// @test-class: architectural-invariant`.
2. `packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts` (modify) — add cap-class/depth usage-summary assertions.

### Commands

1. `pnpm turbo build && node --test packages/engine/dist/test/architecture/preview-trace/grant-flow-trace.test.js`
2. `pnpm turbo lint && pnpm turbo typecheck && pnpm -F @ludoforge/engine test`
