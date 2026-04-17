# 132AGESTUVIA-005: FITL seed 1000 regression gate (S4.4)

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/132AGESTUVIA-004.md`, `archive/tickets/132AGESTUVIA-007.md`, `archive/tickets/132AGESTUVIA-008.md`, `archive/tickets/132AGESTUVIA-009.md`

## Problem

Spec 132 exists to unblock the `fitl-arvn-agent-evolution` campaign. After tickets 001–004 landed, plus the residual seed-2057 prerequisite in `132AGESTUVIA-007`, FITL seed 1000 became the clearest still-relevant end-to-end gate for the original `agentStuck` defect class: it must run cleanly under the campaign's real seat mapping, remain deterministic, and stay bounded under the tournament runner. That automated regression proof is now landed. But the required 15-seed manual tournament smoke on current `HEAD` still reports fresh no-playable runtime errors on seeds `1005`, `1010`, and `1013`, so spec 132 is not actually unblocked yet. Those live failures are now owned by `132AGESTUVIA-009` and are not silently folded into this gate ticket.

## Assumption Reassessment (2026-04-17)

1. On current HEAD, FITL seed 1000 still runs cleanly with the campaign's seat mapping (`us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`) and reaches `stopReason = 'maxTurns'` with 200 moves; the automated regression proof in this ticket remains valid.
2. The dedicated automated lane `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-1000-regression.test.js` passes on current HEAD, and `pnpm turbo test` remains green.
3. The required manual campaign harness smoke `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200` exits 0 but reports `errors: 3`, with seeds `1005`, `1010`, and `1013` each throwing `policy agent could not derive a playable move from 1 classified legal move(s)`.
4. Those fresh manual-lane failures are a substantive production bug, not a reason to downgrade or remove this ticket's closure gate. They must be tracked explicitly as a new prerequisite ticket rather than absorbed silently into this test-only gate.
5. `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` remains immutable per the campaign's `program.md`; this ticket does not modify it.
6. Tickets 001–004 plus prerequisites `132AGESTUVIA-007` and `132AGESTUVIA-008` still provide the proven runtime baseline behind the seed-1000 gate, but they did not eliminate every live manual-tournament no-playable witness.

## Architecture Check

1. The landed work for this ticket remains test-only; the new blocker is externalized to a separate production ticket.
2. The integration-level gate still covers the real end-to-end pipeline: enumerate → probe → complete → simulator → runner-facing stop reason.
3. Keeping the new `1005`/`1010`/`1013` no-playable seam in a separate production ticket preserves architectural honesty: this gate documents the fixed seed-1000 witness without masking a new live tournament defect.

## What to Change

### 1. New FITL integration regression test

Create `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` that:

- **Seed 1000 gate**: runs FITL seed 1000 with the campaign's seat-to-profile mapping (`us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`; match the current `bindings:` in `data/games/fire-in-the-lake/92-agents.md`, with `arvn-baseline` as the only acceptable fallback if the binding has since reverted). Asserts the resulting trace has `stopReason` equal to one of `'terminal'`, `'maxTurns'`, or `'noLegalMoves'`.
- **No-throw invariant**: the `runGame(...)` call completes without throwing `NoPlayableMovesAfterPreparationError` or any other uncaught error.
- **Bounded witness**: asserts the current live seed-1000 witness remains bounded at 200 moves under `maxTurns`, matching the campaign smoke used during reassessment.
- **Determinism**: runs seed 1000 twice and asserts canonical trace equality (Foundation #8 end-to-end check). Use a stable serialized trace comparison if no dedicated trace hash exists.

### 2. Manual verification step (documented, not automated)

Document in the Test Plan that the full campaign runner smoke MUST be executed manually before closing this ticket:

```bash
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200
```

Expected: exit code 0 and JSON output containing `errors: 0`. On current `HEAD`, this step is still blocked by the fresh multi-seed no-playable failures now tracked in `archive/tickets/132AGESTUVIA-009.md`. The automated coverage in Section 1 is sufficient for the test-suite gate; the manual run remains the required closure proof that the campaign is actually unblocked once that prerequisite is green.

## Files to Touch

- `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` (new)

## Out of Scope

- Any production code change in this ticket
- The live manual-tournament no-playable failures on seeds `1005`, `1010`, and `1013` — owned by `archive/tickets/132AGESTUVIA-009.md`
- Full 15-seed tournament in CI — too slow; the campaign's own harness runs that
- Changes to `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` — immutable per `program.md`
- Fixing the `maxTurns` outcomes on the 10 other campaign seeds — explicitly out of spec 132's Non-Goals (that is a separate campaign concern)

## Acceptance Criteria

### Tests That Must Pass

1. Seed 1000 plays to `'terminal' | 'maxTurns' | 'noLegalMoves'` under the campaign seat mapping and never throws.
2. Seed 1000 remains bounded at the current 200-move `maxTurns` witness under the test's explicit turn cap.
3. Determinism: two runs of seed 1000 produce identical traces.
4. Existing suite: `pnpm turbo test`.
5. Manual campaign closure lane reports `errors: 0` once `archive/tickets/132AGESTUVIA-009.md` is complete.

### Invariants

1. The post-004 FITL seed-1000 witness does not regress into an unhandled runtime failure from `runGame`.
2. The seed-1000 gate uses the real campaign seat mapping rather than a synthetic agent mix.
3. Simulation determinism is preserved for the seed-1000 witness (Foundations #8 and #13).
4. The ticket cannot close while the required 15-seed campaign lane still reports fresh runtime errors.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` — seed 1000 gate, bounded witness, and determinism check under the campaign seat mapping.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-1000-regression.test.js`
3. `pnpm turbo test`
4. **Manual verification (required before closing)**: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200` — expect exit code 0 and `errors: 0` in the JSON output once `archive/tickets/132AGESTUVIA-009.md` is also complete. Current 2026-04-17 result: `errors: 3` with runtime failures on seeds `1005`, `1010`, and `1013`.

## Outcome So Far

1. `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` is landed and passes on current `HEAD`.
2. `pnpm -F @ludoforge/engine build`, the focused compiled integration test, and `pnpm turbo test` all pass on current `HEAD`.
3. This ticket remains blocked only on the manual closure lane, which exposed the fresh no-playable witness cluster now tracked in `archive/tickets/132AGESTUVIA-009.md`.

## Outcome

1. `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` remains the landed automated proof for the seed-1000 witness under the real campaign seat mapping.
2. The former manual closure blocker is now cleared by `archive/tickets/132AGESTUVIA-009.md`: the 15-seed campaign smoke `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200` now exits `0` and reports `errors: 0`.
3. With the automated gate still green and the required manual closure lane now clean, this ticket's acceptance boundary is satisfied on current `HEAD`.
