# 132AGESTUVIA-005: FITL seed 1000 + seed 1002 regression gate (S4.4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `tickets/132AGESTUVIA-004.md`

## Problem

Spec 132 exists to unblock the `fitl-arvn-agent-evolution` campaign, which currently cannot run because FITL seed 1000 (and four other campaign seeds: 1007, 1008, 1010, 1013) crash the tournament runner with `stopReason = 'agentStuck'`. After tickets 001–004 land, seed 1000 must play cleanly to a legitimate terminal state; the tournament runner must exit 0. Additionally, ticket 002 touches `move-completion.ts` — the file reverted in `14a33c29` for causing infinite loops on seed 1002. An end-to-end regression gate is required to prove both properties hold before the spec is considered complete.

## Assumption Reassessment (2026-04-16)

1. Seed 1000 deterministically fails at NVA turn 1, move 140 on current HEAD. Reproducer: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat arvn --max-turns 200` (produces `errors: 1`) — confirmed during spec reassessment.
2. `campaigns/fitl-arvn-agent-evolution/diagnose-agent-stuck.mjs` reproduces the NVA move-140 failure deterministically — confirmed.
3. Seed 1002 hung under the reverted `40a43ceb` (see `14a33c29`'s revert message) — historical repo fact.
4. `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` is immutable per the campaign's `program.md` — this ticket does not modify it.
5. Tickets 001–004 provide the fixes required for this gate to pass.

## Architecture Check

1. Test-only diff; no production changes.
2. Integration-level gate covers the end-to-end pipeline: enumerate → probe → complete → retry → simulator → runner exit code.
3. Dual-seed coverage (1000 + 1002) guards both the primary defect and the `14a33c29` regression class in one ticket.

## What to Change

### 1. New FITL integration regression test

Create `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` that:

- **Seed 1000 gate**: runs FITL seed 1000 with the campaign's seat-to-profile mapping (`us-baseline`, `arvn-evolved` — match the current `bindings:` in `data/games/fire-in-the-lake/92-agents.md`; fall back to `arvn-baseline` if the binding has since reverted). Asserts the resulting trace has `stopReason` equal to one of `'terminal'`, `'maxTurns'`, or `'noLegalMoves'` — and explicitly NOT `'agentStuck'` (which, post-ticket-004, is no longer a representable variant, making the assertion tautological but documenting intent).
- **No-throw invariant**: the `runGame(...)` call completes without throwing `NoPlayableMovesAfterPreparationError` or any other uncaught error.
- **Seed 1002 smoke**: runs seed 1002 (or plays the first 50 moves) under a strict wall-clock bound (e.g., 30 s for a full game; 5 s for 50 moves). Asserts no hang, no throw, and a legitimate stop reason.
- **Determinism**: runs seed 1000 twice and asserts canonical trace equality (Foundation #8 end-to-end check). Use trace-hash comparison if available; otherwise stringify the move log and compare.

### 2. Manual verification step (documented, not automated)

Document in the Test Plan that the full campaign runner smoke MUST be executed manually before closing this ticket:

```
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200
```

Expected: exit code 0 and JSON output containing `errors: 0`. This verifies spec 132's primary success criterion but is too slow for CI; automated coverage in §1 is sufficient for the test-suite gate, and the manual run confirms the campaign is actually unblocked.

## Files to Touch

- `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` (new)

## Out of Scope

- Any production code change.
- Full 15-seed tournament in CI — too slow; the campaign's own harness runs that.
- Changes to `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` — immutable per `program.md`.
- Fixing the `maxTurns` outcomes on the 10 other campaign seeds — explicitly out of spec 132's Non-Goals (that is a separate campaign concern).

## Acceptance Criteria

### Tests That Must Pass

1. Seed 1000 plays to `'terminal' | 'maxTurns' | 'noLegalMoves'` — never throws, and `'agentStuck'` is not a possible value post-ticket-004.
2. Seed 1002 completes without hanging under the wall-clock bound.
3. Determinism: two runs of seed 1000 produce identical traces.
4. Existing suite: `pnpm turbo test`.

### Invariants

1. No campaign seed in 1000–1014 produces `'agentStuck'` (which is unrepresentable) or throws unhandled from `runGame`.
2. FITL seed 1002 does not hang — the `14a33c29` regression class remains guarded.
3. Simulation determinism preserved (Foundations #8 and #13).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` — seed 1000 gate, seed 1002 smoke, and determinism check.

### Commands

1. `pnpm -F @ludoforge/engine test test/integration/fitl-seed-1000-regression.test.ts`
2. `pnpm turbo test`
3. **Manual verification (required before closing)**: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200` — expect exit code 0 and `errors: 0` in the JSON output.
