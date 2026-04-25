# 144PROBEREC-005: Determinism replay-identity proof for probe-hole recoveries

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes - new determinism test
**Deps**: `archive/tickets/144PROBEREC-002.md`, `archive/tickets/144PROBEREC-003.md`, `archive/tickets/144PROBEREC-007.md`

## Problem

The rollback safety net introduced in ticket 002 adds a trace surface (`ProbeHoleRecoveryLog`, `GameTrace.probeHoleRecoveries`, `GameTrace.recoveredFromProbeHole`). Ticket 002 absorbed the `Trace.schema.json` extension because the live engine package test command gates focused tests on `schema:artifacts:check`. Foundation #8 (Determinism) still requires a replay-identity test proving that traces containing recovery events serialize byte-identically from identical recovery inputs.

This ticket closes the remaining determinism proof loop.

## Assumption Reassessment (2026-04-25)

1. `packages/engine/schemas/Trace.schema.json` already includes `probeHoleRecoveries`, `recoveredFromProbeHole`, and `unavailableActionsPerTurn` from ticket 002.
2. `pnpm turbo schema:artifacts` remains a verification lane here only to ensure no schema drift was introduced while adding the replay proof.
3. `packages/engine/test/determinism/` contained 10 tests before this ticket. This ticket adds the 11th determinism test.
4. Post-review of ticket 004 found a recovery/grant reconciliation blocker: representative FITL lanes could throw `ILLEGAL_MOVE` for the game-authored `pass` fallback while required free-operation grants remained unresolved. `archive/tickets/144PROBEREC-007.md` landed that prerequisite repair; this ticket remains the recovery determinism proof owner.
5. The original `runGame` trace-witness wording is stale. Live seed scans did not expose a stable recovery trace, and the old seed-1001 witness prefix is no longer a valid recovery path after ticket 007. The user approved the corrected option 2 boundary: prove deterministic `ProbeHoleRecoveryLog` and canonical `GameTrace` serialization directly from identical rollback states, without adding a simulator start-state API solely for this ticket.

## Architecture Check

1. The replay-identity test is `@test-class: architectural-invariant`: identical rollback inputs must produce identical recovery state hashes, recovery log fields, and canonical trace serialization.
2. No additional kernel or simulator change is needed after ticket 007's recovery/fallback grant reconciliation repair. This ticket proves the trace surface is deterministic without inventing a test-only simulator entrypoint.
3. The corrected proof aligns with Foundation #8 (determinism), Foundation #9 (structured deterministic telemetry), Foundation #18 (recovery is a runtime safety-net trace event), and Foundation #19 (recovery is not a `Decision` union variant).

## What Changed

### 1. Determinism recovery-log replay-identity test

`packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` (`@test-class: architectural-invariant`):

- Uses the synthetic GameDef and in-progress microturn rollback state from ticket 002 to create two independent identical rollback inputs.
- Calls `rollbackToActionSelection` twice with independent runtimes.
- Asserts:
  - `rollback1.state.stateHash === rollback2.state.stateHash`.
  - `rollback1.logEntry.stateHashBefore === rollback2.logEntry.stateHashBefore` and same for `stateHashAfter`.
  - `rollback1.logEntry` deep-equals `rollback2.logEntry`.
  - `GameTrace.recoveredFromProbeHole === GameTrace.probeHoleRecoveries.length`.
  - Serializing each synthetic recovery trace through `serializeTrace` produces byte-identical JSON strings.

## Files Touched

- `packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` (new)

## Out of Scope

- Deep probe / LRU / cache - ticket 001.
- Rollback / `ProbeHoleRecoveryLog` type / `GameTrace` migration / blacklist - ticket 002.
- Seed-1001 fixture / F#18 amendment / convergence-witness re-bless / residual recovery completion - ticket 003.
- `SimulationOptions.decisionHook` / diagnostic harness rewire - ticket 004.
- Recovery fallback grant reconciliation parity - ticket 007.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo schema:artifacts` - schema remains clean after the replay proof.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/probe-hole-recovery-replay-identity.test.js` - replay identity holds for traces containing recovery events.
3. Existing engine suite: `pnpm turbo test`.
4. `pnpm turbo lint`, `pnpm turbo typecheck`, and `pnpm run check:ticket-deps`.

### Invariants

1. `rollback1.state.stateHash === rollback2.state.stateHash` for two independent `rollbackToActionSelection` invocations from identical states (F#8).
2. Each `ProbeHoleRecoveryLog` entry is a pure function of the state at the failure point; its `stateHashBefore`/`stateHashAfter` are deterministic (enforced by test).
3. `GameTrace.probeHoleRecoveries` serializes canonically - byte-identical JSON output across two independent runs.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` - replay identity on synthetic GameDef with forced rollback (`@test-class: architectural-invariant`).

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo schema:artifacts`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/probe-hole-recovery-replay-identity.test.js`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm turbo test`
7. `pnpm run check:ticket-deps`
8. `git diff --check`

## Outcome (2026-04-25)

Completed under the user-approved option 2 boundary. The landed test proves deterministic recovery-log generation and canonical trace serialization from identical rollback states. It does not add production code, schema changes, or a simulator-only start-state hook.

The original `runGame` recovery trace witness was stale against the live repo: current production seeds did not emit recovery, and the old seed-1001 recovery fixture path is no longer a valid witness after the recovery/fallback reconciliation work. The durable proof surface is therefore the recovery-log determinism invariant itself.

Verification:

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/determinism/probe-hole-recovery-replay-identity.test.js`
3. `pnpm turbo schema:artifacts`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm turbo test`
7. `pnpm run check:ticket-deps`
8. `git diff --check`
