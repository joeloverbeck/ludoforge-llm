# ENGINEARCH-146: Archive Outcome Sync After Post-Archive Refinement

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — archival artifact + workflow hardening
**Deps**: archive/tickets/ENGINEARCH-140-structured-choice-options-diagnostic-details-contract.md

## Problem

After ENGINEARCH-140 was archived, follow-up implementation refinements (now committed) changed diagnostic rendering ownership and verification totals. The archived ticket now reports stale outcome details, reducing architectural traceability and post-hoc audit reliability.

## Assumption Reassessment (2026-02-28)

1. `archive/tickets/ENGINEARCH-140-structured-choice-options-diagnostic-details-contract.md` currently states caller-owned rendering and `323` passing tests.
2. Current committed implementation has shared rendering ownership in `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic-rendering.ts` and full engine suite at `326` passing tests (`pnpm -F @ludoforge/engine test`).
3. Mismatch: archived outcome no longer matches implemented state; corrected scope is to reconcile archived outcome text and harden archival policy for post-archive refinements.

## Architecture Check

1. Architecture decisions are only durable if archived records remain accurate after follow-up refinements.
2. This change stays game-agnostic and process-only: no GameSpecDoc/visual-config/GameDef/runtime behavior changes.
3. No backwards-compatibility aliasing/shims; this is direct correction of historical record and workflow guardrails.

## What to Change

### 1. Correct archived ENGINEARCH-140 outcome details

Update outcome bullets to reflect:
- shared renderer ownership for final message/suggestion formatting,
- latest verification totals and command results.

### 2. Add workflow guard for post-archive implementation refinements

Update archival guidance so when implementation changes materially after archive, the archived ticket outcome must be amended before merge/finalization.

## Files to Touch

- `archive/tickets/ENGINEARCH-140-structured-choice-options-diagnostic-details-contract.md` (modify)
- `docs/archival-workflow.md` (modify)

## Out of Scope

- Runtime/kernel behavior changes.
- Diagnostic taxonomy redesign.
- Any GameSpecDoc or visual-config schema/content changes.

## Acceptance Criteria

### Tests That Must Pass

1. Archived ENGINEARCH-140 outcome accurately describes final implemented ownership and verification numbers.
2. Archival workflow explicitly covers post-archive refinement reconciliation.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/engine lint`
5. Existing integrity check: `pnpm run check:ticket-deps`

### Invariants

1. Archived tickets remain reliable records of what was actually shipped.
2. Engine runtime and simulator remain game-agnostic and unaffected by archival-process changes.

## Test Plan

### New/Modified Tests

1. No new code tests required — documentation/process-only change.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`
3. `pnpm run check:ticket-deps`

## Outcome

- **Completion Date**: 2026-02-28
- **What Changed**:
  - Updated `archive/tickets/ENGINEARCH-140-structured-choice-options-diagnostic-details-contract.md` Outcome text to match implemented architecture:
    - shared renderer ownership via `packages/engine/src/kernel/choice-options-runtime-shape-diagnostic-rendering.ts`,
    - latest engine verification total (`326` passing tests).
  - Updated `docs/archival-workflow.md` with an explicit post-archive refinement reconciliation guard requiring archived Outcome amendments before merge/finalization when implementation facts change.
- **Deviations From Original Plan**:
  - None. Scope remained documentation/process-only and game/runtime behavior was untouched.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine test` passed (`326` passed, `0` failed).
  - `pnpm -F @ludoforge/engine lint` passed.
  - `pnpm run check:ticket-deps` passed (`4` active tickets checked, `0` issues).
