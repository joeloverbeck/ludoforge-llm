# 149FITLEVNUMVM-003: CI restoration unwind (post-Phase-4)

**Status**: PENDING — engine-tests blocking semantics restored early; determinism timeout unwind still post-Phase-5/016
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — CI workflow restoration only
**Deps**: `archive/tickets/149FITLEVNUMVM-001.md`, `archive/tickets/149FITLEVNUMVM-002.md`, `archive/tickets/149FITLEVNUMVM-018.md`, `tickets/149FITLEVNUMVM-016.md`, `archive/tickets/150FITLWASM-001.md`

## Problem

Phase 0 (tickets 001 + 002) bumped CI workflow budgets and/or marked slow lanes non-blocking as a tactical unblock. Per spec 149 §Phase 0 and §Phase 4 acceptance criteria, those bumps must be reverted in a single commit once Phase 4 lands and per-card cost ≤ 250 ms is verified. This ticket tracks the unwind.

**Gate condition**: Close this ticket only when ticket 016 has closed AND `packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` passes at the 250 ms target on all 4 baseline profiles (`verifyIncrementalHash=true`) for ≥3 consecutive CI runs.

**2026-05-02 gate update**: Ticket 016 is blocked by a live Phase 4 perf-gate reassessment. User-confirmed VM parity CI history and local VM correctness are green, but the VM-on one-card probe remains red at per-card `elapsedMs=6785.31` versus `<=250`. Archived ticket `149FITLEVNUMVM-018` profiled the suspected engine-test restoration blockers and found no remaining red runtime hot path after stale golden fallout was repaired. Follow-up profiling then split the remaining non-policy-VM preview-drive runtime closure into tickets 019-022; ticket 016 remains the final F14 default-flip/deletion owner after ticket 022 proves the `<=250 ms` gate.

**2026-05-02 Phase 5 handoff update**: Ticket `149FITLEVNUMVM-022` ran the final Phase 4B gate and remained red at per-card `elapsedMs=6702.65` versus `<=250`. User approved promoting Phase 5/WASM as the next architectural owner. This ticket's remaining determinism-timeout unwind is still blocked until the Phase 5 path makes the original budget truthful and ticket 016 closes the F14 default-flip/deletion cut.

**2026-05-02 early restoration update**: The `engine-tests.yml` `continue_on_error: true` flags for `fitl-events-shard-c` and `fitl-rules` were removed early after local proof showed the non-blocking lane masked a real stale golden failure in `fitl-turn-flow-golden.test.js`. This ticket no longer owns restoring those two matrix entries. It still owns the remaining restoration work: revert the `engine-determinism.yml` determinism job timeout once ticket 016 closes and the original Phase 4 gate is truthful through the successor runtime.

## Assumption Reassessment (2026-04-28)

1. Tickets 001 and 002 land Phase 0 CI bumps; the exact deltas are recorded in their Outcome sections at completion time. Ticket 002 corrected its draft slow-parity assumption: the affected live lanes are `fitl-events-shard-c` and `fitl-rules`. This ticket's scope is to revert whatever those tickets changed.
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

### 3. `.github/workflows/engine-tests.yml` — already restored early

The ticket-002 matrix entries were restored early on 2026-05-02:
- `fitl-events-shard-c` and `fitl-rules` no longer carry `continue_on_error: true`.
- The non-blocking summary step was removed.
- No lane timeout had been bumped; both entries remain at `timeout: 30`.

Reference ticket 002's Outcome section for the exact entries that were modified.

### 4. Single commit

All four reverts (job-level timeout, matrix-level changes, any per-test mechanism) land in a single commit per spec §Phase 0.

## Files to Touch

- `.github/workflows/engine-determinism.yml` (modify — revert)
- `.github/workflows/engine-tests.yml` (restored early 2026-05-02; no remaining work here unless it drifts again)

## Out of Scope

- Engine source changes — none.
- Reverting Phase 1-4 ticket implementations — those are the architectural answer, not bumps.
- Adding new perf gates or extending lane manifests — separate tickets if needed.

## Acceptance Criteria

### Tests That Must Pass

1. After revert, full CI runs green on PR #231 (or main): determinism shards complete within 30 m, ticket-002 engine-test lanes complete within 30 m and are blocking again.
2. `fitl-per-card-cost.perf.test.ts` continues to pass at ≤ 250 ms (recalibrated by ticket 016).
3. Existing suite: `pnpm turbo build && pnpm turbo lint`.

### Invariants

1. No silent retention of any Phase 0 bump in either workflow file post-revert.
2. CI gating semantics fully restored — no Phase 0 `continue-on-error` remains on determinism or ticket-002 engine-test lanes.
3. Per F14, no fallback configuration shims retained.

## Test Plan

### New/Modified Tests

1. None — restoration of pre-bump CI behavior.

### Commands

1. `git diff main -- .github/workflows/engine-determinism.yml .github/workflows/engine-tests.yml` — confirm revert is byte-equivalent to pre-001/pre-002 state.
2. `pnpm turbo build`.
3. After push, observe full CI run completing within restored budgets.
