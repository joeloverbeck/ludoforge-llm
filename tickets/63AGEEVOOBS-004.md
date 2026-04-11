# 63AGEEVOOBS-004: Per-decision margin trajectory in VC tournament runner

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — campaign-only
**Deps**: `archive/tickets/63AGEEVOOBS-003.md`

## Problem

The VC agent evolution harness lacks the same margin trajectory observability as the ARVN runner. Both FITL tournament runners need parity so the evolution loop can diagnose margin-impacting decisions regardless of which faction is being evolved.

## Assumption Reassessment (2026-04-11)

1. `campaigns/fitl-vc-agent-evolution/run-tournament.mjs` exists (364 lines) — confirmed.
2. The VC runner is structurally identical to the ARVN runner — confirmed.
3. VC agent profile also defines `selfMargin` — to be verified during implementation (if not, margin fields will be `null` per the null-safety design from 003).

## Architecture Check

1. Same margin trajectory logic as 003 — lives in campaign-specific runner, not engine.
2. Port of identical logic — no new design decisions.
3. No backwards-compatibility shims.

## What to Change

### 1. Port selfMargin extraction

Copy the selfMargin extraction logic from the ARVN runner (added in 63AGEEVOOBS-003) to the VC runner's seed loop.

### 2. Port marginAfter/marginDelta computation

Apply the same margin computation logic from 003: `marginAfter` from the next evolved-seat decision, `marginDelta` as the difference, last move uses `evolvedMargin`.

### 3. Port margin fields to per-seed trace evolvedMoves

Enrich each evolved move in the VC runner's `traceSummary.evolvedMoves` with `marginBefore`, `marginAfter`, `marginDelta`, matching the ARVN runner's format exactly.

## Files to Touch

- `campaigns/fitl-vc-agent-evolution/run-tournament.mjs` (modify)

## Out of Scope

- ARVN tournament runner (already done in 63AGEEVOOBS-003)
- Decision-type breakdown (separate tickets 63AGEEVOOBS-001/002)
- Refactoring shared code between ARVN and VC runners

## Acceptance Criteria

### Tests That Must Pass

1. Run VC tournament with `--seeds 3 --trace-all false --trace-seed 1000`: `last-trace.json` includes `marginBefore`, `marginAfter`, `marginDelta` for each evolved move.
2. `marginDelta` equals `marginAfter - marginBefore` for every non-null move.
3. Last move's `marginAfter` equals the seed's `evolvedMargin`.
4. Existing suite: `pnpm turbo build && pnpm turbo test`

### Invariants

1. Engine code is not modified.
2. VC runner trace shape matches ARVN runner trace shape for margin fields.

## Test Plan

### New/Modified Tests

1. Manual verification: run VC tournament with `--seeds 3 --trace-all false --trace-seed 1000`, inspect `last-trace.json` for margin fields.

### Commands

1. `node campaigns/fitl-vc-agent-evolution/run-tournament.mjs --seeds 3 --trace-all false --trace-seed 1000 && node -e "const t=JSON.parse(require('fs').readFileSync('campaigns/fitl-vc-agent-evolution/last-trace.json','utf8'));t.evolvedMoves.slice(0,3).forEach((m,i)=>console.log(i,m.marginBefore,m.marginAfter,m.marginDelta))"`
2. `pnpm turbo build && pnpm turbo test`
