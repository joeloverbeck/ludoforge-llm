# LEGACTTOO-028: Free-Operation executeAsSeat Special-Activity Parity

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: No expected kernel changes; test hardening only unless a regression is discovered
**Deps**: tickets/README.md, packages/engine/src/kernel/turn-flow-eligibility.ts, packages/engine/src/kernel/legal-moves-turn-order.ts, packages/engine/test/unit/kernel/legal-choices.test.ts, packages/engine/test/integration/fitl-event-free-operation-grants.test.ts

## Problem

This ticket originally assumed a live kernel parity bug for `executeAsSeat` free-operation grants in FITL card flow. Reassessment against current HEAD shows the underlying kernel parity implementation is already present for discovery, legal-move synthesis, grant validation, and grant consumption.

Remaining risk is narrower: we do not have an explicit regression test that proves `executeAsSeat` parity on a `specialActivity` actionId path (for example `airStrike`) where action-class mapping is `specialActivity` but grant class is operation-family.

## Assumption Reassessment (2026-03-07)

1. Execute-as grant plumbing exists in kernel (`pendingFreeOperationGrants.executeAsSeat`, execution-seat resolution, and free-operation analysis). **Confirmed** in `turn-flow-eligibility.ts`.
2. Unit and integration tests already cover execute-as behavior for `operation` actionIds. **Confirmed** in:
   - `packages/engine/test/unit/kernel/legal-choices.test.ts`
   - `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts`
3. Kernel class-compatibility logic explicitly allows operation-class grants to authorize `specialActivity` moves (the intended Air Strike pattern). **Confirmed** in `turn-flow-eligibility.ts`.
4. Ticket’s prior claim of a currently failing FITL card-30 free-grant path is stale for this ticket scope. Current `USS New Jersey` integration test asserts direct-effect representation (`freeOperationGrants` undefined), so card-30 grant-driven behavior belongs to `LEGACTTOO-029`.

## Architecture Reassessment

1. Additional kernel rewiring proposed by the original ticket is no longer beneficial versus current architecture because it duplicates behavior already centralized in turn-flow eligibility and grant analysis.
2. The highest-value, lowest-risk change is invariant hardening via targeted tests for the still-uncovered `specialActivity` execute-as path.
3. Keep engine generic: no FITL-specific branching in kernel. Validate behavior through generic test fixtures.

## Updated Scope

### 1. Add targeted special-activity execute-as regression coverage

- Extend `fitl-event-free-operation-grants` integration fixtures with a free grant that:
  - targets a `specialActivity` actionId (air-strike-like action)
  - uses `seat: self` + `executeAsSeat`
  - requires execute-as profile applicability to become legal
- Assert free move emission, successful apply, and grant consumption.

### 2. Keep production card-specific rework out of this ticket

- Do not modify card-30/production FITL content here.
- Track card-30 grant-driven migration in `LEGACTTOO-029`.

## Files to Touch

- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `tickets/LEGACTTOO-028-free-operation-execute-as-seat-special-activity-parity.md` (modify)

## Out of Scope

- Kernel behavior rewrites already covered by current architecture.
- Card-30 FITL data/model migration.
- Runner/UI changes.

## Acceptance Criteria

### Tests That Must Pass

1. Existing execute-as operation coverage still passes.
2. New integration test proves execute-as parity for `specialActivity` actionId free grants.
3. `pnpm -F @ludoforge/engine test:unit`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm -F @ludoforge/engine lint`

### Invariants

1. Free-operation eligibility/discovery/applicability remains driven by one coherent execute-as resolution model.
2. No game-specific branches are introduced in kernel logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — add execute-as `specialActivity` regression fixture and assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js`
4. `pnpm -F @ludoforge/engine test:integration`
5. `pnpm -F @ludoforge/engine test:unit`
6. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-07
- What changed:
  - Reassessed and corrected ticket assumptions/scope to reflect current kernel state.
  - Added explicit execute-as `specialActivity` regression coverage in `fitl-event-free-operation-grants` (air-strike-like `actionId` with `executeAsSeat` and operation-family grant class).
  - Verified no kernel code changes were required; current architecture already centralizes execute-as parity in generic turn-flow/grant analysis.
- Deviations from original plan:
  - Did not modify kernel files because the originally proposed parity rewiring was already implemented.
  - Did not add production `USS New Jersey` grant assertions in this ticket because card-30 is still direct-effect modeled and tracked separately in `LEGACTTOO-029`.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/integration/fitl-event-free-operation-grants.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-choices.test.js` passed.
  - `pnpm -F @ludoforge/engine test:integration` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
