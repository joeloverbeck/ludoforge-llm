# 144PROBEREC-007: Recovery fallback grant reconciliation parity

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — probe-hole recovery / free-operation grant reconciliation
**Deps**: `archive/tickets/144PROBEREC-003.md`, `archive/tickets/144PROBEREC-004.md`

## Problem

Post-ticket review of `144PROBEREC-004` found that the diagnostic hook and harness rewire are correct, but broader Spec 140 / Spec 144 lanes still expose a same-series recovery residual. Several representative FITL runs throw:

`Illegal move: actionId=pass reason=moveNotLegalInCurrentState detail=active seat has unresolved required free-operation grants`

This contradicts the completed Spec 144 recovery contract in `docs/FOUNDATIONS.md`: after rollback blacklists the offending action, the engine must reconcile blocking free-operation grants for the recovered seat before publishing a game-authored `tags: [pass]` fallback. The failure is not in the diagnostic hook from 004; it is a recovery/grant reconciliation parity gap left after ticket 003.

## Assumption Reassessment (2026-04-25)

1. `packages/engine/src/kernel/microturn/rollback.ts` currently calls `expireReadyBlockingGrantsForSeat(...)` during rollback, and `packages/engine/test/unit/kernel/microturn/rollback.test.ts` has a unit case proving one ready blocking grant is removed for the recovered seat.
2. Live broad proof still fails outside the diagnostic seam. Direct reruns of `dist/test/integration/classified-move-parity.test.js` and `dist/test/integration/spec-140-profile-migration.test.js` throw the same `ILLEGAL_MOVE` for `actionId=pass` with unresolved required free-operation grants.
3. The failure means the existing rollback unit proof is too narrow for at least one production FITL state: either the grant that blocks `pass` is not considered ready by the current expiry helper, the seat/action ownership used during rollback is wrong, or fallback publication can still expose `pass` before all blocking obligations are reconciled.
4. `tickets/144PROBEREC-005.md` is a replay-identity proof for recovery traces. It should depend on this repair because replay proof is not meaningful while representative recovery/fallback paths can still throw before producing a legitimate trace.

## Architecture Check

1. The fix belongs in the shared recovery / grant reconciliation boundary, not in `diagnose-nolegalmoves.mjs`, profile policy, or FITL-specific code. This preserves Foundation #1 and #5.
2. The recovery path must remain deterministic and trace-visible: identical pre-failure state plus offending action must produce the same reconciled state, blacklist, and `ProbeHoleRecoveryLog` (F#8, F#9).
3. The pass fallback must still run through the normal game-authored apply pipeline; the engine must not synthesize a special pass move or bypass legality (F#7, F#18).
4. The repair should widen the recovery proof from the synthetic unit case to a production-backed failing state or the smallest extracted fixture that preserves the same grant state shape.

## What to Change

### 1. Isolate the production failing state

Use the failing FITL lanes to identify the earliest deterministic state where rollback/fallback publishes or applies `pass` while required grants remain unresolved. Prefer the smallest reproducible state slice over a full long-run test if it can preserve the grant/runtime shape.

Candidate observed lanes:
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/spec-140-profile-migration.test.js`
- `pnpm turbo test` also reported failures in `spec-140-bounded-termination.test.js` and `spec-140-foundations-conformance.test.js` with the same broad failure class.

### 2. Repair recovery grant reconciliation

Update the narrowest shared helper so rollback reconciliation removes or resolves every required pending grant that blocks the recovered seat from taking the fallback action after the offending action has been blacklisted. Keep the implementation game-agnostic and preserve normal legality enforcement for non-recovery moves.

### 3. Add regression coverage

Add a focused regression for the isolated grant state. The test must fail before the fix with `actionId=pass` / unresolved required grants and pass after the fix by producing a legitimate terminal, max-turns, or non-throwing recovery trace.

If a production-backed fixture is too heavy, add a synthetic fixture only after proving it has the same pending-grant shape as the failing FITL state.

### 4. Update downstream proof assumptions

If this repair changes the replay-identity surface expected by `144PROBEREC-005`, update that ticket before final proof so the staged series remains coherent.

## Files to Touch

- `packages/engine/src/kernel/microturn/rollback.ts` (likely modify)
- `packages/engine/src/kernel/grant-lifecycle.ts` or adjacent grant reconciliation helpers (modify if the ownership is deeper than rollback)
- `packages/engine/test/unit/kernel/microturn/rollback.test.ts` (likely modify)
- `packages/engine/test/integration/<new-or-existing-recovery-regression>.test.ts` (new or modify)
- `tickets/144PROBEREC-005.md` (conditional modify if proof assumptions change)

## Out of Scope

- `SimulationOptions.decisionHook` and diagnostic harness routing — completed by ticket 004.
- Replay-identity proof for valid recovery traces — ticket 005.
- New FITL event authoring or profile-policy behavior unrelated to rollback/fallback grant reconciliation.
- Changing the generic `tags: [pass]` convention or bypassing the normal apply pipeline.

## Acceptance Criteria

### Tests That Must Pass

1. A focused regression proving the current `actionId=pass` unresolved-grant failure is fixed.
2. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/spec-140-profile-migration.test.js`
4. Existing engine suite: `pnpm turbo test`

### Invariants

1. Rollback reconciliation remains game-agnostic and does not hardcode FITL seats, cards, actions, or phases.
2. The fallback pass action remains a game-authored action executed through the normal apply pipeline.
3. Required free-operation grants still block ordinary non-recovery moves until they are consumed or legitimately reconciled.
4. `ProbeHoleRecoveryLog` remains trace-only and is not appended to `GameTrace.decisions[]`.

## Test Plan

### New/Modified Tests

1. `<focused recovery regression>` — proves the failing pass-with-required-grants state no longer throws.
2. Existing rollback unit coverage extended if the helper-level contract changes.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test <focused compiled recovery regression>`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
4. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/spec-140-profile-migration.test.js`
5. `pnpm turbo lint`
6. `pnpm turbo typecheck`
7. `pnpm turbo test`

## Outcome

Completion date: 2026-04-25

Implemented recovery fallback grant reconciliation parity across the shared pass fallback surfaces. The live failure was reproduced in `dist/test/integration/spec-140-profile-migration.test.js` on the FITL canary seed 123: the publisher exposed the game-authored `tags: [pass]` fallback while ready free-operation grants still blocked normal action execution.

The repair keeps the fallback game-authored and engine-generic:

1. `applyPublishedDecision` reconciles ready blocking grants for the published fallback seat before resolving and applying the singleton `tags: [pass]` fallback.
2. `applyMove`, `applyTrustedMove`, and move viability/legality probes reconcile the same fallback state so raw legal moves, classified enumeration, trusted execution, and microturn application remain parity-aligned, but only when the active seat no longer has a potentially playable required free-operation completion.
3. `enumerateLegalMoves` / `legalMoves` now surface the same generic paramless `tags: [pass]` fallback when ordinary turn-flow-filtered moves are empty.
4. Pass fallback validation bypasses turn-flow window filters that only make sense for ordinary operations/events once the fallback is the last legal exit.

Added focused unit coverage in `packages/engine/test/unit/kernel/microturn/rollback.test.ts` proving that applying a singleton pass fallback clears only the recovered seat's ready blocking grant and preserves another seat's pending grant. Post-review tightened the same test file with a guard regression proving raw `applyMove` does not reconcile a pass while a required grant still has a playable completion.

Sibling status: `tickets/144PROBEREC-005.md` remains the replay-identity proof owner. This ticket removes its prerequisite fallback-legality blocker but does not implement the determinism test.

Verification:
- `pnpm -F @ludoforge/engine build`
- `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/microturn/rollback.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/spec-140-profile-migration.test.js`
- `pnpm -F @ludoforge/engine exec node --test dist/test/integration/classified-move-parity.test.js`
- `pnpm turbo lint`
- `pnpm turbo typecheck`
- `pnpm turbo test`
- `pnpm run check:ticket-deps`
