# 149FITLEVNUMVM-003: CI restoration unwind (post-Phase-4)

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — CI workflow restoration only
**Deps**: `archive/tickets/149FITLEVNUMVM-001.md`, `archive/tickets/149FITLEVNUMVM-002.md`, `archive/tickets/149FITLEVNUMVM-018.md`, `archive/tickets/149FITLEVNUMVM-016.md`, `archive/tickets/150FITLWASM-001.md`, `archive/tickets/149FITLEVNUMVM-023.md`

## Problem

Phase 0 (tickets 001 + 002) bumped CI workflow budgets and/or marked slow lanes non-blocking as a tactical unblock. Per spec 149 §Phase 0 and §Phase 4 acceptance criteria, those bumps must be reverted in a single commit once Phase 4 lands and the reset per-card budget is verified. This ticket tracks the unwind.

**Gate condition**: Close this ticket only when ticket 016 has closed AND
`packages/engine/test/perf/agents/fitl-per-card-cost.perf.test.ts` passes at
the reset `<=1800 ms` target on all 4 baseline profiles
(`verifyIncrementalHash=true`) under the repaired reset-gate evidence, with a
green merged CI check set for the determinism and engine-test restoration lanes.

**2026-05-02 gate update**: Ticket 016 was blocked by a live Phase 4 perf-gate reassessment. User-confirmed VM parity CI history and local VM correctness were green, but the VM-on one-card probe remained red at per-card `elapsedMs=6785.31` versus `<=250`. Archived ticket `149FITLEVNUMVM-018` profiled the suspected engine-test restoration blockers and found no remaining red runtime hot path after stale golden fallout was repaired. Follow-up profiling then split the remaining non-policy-VM preview-drive runtime closure into tickets 019-022.

**2026-05-02 Phase 5 handoff update**: Ticket `149FITLEVNUMVM-022` ran the final Phase 4B gate and remained red at per-card `elapsedMs=6702.65` versus `<=250`. User approved promoting Phase 5/WASM as the next architectural owner. This historical blocker was superseded by the 2026-05-04 budget reset below.

**2026-05-04 budget reset update**: Ticket `150FITLWASM-034` proved the
original `<=250 ms` blocker is not feasible for the current same-seam
architecture. User approved option 2: replace the active blocker with a
measured `<=1800 ms` successor-runtime gate. This ticket remained blocked on
ticket 016 closure and reset-gate confirmation, but no longer waited for the
retired `<=250 ms` budget.

**2026-05-04 reset-gate regression update**: `154POLBCDISP-003` keep-arm
preflight reran the reset perf gate on the current checkout and found it red
on three serial local samples: `2479.77 ms`, `2461.18 ms`, and `2421.83 ms`
against `<=1800 ms`. New prerequisite `archive/tickets/149FITLEVNUMVM-023.md` owns
revalidating or repairing that reset gate before this CI restoration ticket can
consume the gate for unwind.

**2026-05-04 reset-gate repair update**: `archive/tickets/149FITLEVNUMVM-023.md`
classified the red samples as perf-gate harness drift and repaired the checked-in
gate without changing the `<=1800 ms` ceiling. The repaired compiled gate passed
three serial local samples, and the Spec 149 subtest was green inside
`pnpm -F @ludoforge/engine test:perf`; the broad lane still has an unrelated
Spec 145 preview-pipeline corpus failure. At that point, this ticket was blocked
on the original 3+ consecutive CI confirmations and the determinism-timeout
unwind criteria, not on a currently red local reset gate.

**2026-05-05 unwind update**: The user confirmed that the merged PR #239 CI
pass is sufficient for this repo because the relevant CI lanes are not treated
as flaky, and explicitly rejected requiring 3+ consecutive green runs. This
ticket therefore consumes the PR #239 merged green CI check set plus the local
`149FITLEVNUMVM-023` reset-gate repair evidence as the authorized unwind gate.

**2026-05-02 early restoration update**: The `engine-tests.yml` `continue_on_error: true` flags for `fitl-events-shard-c` and `fitl-rules` were removed early after local proof showed the non-blocking lane masked a real stale golden failure in `fitl-turn-flow-golden.test.js`. This ticket no longer owns restoring those two matrix entries. The remaining restoration work was to revert the `engine-determinism.yml` determinism job timeout once ticket 016 closed and the reset Phase 4 gate was confirmed.

## Assumption Reassessment (2026-04-28)

1. Tickets 001 and 002 land Phase 0 CI bumps; the exact deltas are recorded in their Outcome sections at completion time. Ticket 002 corrected its draft slow-parity assumption: the affected live lanes are `fitl-events-shard-c` and `fitl-rules`. This ticket's scope is to revert whatever those tickets changed.
2. Ticket 016 is the Phase 4 default-flip + closure-tree deletion ticket; its acceptance includes the reset `<=1800 ms` perf gate.
3. The "single commit" requirement comes from spec §Phase 0 and is preserved here — split commits would leave intermediate states with mismatched expectations.

## Architecture Check

1. Single-commit revert ensures branch CI is consistent at every point along the rollout. F8 determinism is unaffected (CI configuration only).
2. Configuration-only; F1 preserved trivially.
3. Closing the loop on the F15 tactical/strategic split: Phase 0 was tactical, Phase 4 is the strategic answer, and this ticket is the architectural completion.

## What to Change

### 1. Confirm gate condition

Before any edits, verify:
- Ticket 016 Status is CLOSED.
- The reset perf gate is green at `<=1800 ms` on all 4 baseline profiles under
  the repaired `149FITLEVNUMVM-023` harness evidence.
- Merged PR #239 CI is green for the determinism shards and ticket-002
  engine-test lanes, including Sihanouk and March-Free-Operation integration
  coverage inside the restored 30-minute lane budgets.

2026-05-05 correction: the earlier "3+ consecutive CI runs" gate was rejected
by the user as unnecessary for this repo's non-flaky CI lanes. The authorized
closeout witness is the merged green PR #239 CI check set plus the local
reset-gate repair evidence already recorded by `149FITLEVNUMVM-023`.

### 2. Revert `.github/workflows/engine-determinism.yml`

Restore `timeout-minutes: 60` → `timeout-minutes: 30` on the determinism job (the bump landed in ticket 001).

### 3. `.github/workflows/engine-tests.yml` — already restored early

The ticket-002 matrix entries were restored early on 2026-05-02:
- `fitl-events-shard-c` and `fitl-rules` no longer carry `continue_on_error: true`.
- The non-blocking summary step was removed.
- No lane timeout had been bumped; both entries remain at `timeout: 30`.

Reference ticket 002's Outcome section for the exact entries that were modified.

### 4. Single commit

The remaining revert is the determinism job-level timeout. The ticket-002
engine-test matrix changes already landed earlier on 2026-05-02.

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
2. `fitl-per-card-cost.perf.test.ts` continues to pass at `<=1800 ms` (recalibrated by ticket 016).
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

## Outcome (2026-05-05)

- Restored `.github/workflows/engine-determinism.yml` determinism job
  `timeout-minutes: 60` back to `timeout-minutes: 30`.
- Verified-no-edit: `.github/workflows/engine-tests.yml` already has
  `fitl-events-shard-c` and `fitl-rules` as blocking 30-minute matrix entries;
  no `continue-on-error` restoration work remained there.
- Boundary correction: the original 3+ consecutive CI confirmation requirement
  was replaced by user authorization to close on the merged green PR #239 CI
  check set plus the `149FITLEVNUMVM-023` repaired reset-gate evidence.
- PR #239 merged at `0e0ac6cc3e15fc4783b2ef341c9ecda6f96da1eb`; its CI,
  Engine Determinism Parity, and Engine Tests checks were green. The
  determinism shards included `fitl-parity-zobrist-seed-42` and
  `fitl-parity-zobrist-seed-123`; Engine Tests included green
  `fitl-events-shard-c` and `fitl-rules` 30-minute lanes.
- Generated fallout: none. This is workflow and ticket/spec closeout only.
- Verification:
  - `pnpm turbo build` — PASS.
  - `pnpm turbo lint` — PASS.
  - `pnpm run check:ticket-deps` — PASS.
  - `git diff --check` — PASS.
- Late-edit proof validity: ticket/spec edits transcribe the user-authorized
  gate correction and PR evidence; they do not change runtime code or test
  command semantics. Final proof reran the local structural checks listed
  above.
