# 119EVESIDEFF-003: Remove remaining event-resolution dependency from turn-flow-eligibility

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel event execution, turn-flow eligibility, legal move filtering
**Deps**: `archive/tickets/119EVESIDEFF-002.md`

## Problem

The atomic manifest threading was absorbed into ticket 002, but one runtime path in `turn-flow-eligibility.ts` still depends on event-resolution logic: `isEventMovePlayableUnderGrantViabilityPolicy(...)` probes event free-operation grants by calling back into event-execution helpers. That leaves turn-flow eligibility carrying an event-specific dependency even after manifest threading landed.

## Assumption Reassessment (2026-04-09)

1. Ticket 002 now owns the atomic `EventMoveExecutionResult` migration plus the minimal `apply-move.ts` / `turn-flow-eligibility.ts` consumer threading required to keep the repo buildable — confirmed by archived ticket outcome and live code.
2. `applyTurnFlowEligibilityAfterMove(...)` already consumes `EventSideEffectManifest` directly and no longer calls `resolveEventFreeOperationGrants(...)` or `resolveEventEligibilityOverrides(...)` — confirmed in live `turn-flow-eligibility.ts`.
3. The remaining source-level dependency is `isEventMovePlayableUnderGrantViabilityPolicy(...)`, still defined in `turn-flow-eligibility.ts` and still probing event grants from that module — confirmed.
4. `legal-moves-turn-order.ts` is the only live source consumer of `isEventMovePlayableUnderGrantViabilityPolicy(...)` — confirmed.
5. Public resolve-helper exports plus direct test imports remain after this cleanup and are still a separate ticket-004 boundary — confirmed.

## Architecture Check

1. Moving the event-specific grant-viability probe beside the event-resolution authority keeps `turn-flow-eligibility.ts` focused on turn-flow state transitions rather than event-card interpretation.
2. Game-agnostic — the change only relocates generic event-grant viability logic; no game-specific branching is introduced.
3. No backwards compatibility — this ticket removes a misplaced source dependency without reintroducing the old pre-manifest consumer path.

## What to Change

### 1. Relocate the event grant-viability probe to the event authority surface

Move `isEventMovePlayableUnderGrantViabilityPolicy(...)` out of `turn-flow-eligibility.ts` and into `event-execution.ts` (or another event-authority module if reassessment shows a cleaner acyclic placement). The probe may continue using pre-execution event grant resolution, but `turn-flow-eligibility.ts` must no longer own or directly depend on that event-resolution path.

### 2. Retarget the legal-move filter to the relocated probe

Update `legal-moves-turn-order.ts` to import the relocated probe from its new authority location. Keep `applyTurnFlowEligibilityAfterMove(...)` and the manifest consumer path unchanged.

## Files to Touch

- `packages/engine/src/kernel/event-execution.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)

## Out of Scope

- The atomic `executeEventMove` return-type migration and manifest consumer threading now owned by archived ticket 002
- Removing `resolveEventFreeOperationGrants`/`resolveEventEligibilityOverrides` exports from `event-execution.ts` — that remains ticket 004
- Migrating direct test imports of resolve helpers — that remains ticket 004 unless atomic fallout proves otherwise

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes — no type errors from the relocated probe or updated imports
2. `pnpm -F @ludoforge/engine test` — full engine test suite passes
3. `pnpm turbo lint` passes

### Invariants

1. `turn-flow-eligibility.ts` no longer owns event-specific grant-viability probing logic
2. `legal-moves-turn-order.ts` still enforces the same event grant viability policy as before — behavioral equivalence
3. `applyTurnFlowEligibilityAfterMove(...)` continues consuming manifest data only; this ticket does not reopen the manifest migration
4. No mutation — the relocation is behavior-preserving and readonly contracts remain unchanged

## Test Plan

### New/Modified Tests

1. No new tests required — this is an internal refactor. Existing event and turn-flow suites provide behavioral coverage.

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type safety across packages
3. `pnpm turbo lint` — no new lint violations

## Outcome

- Completed: 2026-04-09
- What changed:
  - Moved `isEventMovePlayableUnderGrantViabilityPolicy(...)` from `turn-flow-eligibility.ts` to `event-execution.ts`.
  - Updated `legal-moves-turn-order.ts` to consume the relocated probe from the event authority surface.
  - Removed the remaining event-resolution ownership from `turn-flow-eligibility.ts` while leaving manifest consumption unchanged.
- Deviations from original plan:
  - The original ticket wording had become stale after archived ticket 002 absorbed the atomic manifest-threading migration.
  - After a user-confirmed Foundations-based 1-3-1 reassessment on 2026-04-09, this ticket was rewritten to own the one remaining runtime cleanup rather than a broader post-threading boundary.
- Verification results:
  - Passed `pnpm -F @ludoforge/engine build`
  - Passed `pnpm turbo typecheck`
  - Passed `pnpm turbo lint`
  - Passed `pnpm -F @ludoforge/engine test`
  - Passed `pnpm run check:ticket-deps`
