# 149FITLEVNUMVM-003: CI restoration unwind (post-Phase-4)

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — CI workflow restoration only
**Deps**: `archive/tickets/149FITLEVNUMVM-001.md`, `tickets/149FITLEVNUMVM-002.md`, `tickets/149FITLEVNUMVM-016.md`

## Problem

Phase 0 (tickets 001 + 002) bumped CI workflow budgets and/or marked slow lanes non-blocking as a tactical unblock. Per spec 149 §Phase 0 and §Phase 4 acceptance criteria, those bumps must be reverted in a single commit once Phase 4 lands and per-card cost ≤ 250 ms is verified. This ticket tracks the unwind.

**Gate condition**: Close this ticket only when ticket 016 has closed AND `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` passes at the 250 ms target on all 4 baseline profiles (`verifyIncrementalHash=true`) for ≥3 consecutive CI runs.

## Assumption Reassessment (2026-04-28)

1. Tickets 001 and 002 land Phase 0 CI bumps; the exact deltas are recorded in their Outcome sections at completion time. This ticket's scope is to revert whatever those tickets changed.
2. Ticket 016 is the Phase 4 default-flip + closure-tree deletion ticket; its acceptance includes the ≤250 ms perf gate.
3. The "single commit" requirement comes from spec §Phase 0 and is preserved here — split commits would leave intermediate states with mismatched expectations.

## Architecture Check

1. Single-commit revert ensures branch CI is consistent at every point along the rollout. F8 determinism is unaffected (CI configuration only).
2. Configuration-only; F1 preserved trivially.
3. Closing the loop on the F15 tactical/strategic split: Phase 0 was tactical, Phase 4 is the strategic answer, and this ticket is the architectural completion.

## What to Change

### 1. Confirm gate condition

Before any edits, verify:
- Ticket 016 Status is CLOSED.
- Latest 3+ consecutive CI runs on PR #231 (or main, if merged) show `fitl-per-card-cost.perf.test.ts` passing at ≤ 250 ms on all 4 baseline profiles.
- Sihanouk and March-Free-Operation integration tests complete within their pre-bump budgets.

If gate condition is not met, do NOT execute. Close this ticket as "Declined — gate condition not met" with a follow-up ticket if the perf target is revisited.

### 2. Revert `.github/workflows/engine-determinism.yml`

Restore `timeout-minutes: 60` → `timeout-minutes: 30` on the determinism job (the bump landed in ticket 001).

### 3. Revert `.github/workflows/engine-tests.yml`

Restore the `slow-parity-shard-*` matrix entries to their pre-bump state:
- Remove any `continue-on-error: true` entries added by ticket 002.
- Restore `lane.timeout: 30` if ticket 002 bumped them.

Reference ticket 002's Outcome section for the exact entries that were modified.

### 4. Single commit

All four reverts (job-level timeout, matrix-level changes, any per-test mechanism) land in a single commit per spec §Phase 0.

## Files to Touch

- `.github/workflows/engine-determinism.yml` (modify — revert)
- `.github/workflows/engine-tests.yml` (modify — revert)

## Out of Scope

- Engine source changes — none.
- Reverting Phase 1-4 ticket implementations — those are the architectural answer, not bumps.
- Adding new perf gates or extending lane manifests — separate tickets if needed.

## Acceptance Criteria

### Tests That Must Pass

1. After revert, full CI runs green on PR #231 (or main): determinism shards complete within 30 m, slow-parity-shards complete within 30 m and are blocking again.
2. `fitl-per-card-cost.perf.test.ts` continues to pass at ≤ 250 ms (recalibrated by ticket 016).
3. Existing suite: `pnpm turbo build && pnpm turbo lint`.

### Invariants

1. No silent retention of any Phase 0 bump in either workflow file post-revert.
2. CI gating semantics fully restored — no `continue-on-error` left on determinism or slow-parity shards.
3. Per F14, no fallback configuration shims retained.

## Test Plan

### New/Modified Tests

1. None — restoration of pre-bump CI behavior.

### Commands

1. `git diff main -- .github/workflows/engine-determinism.yml .github/workflows/engine-tests.yml` — confirm revert is byte-equivalent to pre-001/pre-002 state.
2. `pnpm turbo build`.
3. After push, observe full CI run completing within restored budgets.
