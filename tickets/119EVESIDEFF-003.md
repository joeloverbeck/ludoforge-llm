# 119EVESIDEFF-003: Thread manifest through apply-move and turn-flow-eligibility

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel move application and turn-flow eligibility
**Deps**: `archive/tickets/119EVESIDEFF-002.md`

## Problem

The minimal manifest-threading consumer migration was absorbed into ticket 002 to keep the repository atomic under Foundations 14. This ticket now owns the remaining cleanup and hardening work after the manifest is already threaded through `apply-move.ts` and `turn-flow-eligibility.ts`.

## Assumption Reassessment (2026-04-09)

1. Ticket 002 now owns the atomic `EventMoveExecutionResult` migration plus the minimal `apply-move.ts` / `turn-flow-eligibility.ts` consumer threading required to keep the repo buildable — confirmed by user-approved boundary rewrite on 2026-04-09.
2. After that migration lands, the remaining direct-manifest cleanup is primarily export/test fallout and any residual redundant helper surface — confirmed from spec + active ticket review.

## Architecture Check

1. Keeping ticket 003 focused on post-threading cleanup avoids overlapping active ownership after the ticket-002 boundary rewrite.
2. Game-agnostic — remaining cleanup still concerns generic manifest plumbing and public surface discipline only.
3. No backwards compatibility — ticket 002 performs the atomic signature change; this ticket must not reintroduce transitional aliases.

## What to Change

### 1. Remove obsolete helper/export surface after manifest threading

Once ticket 002 lands, audit `turn-flow-eligibility.ts` and `event-execution.ts` for helper paths that became dead or redundant because the manifest is now threaded directly.

### 2. Keep downstream cleanup scoped to the post-threading state

Do not re-open the atomic signature migration already owned by ticket 002. This ticket should only own cleanup that is provably still necessary after that migration.

## Files to Touch

- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)

## Out of Scope

- The atomic `executeEventMove` return-type migration and manifest consumer threading now owned by ticket 002
- Removing `resolveEventFreeOperationGrants`/`resolveEventEligibilityOverrides` exports from `event-execution.ts` — that remains ticket 004
- Modifying test files — that remains ticket 004 unless required by later reassessment

## Acceptance Criteria

### Tests That Must Pass

1. `pnpm turbo typecheck` passes — no type errors from changed signatures
2. `pnpm -F @ludoforge/engine test` — full engine test suite passes (~114 event test files produce identical results)
3. `pnpm turbo lint` passes

### Invariants

1. `applyTurnFlowEligibilityAfterMove` no longer calls into `event-execution.ts` resolve functions — it receives all data via the manifest
2. `apply-move.ts` no longer threads bare `deferredEventEffect` — only the manifest
3. The same grants, overrides, and deferred effects are applied as before — behavioral equivalence
4. No mutation — manifest is passed as a readonly value

## Test Plan

### New/Modified Tests

1. No new tests required — this is an internal refactor. The existing ~114 event test files validate behavioral equivalence.

### Commands

1. `pnpm -F @ludoforge/engine test` — full engine test suite
2. `pnpm turbo typecheck` — type safety across packages
3. `pnpm turbo lint` — no new lint violations
