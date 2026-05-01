# 151DECSTACSER-006: Live noLegalMoves suspended-frame witness

**Status**: PENDING
**Priority**: LOW
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/test/` only unless reassessment proves a live serialization bug
**Deps**: `archive/tickets/151DECSTACSER-005.md`

## Problem

`151DECSTACSER-005` landed the core Spec 151 serialization tests, including a focused synthetic `noLegalMoves` trace whose final state carries a populated suspended decision-stack frame. That proves the serializer invariant, but it deliberately did not land the original ticket's named live simulator witness: if no existing determinism seed produced `stopReason === 'noLegalMoves'` with a populated final-state decision stack, instrument the canary corpus and check in a fixture.

This ticket owns that residual witness decision explicitly so the completed 005 closeout does not hide the skipped live-simulator deliverable.

## Assumption Reassessment (2026-05-01)

1. `packages/engine/test/determinism/spec-140-replay-identity.test.ts` now contains a synthetic `GameTrace` assertion for the noLegalMoves suspended-frame serialization invariant.
2. The bounded ad hoc FITL seed probe attempted during 005 found no cheap live witness before timeout and was stopped. That probe is reassessment evidence only, not a durable result.
3. Archived 002 and 004 closeouts already classify broad slow-parity / determinism lanes as timeout-heavy broad witnesses outside the serializer-test slice. This ticket must keep any live witness search bounded and should not turn into an unbounded production-seed sweep.

## Architecture Check

1. F8 and F13 are already protected by the synthetic serializer invariant from 005. This ticket is about representative live-simulator evidence, not a new serialization contract.
2. F10 bounded computation applies to the witness search itself: seed/turn probing must have an explicit small candidate set, timeout, and fallback decision.
3. F16 favors automated proof, but F15/F14 do not require manufacturing production game behavior solely to create a witness. If no bounded live witness exists, record that fact and keep the synthetic public-seam invariant as the authoritative proof.

## What to Change

### 1. Bounded live witness probe

Define and run a bounded probe over existing representative production seeds and turn budgets. The probe must:

- build first if it consumes `dist/`
- use a small documented candidate set
- use an explicit timeout or manual-stop threshold
- print progress or a final result quickly enough to avoid a silent broad sweep
- classify each candidate as `live witness`, `no noLegalMoves`, `no populated decisionStack`, or `probe timed out`

### 2. Durable result

If a live witness exists within the bounded search:

- add the smallest durable test or fixture proving `serializeTrace(trace)` for that live simulator trace survives `JSON.stringify`
- prefer extending `packages/engine/test/determinism/spec-140-replay-identity.test.ts` only if the witness fits the determinism lane without making it slow/noisy
- otherwise add a focused unit/integration fixture that replays or loads the captured trace shape without broad simulation cost

If no bounded live witness exists:

- update this ticket and `specs/151-decision-stack-serialization-canonicality.md` to state that the live simulator witness is currently unavailable or disproportionate
- keep the synthetic public-seam proof from 005 as the active invariant
- do not add game-specific behavior or mutate production GameSpecDoc data solely to manufacture the state

## Files to Touch

- `packages/engine/test/determinism/spec-140-replay-identity.test.ts` (modify — only if a cheap live witness fits)
- `packages/engine/test/fixtures/` (new/modify — only if a fixture is the bounded durable shape)
- `specs/151-decision-stack-serialization-canonicality.md` (modify — if no bounded live witness exists or if the witness shape changes the spec's proof story)
- `tickets/151DECSTACSER-006.md` (modify — record probe outcome and final proof)

## Out of Scope

- Changing serializer/deserializer implementation already landed by 001-004.
- Type-aware ESLint enforcement for raw `JSON.stringify`.
- Broad unbounded seed sweeps or slow-corpus tuning.
- Adding game-specific engine logic or authored GameSpecDoc changes to force the witness.

## Acceptance Criteria

### Tests That Must Pass

1. If a live witness is found, the new or modified durable witness test passes.
2. If no bounded live witness is found, the spec and ticket outcome truthfully record the negative result and preserve 005's synthetic invariant as the authoritative proof.
3. Existing focused serializer tests from 005 remain green.
4. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. The live-witness search remains bounded and reproducible.
2. No game-specific code or authored game-data mutation is introduced solely for witness creation.
3. The final proof story distinguishes synthetic public-seam serialization proof from live simulator representative evidence.

## Test Plan

### New/Modified Tests

1. TBD by reassessment: either a live simulator witness assertion/fixture, or no new test with a documented negative-probe outcome.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. Bounded witness probe command chosen during reassessment
3. Focused serializer/witness test command
4. `pnpm -F @ludoforge/engine test`
