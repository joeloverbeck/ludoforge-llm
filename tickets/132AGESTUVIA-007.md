# 132AGESTUVIA-007: Eliminate residual seed-2057 no-playable witness before `agentStuck` removal

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent/simulator boundary diagnosis and root-cause fix in the residual `NoPlayableMovesAfterPreparationError` path
**Deps**: `archive/tickets/132AGESTUVIA-001.md`, `archive/tickets/132AGESTUVIA-002.md`, `archive/tickets/132AGESTUVIA-003.md`

## Problem

Ticket `132AGESTUVIA-004` cannot safely remove the simulator's `agentStuck` soft-stop on current `HEAD` because a live witness still reaches that path: FITL seed `2057` ends with `stopReason = 'agentStuck'` after `119` moves under the current baseline profiles. Removing the catch now would not make the series more correct; it would simply surface an uncaught `NoPlayableMovesAfterPreparationError` while the underlying residual defect remained live. Foundations `#14` and `#15` require a cleaner boundary: first eliminate the remaining no-playable witness, then delete the legacy stop reason atomically in `004`.

## Assumption Reassessment (2026-04-17)

1. `packages/engine/src/sim/simulator.ts` still catches the "could not derive a playable move" path and maps it to `stopReason = 'agentStuck'` — confirmed.
2. `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` still explicitly tolerates `'agentStuck'` via `ALLOWED_STOP_REASONS = new Set(['terminal', 'maxTurns', 'agentStuck'])` — confirmed.
3. Direct live rerun on current `HEAD` with `['us-baseline', 'arvn-baseline', 'nva-baseline', 'vc-baseline']` still yields `seed=2057, stopReason='agentStuck', moves=119` — confirmed.
4. The `FORMER_CRASH_OR_HANG_SEEDS` witness `1010` now resolves to `maxTurns` on the same rerun probe, so the residual blocker is narrower than the older broad `agentStuck` class — confirmed.
5. Ticket `132AGESTUVIA-003` proved the post-002 contract is bounded retry, not universal guaranteed completion. Any fix here must therefore identify the residual seed-2057 root cause directly rather than assuming `NoPlayableMovesAfterPreparationError` is unreachable by construction — confirmed.
6. The structural `chooseN{min:3,max:3}` fixture used in ticket `003` still enumerates as one VIABLE pending move on current `HEAD`, so it is not a valid zero-legal-move simulator witness for this ticket — confirmed.

## Architecture Check

1. This ticket keeps the boundary honest: it owns the remaining live no-playable witness, while `004` stays an atomic cleanup ticket once the witness is gone.
2. The fix must remain engine-agnostic and live in the shared move-enumeration / preparation / simulator pipeline, not in FITL data or policy YAML (Foundations `#1` and `#5`).
3. The implementation must address the root cause of the residual `NoPlayableMovesAfterPreparationError`, not paper it over with a new stop reason or simulator shim (Foundation `#15`).

## What to Change

### 1. Reproduce and isolate the seed-2057 residual witness

Create the narrowest reproducible proof for the `seed=2057` no-playable path. At minimum:

- capture where the final `NoPlayableMovesAfterPreparationError` originates in the current pipeline
- identify the decisive classified-move / template-completion state that leaves the agent with zero playable moves
- determine whether the residual defect belongs to enumeration/probe disagreement, completion retry classification, duplicate handling, policy-guidance fallback, or another adjacent seam not fully covered by tickets 001–003

If the narrowest valid proof remains production-data-backed rather than synthetic, document that explicitly in the ticket outcome.

### 2. Fix the remaining no-playable root cause

Implement the smallest engine-agnostic change that removes the residual seed-2057 witness without reopening already-completed ticket boundaries gratuitously. The result must make seed 2057 complete the simulator loop without hitting `agentStuck`, while preserving bounded computation and deterministic behavior.

### 3. Add focused regression coverage for the residual witness

Add or tighten the narrowest test lane that proves the fixed residual path no longer leaves the agent with zero playable moves. This may be:

- a new unit/integration witness if the root cause can be isolated narrowly, or
- an upgraded `fitl-seed-2057-regression` lane if the production-data-backed path remains the narrowest honest proof

### 4. Prepare ticket 004 for follow-through

Once the residual witness is fixed, update `132AGESTUVIA-004.md` only as needed to record that its blocker is cleared. Do not absorb the `agentStuck` union/catch deletion into this ticket.

## Files to Touch

- `packages/engine/src/agents/*` and/or `packages/engine/src/kernel/*` and/or `packages/engine/src/sim/*` (modify only as justified by the root cause)
- `packages/engine/test/unit/**/*` and/or `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` (modify or add the narrowest valid proof)
- `tickets/132AGESTUVIA-004.md` (modify only if blocker-clear closeout notes are needed)

## Out of Scope

- Removing `'agentStuck'` from `SimulationStopReason` — `132AGESTUVIA-004`
- Zod schema removal for `'agentStuck'` — `132AGESTUVIA-004`
- Full campaign seed-1000/1002 regression gate — `132AGESTUVIA-005`
- FITL-specific YAML or policy-profile changes

## Acceptance Criteria

### Tests That Must Pass

1. The chosen focused proof for the residual seed-2057 path fails on pre-fix behavior and passes after the fix.
2. `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` no longer requires `'agentStuck'` in its allow-set and passes cleanly.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Seed 2057 no longer reaches `stopReason = 'agentStuck'` on current `HEAD`.
2. No new simulator compatibility shim or alternate soft-stop is introduced.
3. The fix remains deterministic and bounded.

## Test Plan

### New/Modified Tests

1. Narrow residual-witness proof lane to be determined by reassessment — must be the narrowest honest proof of the seed-2057 root cause.
2. `packages/engine/test/integration/fitl-seed-2057-regression.test.ts` — tightened so `'agentStuck'` is no longer tolerated.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test dist/test/integration/fitl-seed-2057-regression.test.js`
3. `pnpm -F @ludoforge/engine test`
