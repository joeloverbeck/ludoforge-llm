# FITL70-001: Reassess completed ROKs architecture after shared engine rework

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None expected unless current verification exposes a real regression
**Deps**: `tickets/README.md`, `archive/tickets/FREEOP/FREEOP-ROKS-001-free-operation-probe-scaling.md`, `archive/tickets/OPEROVERLAY-001-generic-operation-execution-overlay.md`, `data/games/fire-in-the-lake/41-events/065-096.md`, `packages/engine/test/integration/fitl-events-roks.test.ts`, `packages/engine/test/integration/fitl-events-1965-arvn.test.ts`

## Problem

This ticket was written under the assumption that card 70 (`ROKs`) was still waiting on shared engine work before it could be considered architecturally final.

That assumption is now stale.

The shared engine capabilities this ticket was waiting for already landed in the dependency tickets, and the current production FITL card data already uses those shared contracts:

- `executeAsSeat` for US-profile execution,
- `allowDuringMonsoon` for the granted Sweep,
- and generic `tokenInterpretations` for the “all ARVN cubes are US Troops” rule.

So the real remaining task is not to design a new `ROKs` architecture. It is to verify that the current implementation is in fact the clean end state, and archive this ticket if that verification holds.

## Assumption Reassessment (2026-03-12)

1. The current `ROKs` implementation is no longer provisional in the old sense. The shared engine work it depended on has already landed in `FREEOP-ROKS-001` and `OPEROVERLAY-001`. Confirmed from the archived dependency tickets and the current authored card data.
2. Card 70 is already authored directly in FITL `GameSpecDoc` using shared engine contracts rather than a FITL-only runtime workaround. Confirmed in `data/games/fire-in-the-lake/41-events/065-096.md`.
3. The current architecture is cleaner than the old workaround architecture because it keeps game-specific semantics in authored data while the engine provides generic execution primitives. Confirmed by the removal of the former `fitl_roksMixedUsOperation` workaround described in the dependency ticket outcomes.
4. The two focused regression files this ticket named already exist and already assert the key compile/runtime invariants for card 70. Confirmed in `packages/engine/test/integration/fitl-events-roks.test.ts` and `packages/engine/test/integration/fitl-events-1965-arvn.test.ts`.
5. Therefore this ticket should not drive another speculative rewrite unless current verification reveals a concrete failure. Its primary job is to validate the present architecture, record the conclusion, and archive the ticket.

## Architecture Check

1. The current architecture is preferable to the old workaround. `ROKs` is authored through generic contracts (`executeAsSeat`, `allowDuringMonsoon`, `tokenInterpretations`) instead of global flags and dedicated mixed-US action profiles.
2. That direction is robust and extensible: future “as if” event rules can reuse the same generic overlay/interpretation model without adding FITL-specific engine branches.
3. A further rewrite is not justified unless tests show a real problem. Replacing the current representation merely because it could be encoded differently would increase churn without improving the architecture.
4. No backwards-compatibility layer or alias should be introduced. If current verification exposes a defect, fix the canonical shared-contract path directly.

## What to Change

### 1. Revalidate the current card-70 implementation

Confirm that the current authored `ROKs` shape still expresses the exact intended rules semantics:

- US or ARVN chooses the operation,
- Sweep is legal during Monsoon,
- Sweep geography matches Phu Bon and adjacent spaces,
- Assault geography includes the three LoCs touching Phu Bon,
- all US Troops, ARVN Troops, and Police participate as US Troops for the granted operations,
- and US-profile hooks such as `Abrams` and US-base doubling still apply.

### 2. Only change implementation if verification proves the current architecture wrong

If the current tests or code review expose a concrete discrepancy, fix the canonical shared-contract implementation directly. Do not reintroduce bespoke FITL-only profiles, compatibility aliases, or duplicate execution paths.

### 3. Archive the ticket once verification is complete

If verification passes and no implementation change is needed, mark this ticket completed and archive it with an Outcome describing that the already-landed architecture was confirmed rather than rewritten.

## Files to Touch

- `tickets/FITL70-001-reevaluate-roks-after-engine-rework.md` (modify, then archive)
- `packages/engine/test/integration/fitl-events-roks.test.ts` (modify only if verification exposes a missing invariant or edge case)
- `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` (modify only if verification exposes a missing compile-level invariant)
- `data/games/fire-in-the-lake/41-events/065-096.md` (modify only if verification exposes a real authored-data defect)

## Out of Scope

- Reopening already-completed shared engine tickets without a concrete failing invariant
- Reintroducing the old FITL-specific `ROKs` workaround architecture
- Unrelated FITL event-card rewrites
- Visual presentation changes

## Acceptance Criteria

### Tests That Must Pass

1. `packages/engine/test/integration/fitl-events-roks.test.ts` passes and still proves the mixed-cube-as-US runtime semantics.
2. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` passes and still proves the authored production encoding for card 70.
3. `pnpm -F @ludoforge/engine test` passes.
4. `pnpm -F @ludoforge/engine lint` passes.

### Invariants

1. Card-70 behavior remains authored in FITL `GameSpecDoc`, not hardcoded in agnostic kernel/runtime logic.
2. The canonical architecture remains the shared-contract path already in production: `executeAsSeat` + `allowDuringMonsoon` + `tokenInterpretations`.
3. No backwards-compatibility alias or revived workaround path is introduced.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-events-roks.test.ts` — verify the live runtime path still covers Monsoon Sweep, mixed US/ARVN cube participation, LoC assault scope, `Abrams`, and shaded clamping semantics.
2. `packages/engine/test/integration/fitl-events-1965-arvn.test.ts` — verify the production compile shape still encodes card 70 through the shared-contract form.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-events-roks.test.js`
3. `node --test packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/engine lint`

## Outcome

Completion date: 2026-03-12

What actually changed:
- Rewrote the ticket to match the current repository reality: the shared engine work for `ROKs` had already landed, and the live card implementation was already using the intended shared-contract architecture.
- Verified the current `ROKs` implementation directly through focused runtime and compile-shape tests plus the full engine test/lint gates.
- Confirmed that no further code or test changes were needed for this ticket.

Deviations from original plan:
- The original ticket assumed card 70 was still waiting on shared engine changes and might need a substantive rework. That assumption was stale.
- Instead of rewriting FITL data or engine code again, the correct action was to reassess the assumptions, validate the already-landed architecture, and close the ticket.

Verification results:
- `pnpm -F @ludoforge/engine build`
- `node --test packages/engine/dist/test/integration/fitl-events-roks.test.js`
- `node --test packages/engine/dist/test/integration/fitl-events-1965-arvn.test.js`
- `pnpm -F @ludoforge/engine test`
- `pnpm -F @ludoforge/engine lint` completed with 0 errors and 77 pre-existing warnings
