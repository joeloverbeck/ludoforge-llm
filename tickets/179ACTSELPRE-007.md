# 179ACTSELPRE-007: Phase 2b — Repair FITL ARVN post-grant witness activation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Unknown — prefer profile/witness repair; use TDD and 1-3-1 if live evidence proves a generic engine defect.
**Deps**: `tickets/179ACTSELPRE-005.md`

## Problem

Ticket 005 configured `arvn-evolved.preview.outcomeGrantContinuation` and re-added `penalizeOpponentMargin`, but the Phase 2 witness stayed red. `reports/179-phase-2-post-opt-in-witness.md` shows the opt-in block was present and enabled on all 159 main-phase action-selection decisions, yet `previewUsage.outcomeGrantContinuation.exitCounts` remained zero. Opponent-margin refs stayed effectively uniform (`currentMargin.nva` differentiated on 0 / 146 reporting decisions; `currentMargin.vc` on 16 / 146).

This successor owns making the FITL ARVN witness actually exercise post-grant opponent-effect paths, then rerunning the Spec 179 Phase 2 gate.

## Assumption Reassessment (2026-05-17)

1. The red witness is not just WASM masking: TS-only one-seed probes with `--no-wasm`, including `--profile-completion arvn-evolved=agentGuided`, also produced zero post-grant continuation exit counts.
2. The profile opt-in is compiled and traced: ticket 005's report records `withBlock=159`, `enabledBlocks=159`, and `extraDepthReached=0`.
3. A sampled ARVN `assault` candidate completed before `outcomeGrantResolve`, so the next owner must classify whether the current profile/witness path fails to select value-bearing continuations or whether a generic preview-driver seam is incomplete.

## Architecture Check

1. Preserve Foundations #1 and #2: FITL remains the witness workload; do not add game-specific logic to engine/kernel code.
2. Preserve Foundation #10: any repair must keep bounded named cap classes and must not raise `postGrant16` beyond the Spec 179 default unless the user approves a boundary reset.
3. Preserve Foundation #15: fix the root activation gap. Do not close on an opt-in trace block that reports zero continuation activity.
4. Preserve Foundation #20: unavailable, capped, or inactive preview signal must remain explicit in trace output and report prose.

## What to Change

### 1. Classify the activation gap

Use the saved red report and a bounded live probe to determine the first missing seam:

- profile completion does not choose opponent-effect continuations,
- the witness action mix rarely reaches opponent-effect candidates,
- the preview driver completes before free-operation / outcome-grant frames are published,
- or a generic engine bug prevents post-grant continuation from observing the expected frame.

### 2. Repair the smallest owned surface

Prefer a profile or witness repair in `data/games/fire-in-the-lake/92-agents.md` or campaign diagnostics if the engine is working as designed. If live evidence proves a generic engine defect, add the smallest focused failing test first and repair that generic seam without FITL-specific branches.

### 3. Rerun the Phase 2 gate

Rerun the same 15-seed witness and update `reports/179-phase-2-post-opt-in-witness.md` with the decisive final result.

## Files to Touch

- `data/games/fire-in-the-lake/92-agents.md` (likely modify — profile/witness repair)
- `reports/179-phase-2-post-opt-in-witness.md` (modify — decisive rerun result)
- `docs/agent-dsl-cookbook.md` (modify only if the repair changes operator-facing opt-in guidance)
- `packages/engine/src/**` and `packages/engine/test/**` (only if TDD proves a generic engine defect)

## Out of Scope

- WASM-route alignment unless the activation gap is proven to be WASM-specific; `tickets/179ACTSELPRE-006.md` remains the optional WASM owner.
- New `previewEffect.*` or standing-vector surfaces; those are Spec 180+ territory.
- Raising the `postGrant16` cap class without user approval.

## Acceptance Criteria

### Tests That Must Pass

1. `reports/179-phase-2-post-opt-in-witness.md` records a final 15-seed witness where `currentMargin.nva` and `currentMargin.vc` each differentiate on >= 50% of reporting decisions with avg range >= 0.5.
2. The same witness records slow-tier wall-time regression <= 5% versus `reports/179-phase-0-pre-opt-in-baseline.md`, or stops for 1-3-1 with exact metrics.
3. `previewUsage.outcomeGrantContinuation.exitCounts` is non-zero and the report classifies completed / capped / stochastic exits.
4. Existing engine suite green: `pnpm -F @ludoforge/engine test`.

### Invariants

1. No FITL-specific engine branches.
2. The profile/witness repair must prove real post-grant activation, not just presence of the opt-in config block.
3. If the gate remains red, the ticket must preserve exact red evidence and stop for user decision rather than lowering thresholds.

## Test Plan

### New/Modified Tests

1. Add or modify a focused test only if the activation gap is a generic engine defect. Otherwise the decisive evidence remains the campaign witness report.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --trace-default all --concurrency 8`
3. `node campaigns/fitl-arvn-agent-evolution/diagnose-action-distribution.mjs`
4. `node campaigns/fitl-arvn-agent-evolution/diagnose-ready-ref-stats.mjs`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm run check:ticket-deps`
