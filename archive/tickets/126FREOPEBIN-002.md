# 126FREOPEBIN-002: Investigate and bound legal-move enumeration hangs

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — free-operation viability probe budgeting, FITL regression coverage
**Deps**: None

## Problem

~10% of FITL simulation seeds (e.g., 1040, 1054) cause `enumerateLegalMoves()` to never return, violating Foundation 10 (Bounded Computation). The hang occurs inside a single call, so the simulator's `maxTurns` guard never triggers. The existing `MoveEnumerationBudgets` system bounds template and parameter expansion but may not cover all code paths — the specific unbounded loop must be identified before it can be bounded.

## Assumption Reassessment (2026-04-11)

1. `MoveEnumerationBudgets` in `move-enumeration-budgets.ts` has 5 fields: `maxTemplates`, `maxParamExpansions`, `maxDecisionProbeSteps`, `maxDeferredPredicates`, `maxCompletionDecisions` — confirmed.
2. `resolveMoveEnumerationBudgets` resolves overrides with defaults — confirmed.
3. `legal-moves.ts` tracks `templateBudgetExceeded` and `paramExpansionBudgetExceeded` flags — confirmed.
4. `decision-sequence-satisfiability.ts` and `free-operation-viability.ts` also consume `MoveEnumerationBudgets` — confirmed as candidate hang locations.
5. `enumerateLegalMoves` is exported from `legal-moves.ts` line 1403, re-exported in kernel `index.ts`, consumed by 72+ files — confirmed. Behavioral changes must be transparent to callers.
6. Live tracing on seed `1040` showed the top-level action enumeration completed and the stall occurred in `applyTurnFlowWindowFilters()` while checking the first `event` move on ply 20. The blocking subpath was `isEventMovePlayableUnderGrantViabilityPolicy(...)` → `isFreeOperationGrantUsableInCurrentState(...)` for FITL `card-75` (`Sihanouk`) unshaded `requireUsableForEventPlay` grants.
7. The existing `maxParamExpansions` / `maxDecisionProbeSteps` budgets did not stop the live hang because `visitSelectableDecisionValues(...)` only charged `maxParamExpansions` after a full `chooseN` selection was materialized, not while traversing the combination tree.

## Architecture Check

1. Keep the fix inside the existing `MoveEnumerationBudgets` infrastructure rather than adding a new simulator stop reason. The live stall was inside free-operation viability probing, so the existing probe budgets were the right contract; the bug was incomplete accounting.
2. Bound traversal where the search tree actually expands: charge `maxParamExpansions` while visiting `chooseOne` and `chooseN` candidates inside `free-operation-viability.ts`, not only after a completed selection reaches the callback.
3. Preserve caller behavior. No public API or stop-reason changes were needed once the hot-path accounting was corrected.

## What to Change

### 1. Investigate hang mechanism

Trace the live hang on seeds `1040` / `1054` and document the actual hot path before coding. If the stall is outside the main enumeration loop, re-scope to the real boundary rather than adding a parallel budget surface.

### 2. Fix probe-budget accounting in `free-operation-viability.ts`

Update `visitSelectableDecisionValues(...)` so the existing `maxParamExpansions` budget is charged while traversing `chooseOne` candidates and `chooseN` combination branches. This closes the gap where very large event-grant viability searches could expand deep search trees before any completed selection hit the existing counter.

### 3. Add focused regression coverage

Add one unit regression that proves `chooseN` branch traversal is budgeted before the first completed selection resolves, and one FITL integration regression that advances production seed `1040` through the former ply-20 event enumeration stall.

## Files to Touch

- `packages/engine/src/kernel/free-operation-viability.ts` (modify)
- `packages/engine/test/unit/kernel/free-operation-viability.test.ts` (modify)
- `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` (new)

## Out of Scope

- Zone filter probe `MISSING_VAR` fix (ticket 001)
- Agent template completion fallback (ticket 003)
- FITL-specific data fixes (ticket 004)
- Changing existing `MoveEnumerationBudgets` field defaults
- Adding a new simulator stop reason when the existing probe-budget contract is sufficient

## Acceptance Criteria

### Tests That Must Pass

1. Unit: `free-operation-viability.test.ts` proves `chooseN` branch traversal consumes `maxParamExpansions` before the first completed selection resolves
2. Integration: production FITL seed `1040` reaches ply 20 and returns legal moves instead of hanging in event window filtering
3. Existing focused checks: `pnpm -F @ludoforge/engine build` and direct `node --test` runs pass

### Invariants

1. Callers of `enumerateLegalMoves` see no API change
2. Existing probe budgets remain the only public contract; the fix only closes an internal accounting gap
3. Determinism preserved — same seed + same agents still produces the same reachable decision point
4. The event-play grant viability search remains bounded (Foundation 10)

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/free-operation-viability.test.ts` — extend with traversal-budget regression
2. `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts` — new production-seed regression

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/free-operation-viability.test.js`
3. `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent-enumeration-hang.test.js`

## Outcome

- Completed: 2026-04-11
- What changed:
  - fixed the live hang in `packages/engine/src/kernel/free-operation-viability.ts` by charging `maxParamExpansions` during `chooseOne` and `chooseN` traversal rather than only after a completed selection materialized
  - added a traversal-budget regression in `packages/engine/test/unit/kernel/free-operation-viability.test.ts`
  - added a production-seed regression in `packages/engine/test/integration/fitl-policy-agent-enumeration-hang.test.ts`
  - updated the active ticket text to reflect the real hot path and owned boundary
- Deviations from original plan:
  - the drafted `legal-moves.ts` / simulator-stop-reason plan was stale
  - live tracing showed the stall was in `applyTurnFlowWindowFilters()` on the first `event` move, specifically through `isEventMovePlayableUnderGrantViabilityPolicy(...)` into free-operation viability probing
  - no new `MoveEnumerationBudgets` field or simulator stop reason was needed once probe-budget accounting was corrected
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/unit/kernel/free-operation-viability.test.js`
  - `pnpm -F @ludoforge/engine exec node --test dist/test/integration/fitl-policy-agent-enumeration-hang.test.js`
