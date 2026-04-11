# 63AGEEVOOBS-002: Decision-type breakdown in VC tournament runner

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — campaign-only
**Deps**: `archive/tickets/63AGEEVOOBS-001.md`

## Problem

The VC agent evolution harness lacks the same decision-type breakdown observability as the ARVN runner. Both FITL tournament runners need parity so the evolution loop can diagnose bottlenecks regardless of which faction is being evolved.

## Assumption Reassessment (2026-04-11)

1. `campaigns/fitl-vc-agent-evolution/run-tournament.mjs` exists (364 lines) — confirmed via glob.
2. The VC runner is structurally identical to the ARVN runner (same line count, same output format) — confirmed.
3. The VC runner also uses `traceLevel: 'verbose'` and includes `agentDecision` in per-seed traces — confirmed by structural similarity.

## Architecture Check

1. Same classification heuristic as 001 — lives in campaign-specific runner, not engine.
2. Port of identical logic — no new design decisions.
3. No backwards-compatibility shims.

## What to Change

### 1. Port `classifyDecision` helper

Copy the `classifyDecision` helper function from the ARVN runner (added in 63AGEEVOOBS-001) to the VC runner.

### 2. Port decision stat accumulation

Apply the same per-seed and cross-seed accumulation logic from 001 to the VC runner's seed loop.

### 3. Port `decisionBreakdown` to trace and summary JSON

Add `decisionBreakdown` to the VC runner's `traceSummary` object and final `result` object, matching the ARVN runner's format exactly.

## Files to Touch

- `campaigns/fitl-vc-agent-evolution/run-tournament.mjs` (modify)

## Out of Scope

- ARVN tournament runner (already done in 63AGEEVOOBS-001)
- Margin trajectory (separate tickets 63AGEEVOOBS-003/004)
- Refactoring shared code between ARVN and VC runners (potential follow-up, not in spec scope)

## Acceptance Criteria

### Tests That Must Pass

1. Run VC tournament with `--seeds 3`: JSON output includes `decisionBreakdown` with all six fields.
2. Per-seed trace files include `decisionBreakdown`.
3. VC `harness.sh` continues to work unchanged.
4. Existing suite: `pnpm turbo build && pnpm turbo test`

### Invariants

1. Engine code is not modified.
2. VC runner output shape matches ARVN runner output shape for `decisionBreakdown`.

## Test Plan

### New/Modified Tests

1. Manual verification: run VC tournament with `--seeds 3` and inspect JSON output and trace files.

### Commands

1. `node campaigns/fitl-vc-agent-evolution/run-tournament.mjs --seeds 3 2>/dev/null | tail -1 | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const j=JSON.parse(d);console.log(JSON.stringify(j.decisionBreakdown,null,2))"`
2. `pnpm turbo build && pnpm turbo test`

## Outcome

- Completed: 2026-04-11
- Ported the archived ARVN decision-breakdown logic into `campaigns/fitl-vc-agent-evolution/run-tournament.mjs`.
- The VC runner now classifies evolved-seat decisions, accumulates per-seed and cross-seed stats, and includes `decisionBreakdown` in both saved trace summaries and the final result JSON.
- Matched the archived ARVN runner’s finite-gap/tie behavior for single-candidate decisions so the two FITL runners stay consistent and the JSON remains numeric.

## Verification Run

- `pnpm -F @ludoforge/engine build`
- `node campaigns/fitl-vc-agent-evolution/run-tournament.mjs --seeds 3 2>/dev/null | tail -1 | node -e "const d=require('fs').readFileSync(0,'utf8'); const j=JSON.parse(d); console.log(JSON.stringify(j.decisionBreakdown,null,2));"`
- `node campaigns/fitl-vc-agent-evolution/run-tournament.mjs --seeds 1 --trace-all false --trace-seed 1000 >/dev/null 2>/dev/null && node -e "const t=JSON.parse(require('fs').readFileSync('campaigns/fitl-vc-agent-evolution/last-trace.json','utf8')); console.log(JSON.stringify(t.decisionBreakdown,null,2));"`
- `pnpm turbo build`
- `pnpm turbo test`
