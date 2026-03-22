# EXEASEATPIP-001: executeAsSeat pipeline predicate evaluation in grant viability

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel legal-moves.ts grant viability logic
**Deps**: None

## Problem

`collectViableNonExecutionContextReadyGrantIds` (`legal-moves.ts:620-649`) evaluates whether grants are viable for a candidate move, but does not propagate the `executeAsSeat` override when calling `isFreeOperationCandidateAdmitted`. The function resolves `candidateExecutionPlayer` via `resolvePendingFreeOperationGrantExecutionPlayer` (line 623) but only uses it for the `undefined` guard (line 624), never to override the eval context.

This means pipeline applicability predicates like `{ op: '==', left: { ref: 'activePlayer' }, right: 0 }` evaluate against the actual active player instead of the executeAs seat. The main grant enumeration loop (lines 651-707) correctly applies the override via `buildFreeOperationPreflightOverlay` with `executionPlayer` — `collectViableNonExecutionContextReadyGrantIds` is inconsistent.

**Current workaround**: The 3 `executeAsSeat` test fixtures (`createExecuteAsSeatDef` at line 1157, `createExecuteAsSeatZoneBindingDef` at line 1268, `createExecuteAsSeatSpecialActivityDef` at line 2008) omit `event: 'event'` from their `actionClassByActionId`. This keeps the option matrix dormant, preventing `collectViableNonExecutionContextReadyGrantIds` from being reached for these grants. Adding the mapping causes stall loops.

## Assumption Reassessment (2026-03-22)

1. `collectViableNonExecutionContextReadyGrantIds` at line 620 calls `resolvePendingFreeOperationGrantExecutionPlayer` to get `candidateExecutionPlayer` but only uses it for the `undefined` guard (line 624). It never passes the override to `isFreeOperationCandidateAdmitted`.
2. `isFreeOperationCandidateAdmitted` (line 561) calls `isFreeOperationApplicableForMove` which evaluates pipeline applicability predicates using the state's `activePlayer` — no override mechanism exists in the current call chain from `collectViableNonExecutionContextReadyGrantIds`.
3. The main enumeration loop (line 681-694) correctly builds a `freeOperationPreflightOverlay` with `executionPlayer` that overrides the active player for pipeline dispatch. This overlay pattern is the correct model.
4. All 3 `executeAsSeat` defs currently have incomplete `actionClassByActionId` (lines 1178, 1304, 2028) — missing `event: 'event'`.

## Architecture Check

1. The fix mirrors the existing pattern in the main enumeration loop (lines 681-694) — use `buildFreeOperationPreflightOverlay` or equivalent to create a scoped context reflecting the `executeAsSeat` override.
2. Engine-agnostic: `executeAsSeat` is a generic mechanism for seat impersonation. The fix ensures the generic pipeline predicate evaluation respects generic seat overrides.
3. No backwards compatibility shims. The current behavior is a bug — it silently rejects valid grants.

## What to Change

### 1. Modify `collectViableNonExecutionContextReadyGrantIds` in `legal-moves.ts` (~line 620-649)

When `candidateExecutionPlayer` differs from the state's active player (i.e., an `executeAsSeat` override is active), create a scoped state or pass the override so that `isFreeOperationCandidateAdmitted` evaluates pipeline predicates against the correct player context.

Approach options:
- **Option A**: Extend `isFreeOperationCandidateAdmitted` to accept an optional `executionPlayerOverride` parameter, which propagates to `isFreeOperationApplicableForMove` and through to the preflight overlay.
- **Option B**: Create the scoped state with `activePlayer` set to `candidateExecutionPlayer` before passing to `isFreeOperationCandidateAdmitted`.

Option A is cleaner (doesn't mutate state shape) and mirrors the existing overlay pattern.

### 2. Add `event: 'event'` to all 3 `executeAsSeat` test fixture `actionClassByActionId` maps

- `createExecuteAsSeatDef` line 1178: `{ operation: 'operation' }` → `{ event: 'event', operation: 'operation' }`
- `createExecuteAsSeatZoneBindingDef` line 1304: `{ operation: 'operation' }` → `{ event: 'event', operation: 'operation' }`
- `createExecuteAsSeatSpecialActivityDef` line 2028: `{ airStrike: 'specialActivity' }` → `{ event: 'event', airStrike: 'specialActivity' }`

This removes the workaround and exercises the now-fixed code path.

## Files to Touch

- `packages/engine/src/kernel/legal-moves.ts` (modify — `collectViableNonExecutionContextReadyGrantIds`, lines ~620-649)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify — 3 fixture defs)

## Out of Scope

- Refactoring the overall `isFreeOperationCandidateAdmitted` architecture (this is a targeted fix)
- Adding new `executeAsSeat` test scenarios beyond restoring proper configuration in existing fixtures
- Changes to the main enumeration loop (it already works correctly)

## Acceptance Criteria

### Tests That Must Pass

1. `applies free-operation grants with executeAsSeat using the overridden action profile` — must pass WITH `event: 'event'` in `actionClassByActionId`
2. `keeps event-issued executeAsSeat free operations discoverable when an earlier same-action grant is pipeline-inapplicable` — must pass WITH the mapping
3. `keeps requireUsableForEventPlay executeAsSeat grants playable when viability depends on the overridden profile` — must pass WITH the mapping
4. `applies executeAsSeat free-operation grants to special-activity actionIds` — must pass WITH `event: 'event'`
5. `keeps requireUsableAtIssue executeAsSeat grants usable when moveZoneBindings depend on the overridden profile` — must pass WITH the mapping
6. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. When a grant specifies `executeAsSeat`, pipeline applicability predicates referencing `activePlayer` must evaluate against the executeAs seat index, not the actual active player
2. `collectViableNonExecutionContextReadyGrantIds` and the main enumeration loop must produce consistent results for `executeAsSeat` grants

## Test Plan

### New/Modified Tests

1. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — modify 3 fixture defs to include `event: 'event'` in `actionClassByActionId`, proving the fix works under proper configuration

### Commands

1. `pnpm -F @ludoforge/engine test:integration:fitl-rules`
2. `pnpm turbo test`
3. `pnpm turbo typecheck`
