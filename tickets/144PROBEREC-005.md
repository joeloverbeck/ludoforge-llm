# 144PROBEREC-005: Determinism replay-identity proof for probe-hole recoveries

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — new determinism test
**Deps**: `archive/tickets/144PROBEREC-002.md`, `archive/tickets/144PROBEREC-003.md`, `archive/tickets/144PROBEREC-007.md`

## Problem

The rollback safety net introduced in ticket 002 adds a new trace surface (`ProbeHoleRecoveryLog`, `GameTrace.probeHoleRecoveries`, `GameTrace.recoveredFromProbeHole`). Ticket 002 absorbed the `Trace.schema.json` extension because the live engine package test command gates focused tests on `schema:artifacts:check`. Foundation #8 (Determinism) still requires a replay-identity test proving that traces containing recovery events replay byte-identically across two independent `runGame` invocations.

This ticket closes the remaining determinism proof loop.

## Assumption Reassessment (2026-04-24)

1. `packages/engine/schemas/Trace.schema.json` already includes `probeHoleRecoveries`, `recoveredFromProbeHole`, and `unavailableActionsPerTurn` from ticket 002.
2. `pnpm turbo schema:artifacts` remains a verification lane here only to ensure no schema drift was introduced while adding the replay proof.
3. `packages/engine/test/determinism/` currently contains 11 tests (per reassessment). This ticket adds one more, following the existing style (seed + replay + byte-identical assertion).
4. Post-review of ticket 004 found a recovery/grant reconciliation blocker: representative FITL lanes could throw `ILLEGAL_MOVE` for the game-authored `pass` fallback while required free-operation grants remained unresolved. `archive/tickets/144PROBEREC-007.md` landed that prerequisite repair; this ticket remains the replay-identity proof owner and should use the now-valid recovery/fallback surface.

## Architecture Check

1. The replay-identity test is `@test-class: architectural-invariant`: any legitimate trace (including those with recovery events) must replay to bit-identical state.
2. No additional kernel or simulator change should be needed after ticket 007's recovery/fallback grant reconciliation repair. This ticket proves replay identity on a valid recovery path rather than repairing fallback legality itself.

## What to Change

### 1. Determinism replay-identity test

`packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` (`@test-class: architectural-invariant`):

- Use the synthetic GameDef from ticket 002 (crafted to force rollback at depth 4). Run it under two independent `runGame` invocations with identical seed/agents/options.
- Assert:
  - `trace1.finalState.stateHash === trace2.finalState.stateHash` (canonical F#8 replay-identity).
  - `trace1.decisions.length === trace2.decisions.length`
  - `trace1.probeHoleRecoveries.length === trace2.probeHoleRecoveries.length`
  - For each `i`, `trace1.probeHoleRecoveries[i].stateHashBefore === trace2.probeHoleRecoveries[i].stateHashBefore` and same for `stateHashAfter` — the state before and after recovery is deterministic.
- Additional sub-assertion: serialize each trace to JSON via the canonical serializer and assert byte-identical strings (the ultimate F#8 proof).

## Files to Touch

- `packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` (new)

## Out of Scope

- Deep probe / LRU / cache — ticket 001.
- Rollback / `ProbeHoleRecoveryLog` type / `GameTrace` migration / blacklist — ticket 002.
- Seed-1001 fixture / F#18 amendment / convergence-witness re-bless / residual recovery completion — ticket 003.
- `SimulationOptions.decisionHook` / diagnostic harness rewire — ticket 004.
- Recovery fallback grant reconciliation parity — ticket 007.

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo schema:artifacts` — schema remains clean after the replay proof.
2. `pnpm -F @ludoforge/engine test packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` — replay-identity holds for traces containing recovery events.
3. Existing engine suite: `pnpm turbo test`.

### Invariants

1. `trace1.finalState.stateHash === trace2.finalState.stateHash` for any two independent `runGame(def, seed, agents, ...)` invocations — even when rollback fires (F#8).
2. Each `ProbeHoleRecoveryLog` entry is a pure function of the state at the failure point; its `stateHashBefore`/`stateHashAfter` are deterministic (enforced by test).
3. `GameTrace.probeHoleRecoveries` serializes canonically — byte-identical JSON output across two independent runs (final sub-assertion).

## Test Plan

### New/Modified Tests

1. `packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts` — replay identity on synthetic GameDef with forced rollback (`@test-class: architectural-invariant`).
### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm turbo schema:artifacts`
3. `pnpm -F @ludoforge/engine test packages/engine/test/determinism/probe-hole-recovery-replay-identity.test.ts`
4. `pnpm turbo lint`
5. `pnpm turbo typecheck`
6. `pnpm turbo test`
