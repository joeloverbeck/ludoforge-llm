# EXEASEATPIP-001: executeAsSeat pipeline predicate evaluation in grant viability

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: No expected kernel changes; ticket now scopes to fixture correction plus regression confirmation
**Deps**: None

## Problem

This ticket originally assumed a live kernel bug in `legal-moves.ts`. Current code and tests no longer support that assumption.

The repository now threads `executeAsSeat` through free-operation discovery, preflight, and application in multiple places:

- `free-operation-discovery-analysis.ts` derives the effective execution player for discovery.
- `buildFreeOperationPreflightOverlay(...)` is used from legal-move enumeration and completed-move legality checks.
- existing unit tests already assert `executeAsSeat` behavior in `applyMove`, `legalChoicesDiscover`, and `legalMoves`.

The remaining discrepancy is in the integration fixtures: three `executeAsSeat` card-driven defs still omit `event: 'event'` from `actionClassByActionId`, which no longer reflects the intended architecture for card-driven turn flow. The ticket is therefore narrowed to removing that stale fixture workaround and proving the current architecture handles the properly configured defs.

## Assumption Reassessment (2026-03-22)

1. `legal-moves.ts` still contains `collectViableNonExecutionContextReadyGrantIds`, but it is no longer the sole architectural locus for `executeAsSeat` handling.
2. `free-operation-discovery-analysis.ts` already prioritizes an applicable `executeAsSeat` grant and resolves an overridden execution player for discovery/preflight contexts.
3. Existing tests already cover this behavior in three layers:
   - `packages/engine/test/unit/kernel/apply-move.test.ts`
   - `packages/engine/test/unit/kernel/legal-choices.test.ts`
   - `packages/engine/test/unit/kernel/legal-moves.test.ts`
4. The three integration fixtures still have incomplete `actionClassByActionId` maps:
   - `createExecuteAsSeatDef`
   - `createExecuteAsSeatZoneBindingDef`
   - `createExecuteAsSeatSpecialActivityDef`
5. The stale part of the ticket was the proposed kernel change, not the fixture correction. The architecture has already moved toward the cleaner model: centralized discovery/preflight threading instead of a one-off override parameter added only to `legal-moves.ts`.

## Architecture Check

1. The current architecture is already better than the originally proposed patch. `executeAsSeat` is handled through shared discovery/preflight machinery rather than by threading another special-case parameter through `legal-moves.ts`.
2. That centralization is the more robust and extensible direction: one model for discovery, one model for application, no alias path.
3. The ticket should therefore avoid re-opening the architecture with a localized override unless the corrected fixtures expose a new failing case.
4. Engine-agnostic: `executeAsSeat` remains a generic seat-impersonation mechanism.

## What to Change

### 1. Correct the three stale integration fixtures

Add `event: 'event'` to all 3 `executeAsSeat` fixture `actionClassByActionId` maps so the defs reflect the intended card-driven action-class configuration:

- `createExecuteAsSeatDef`: `{ operation: 'operation' }` → `{ event: 'event', operation: 'operation' }`
- `createExecuteAsSeatZoneBindingDef`: `{ operation: 'operation' }` → `{ event: 'event', operation: 'operation' }`
- `createExecuteAsSeatSpecialActivityDef`: `{ airStrike: 'specialActivity' }` → `{ event: 'event', airStrike: 'specialActivity' }`

### 2. Keep regression coverage aligned with the actual architecture

Use the existing `executeAsSeat` regression tests as the proof surface. Add or strengthen tests only if the corrected fixtures expose an uncovered invariant.

### 3. Do not add a new `legal-moves.ts` override parameter unless the corrected fixtures prove a remaining bug

The previous proposal to extend `isFreeOperationCandidateAdmitted` was based on stale code understanding and is no longer the preferred architecture.

## Files to Touch

- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify — 3 fixture defs)
- this ticket file (modify — corrected assumptions and scope)

## Out of Scope

- kernel refactoring that is not justified by a reproduced failing case
- adding alias paths or compatibility shims
- broad rewrites of free-operation legality/discovery code

## Acceptance Criteria

### Tests That Must Pass

1. `applies free-operation grants with executeAsSeat using the overridden action profile` — must pass WITH `event: 'event'` in `actionClassByActionId`
2. `keeps event-issued executeAsSeat free operations discoverable when an earlier same-action grant is pipeline-inapplicable` — must pass WITH the mapping
3. `keeps requireUsableForEventPlay executeAsSeat grants playable when viability depends on the overridden profile` — must pass WITH the mapping
4. `applies executeAsSeat free-operation grants to special-activity actionIds` — must pass WITH `event: 'event'`
5. `keeps requireUsableAtIssue executeAsSeat grants usable when moveZoneBindings depend on the overridden profile` — must pass WITH the mapping
6. Existing unit regressions proving executeAsSeat threading remain green:
   - `applyMove`
   - `legalChoicesDiscover`
   - `legalMoves`
7. Existing suite: relevant engine tests plus `pnpm -F @ludoforge/engine test`

### Invariants

1. When a grant specifies `executeAsSeat`, pipeline applicability predicates referencing `activePlayer` must evaluate against the executeAs seat index, not the actual active player
2. Properly configured card-driven defs must not need incomplete `actionClassByActionId` maps as a workaround
3. If the corrected fixtures fail, the follow-up fix must preserve the centralized discovery/preflight architecture rather than adding a one-off compatibility path

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — modify 3 fixture defs to include `event: 'event'` in `actionClassByActionId`
2. Add/strengthen tests only if fixture correction exposes a missing invariant

### Commands

1. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm turbo typecheck`
4. `pnpm turbo lint`

## Outcome

- Completion date: 2026-03-22
- What actually changed: corrected the ticket to match the current architecture, then updated the three `executeAsSeat` integration fixtures to include `event: 'event'` in `actionClassByActionId`.
- Deviations from original plan: no kernel change was needed. The originally proposed `legal-moves.ts` override threading would have duplicated logic that is already handled by the shared discovery/preflight path.
- Verification results:
  - `pnpm -F @ludoforge/engine test:integration:fitl-rules` passed
  - `pnpm -F @ludoforge/engine test` passed
  - `pnpm turbo typecheck` passed
  - `pnpm turbo lint` passed
