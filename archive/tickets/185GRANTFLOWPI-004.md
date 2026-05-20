# 185GRANTFLOWPI-004: Phase 3 — Exit-reason taxonomy and grant-flow trace provenance

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/agents/` (policy-preview exit reasons, policy-eval summary counters, trace), kernel types-core (trace schema)
**Deps**: `archive/tickets/185GRANTFLOWPI-003.md`

## Problem

Once ticket 003 drives the grant-flow continuation, the preview must report *how* it exited and *what* it did, so operators and witnesses can distinguish "completed through the effect" from "stopped at a cap" from "stopped before the effect". Ticket 003 added the minimal `freeOperationCap` enum/counter plumbing needed for its reachable cap exit, but the ordered per-candidate provenance remains coarse. This ticket completes the §6.2 taxonomy: distinct exit reasons, ordered per-candidate trace segments, and any remaining richer summary presentation beyond the minimal 003 counter surface.

## Assumption Reassessment (2026-05-20)

1. Tickets 001 and 003 added the minimal `grantFlowPartial`/`postGrantCap`/`freeOperationCap` counter surfaces and ticket 003 made `freeOperationCap` reachable via continuation. This ticket owns the richer ordered trace/provenance surface and any remaining summary presentation needed for that taxonomy.
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

### 3. Preserve and extend summary counters as needed

Keep the minimal counter surface from tickets 001/003 intact and extend it only as needed for the ordered trace taxonomy. `PolicyPreviewOutcomeBreakdownTrace` must continue to distinguish `postGrantCap`, `freeOperationCap`, and `grantFlowPartial`.

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

## Outcome

Completed on 2026-05-20.

What landed:

- Added `grantFlowSegments` to `PolicyPreviewDriveTrace` and the exported trace schema. The preview drive now records ordered generic grant-flow provenance for `outcomeGrantResolve`, grant offer, free-operation action selection, selected free operation, inner choices, deferred-effect release, and grant terminal lifecycle segments.
- Preserved the existing `postGrantCap`, `freeOperationCap`, and `grantFlowPartial` outcome/counter behavior from tickets 001/003. `policy-eval.ts` and `turn-shape-eval.ts` were verified-no-edit because their current summary counters and partial-status mapping already covered this ticket's status taxonomy.
- Added `packages/engine/test/architecture/preview-trace/grant-flow-trace.test.ts` for completed and capped grant-flow trace paths.
- Extended `packages/engine/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.ts` so the smoke fixture asserts the ordered trace path and drive depth while still leaving effect-complete behavior to the free-operation fixture from ticket 003.
- Regenerated `packages/engine/schemas/Trace.schema.json` after the public trace shape changed.

Scope notes:

- No WASM parity or fallback work was done; ticket 005 still owns that.
- No FITL-like or ARVN end-to-end witness was added; ticket 006 still owns that.
- No `policy-eval.ts` edit was needed beyond existing ticket 001/003 summary counters; no `turn-shape-eval.ts` edit was needed because capped/partial grant-flow outcomes already map to `partial`.

Source-size hard-gate ledger:

| path | before lines | after lines | crossed cap? | active growth | extraction/defer rationale | successor |
| --- | ---: | ---: | --- | ---: | --- | --- |
| `packages/engine/src/agents/policy-preview.ts` | 1498 | 1583 | no; preexisting over 800 | +85 | Existing user-approved 2026-05-20 Spec 185 Option 1 minimal-touch deferral from the harness state applies; extracting trace capture would widen this ticket beyond the local preview-drive provenance seam. | none for 004 |
| `packages/engine/src/kernel/types-core.ts` | 2750 | 2772 | no; preexisting over 800 | +22 | Existing user-approved 2026-05-20 Spec 185 Option 1 minimal-touch deferral applies; this is a narrow public trace type extension. | none for 004 |
| `packages/engine/src/kernel/schemas-core.ts` | 3038 | 3061 | no; preexisting over 800 | +23 | Existing user-approved 2026-05-20 Spec 185 Option 1 minimal-touch deferral applies; this mirrors the public trace schema type. | none for 004 |

Verification:

- `pnpm turbo build` — initially failed on a local TypeScript scope error in the new trace helper; fixed, then passed.
- `node --test packages/engine/dist/test/architecture/preview-trace/grant-flow-trace.test.js packages/engine/dist/test/architecture/preview-post-grant/post-grant-continuation-differentiates.test.js packages/engine/dist/test/architecture/preview-post-grant/trace-shape-outcome-grant-continuation.test.js packages/engine/dist/test/architecture/preview-post-grant/post-grant-free-operation-continuation.test.js packages/engine/dist/test/architecture/preview-post-grant/post-grant-cap-exit-witness.test.js packages/engine/dist/test/architecture/preview-post-grant/grant-flow-consequence-chain-boundary.test.js` — passed, 11 tests.
- `pnpm -F @ludoforge/engine run schema:artifacts:check` — initially failed because `Trace.schema.json` was out of sync; regenerated schemas and reran green.
- `pnpm turbo lint` — passed.
- `pnpm turbo typecheck` — passed.
- `pnpm -F @ludoforge/engine test` — passed, 163/163 files.
