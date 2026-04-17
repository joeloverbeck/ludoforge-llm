# 132AGESTUVIA-005: FITL seed 1000 regression gate (S4.4)

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: `archive/tickets/132AGESTUVIA-004.md`, `archive/tickets/132AGESTUVIA-007.md`, `archive/tickets/132AGESTUVIA-008.md`

## Problem

Spec 132 exists to unblock the `fitl-arvn-agent-evolution` campaign. After tickets 001–004 landed, plus the residual seed-2057 prerequisite in `132AGESTUVIA-007`, FITL seed 1000 became the clearest still-relevant end-to-end gate for the original `agentStuck` defect class: it must run cleanly under the campaign's real seat mapping, remain deterministic, and stay bounded under the tournament runner. A dedicated regression test is required to prove that post-004 behavior remains stable before the spec is considered complete. The separate live seed-1002 marker-lattice runtime failure is now owned by `132AGESTUVIA-008` and is not silently folded into this gate ticket.

## Assumption Reassessment (2026-04-16)

1. On current HEAD, FITL seed 1000 already runs cleanly with the campaign's seat mapping (`us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`) and reaches `stopReason = 'maxTurns'` with 200 moves; this ticket is now a proof gate, not a production fix.
2. The manual campaign harness smoke `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 1 --players 4 --evolved-seat arvn --max-turns 200` exits 0 with `errors: 0` on current HEAD for the seed-1000 witness.
3. Seed 1002 is no longer just a historical hang witness: on current HEAD it throws `EffectRuntimeError: Marker state "activeSupport" is illegal for lattice "supportOpposition" in space "phuoc-long:none"`, so it must be tracked as a separate production bug rather than misrepresented as a passing smoke gate.
4. `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` is immutable per the campaign's `program.md`; this ticket does not modify it.
5. Tickets 001–004 plus the residual seed-2057 prerequisite `132AGESTUVIA-007`, together with the new seed-1002 prerequisite `132AGESTUVIA-008`, provide the runtime baseline that this gate ticket documents and protects.

## Architecture Check

1. Test-only diff; no production changes.
2. Integration-level gate covers the real end-to-end pipeline: enumerate → probe → complete → simulator → runner-facing stop reason.
3. Keeping seed 1002 in a separate production ticket preserves architectural honesty: this gate documents the fixed `agentStuck` witness without masking an unrelated marker-lattice defect.

## What to Change

### 1. New FITL integration regression test

Create `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` that:

- **Seed 1000 gate**: runs FITL seed 1000 with the campaign's seat-to-profile mapping (`us-baseline`, `arvn-evolved`, `nva-baseline`, `vc-baseline`; match the current `bindings:` in `data/games/fire-in-the-lake/92-agents.md`, with `arvn-baseline` as the only acceptable fallback if the binding has since reverted). Asserts the resulting trace has `stopReason` equal to one of `'terminal'`, `'maxTurns'`, or `'noLegalMoves'`.
- **No-throw invariant**: the `runGame(...)` call completes without throwing `NoPlayableMovesAfterPreparationError` or any other uncaught error.
- **Bounded witness**: asserts the current live seed-1000 witness remains bounded at 200 moves under `maxTurns`, matching the campaign smoke used during reassessment.
- **Determinism**: runs seed 1000 twice and asserts canonical trace equality (Foundation #8 end-to-end check). Use a stable serialized trace comparison if no dedicated trace hash exists.

### 2. Manual verification step (documented, not automated)

Document in the Test Plan that the full campaign runner smoke MUST be executed manually before closing this ticket:

```
node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200
```

Expected: exit code 0 and JSON output containing `errors: 0`. This verifies spec 132's primary success criterion but is too slow for CI; automated coverage in §1 is sufficient for the test-suite gate, and the manual run confirms the campaign is actually unblocked once the seed-1002 prerequisite ticket is also green.

## Files to Touch

- `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` (new)

## Out of Scope

- Any production code change.
- The live seed-1002 support/opposition runtime violation — owned by `archive/tickets/132AGESTUVIA-008.md`.
- Full 15-seed tournament in CI — too slow; the campaign's own harness runs that.
- Changes to `campaigns/fitl-arvn-agent-evolution/run-tournament.mjs` — immutable per `program.md`.
- Fixing the `maxTurns` outcomes on the 10 other campaign seeds — explicitly out of spec 132's Non-Goals (that is a separate campaign concern).

## Acceptance Criteria

### Tests That Must Pass

1. Seed 1000 plays to `'terminal' | 'maxTurns' | 'noLegalMoves'` under the campaign seat mapping and never throws.
2. Seed 1000 remains bounded at the current 200-move `maxTurns` witness under the test's explicit turn cap.
3. Determinism: two runs of seed 1000 produce identical traces.
4. Existing suite: `pnpm turbo test`.

### Invariants

1. The post-004 FITL seed-1000 witness does not regress into an unhandled runtime failure from `runGame`.
2. The seed-1000 gate uses the real campaign seat mapping rather than a synthetic agent mix.
3. Simulation determinism is preserved for the seed-1000 witness (Foundations #8 and #13).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-seed-1000-regression.test.ts` — seed 1000 gate, bounded witness, and determinism check under the campaign seat mapping.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-seed-1000-regression.test.js`
3. `pnpm turbo test`
4. **Manual verification (required before closing)**: `node campaigns/fitl-arvn-agent-evolution/run-tournament.mjs --seeds 15 --players 4 --evolved-seat arvn --max-turns 200` — expect exit code 0 and `errors: 0` in the JSON output once `archive/tickets/132AGESTUVIA-008.md` is also complete.
