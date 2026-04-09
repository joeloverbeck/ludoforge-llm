# ARCHINVEST-002: Investigate decision resolution test helper drift

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: Possibly — test helpers only
**Deps**: None

## Problem

The test helper `decision-param-helpers.ts` reimplements a decision resolution loop using `completeMoveDecisionSequence`. This could indicate the kernel's public API is insufficient for common test patterns, or it could be acceptable test ergonomics (a thin wrapper with no behavioral drift).

**Source**: `reports/architectural-abstractions-2026-04-09-fitl-events-1968-nva.md` — Needs Investigation item B.

## Investigation Steps

### 1. Read the test helper implementation

Read `packages/engine/test/helpers/decision-param-helpers.ts` and compare its resolution loop against the kernel's `resolveMoveDecisionSequence` in `packages/engine/src/kernel/move-decision-sequence.ts`.

Document: Does the helper add logic beyond what the kernel provides? Or is it a thin adapter for test convenience (e.g., converting override rules to choose callbacks)?

### 2. Check usage breadth

```bash
grep -r "applyMoveWithResolvedDecisionIds" packages/engine/test/ --include="*.ts" -l
```

Count how many test files depend on this helper. High usage suggests it fills a genuine API gap.

### 3. Check for behavioral divergence

Compare the helper's decision loop termination conditions, error handling, and edge-case handling against the kernel's `completeMoveDecisionSequence`. If the helper handles cases the kernel doesn't (or vice versa), document the divergence.

### 4. Determine outcome

- **If API gap exists**: Create a follow-up ticket to expose the missing convenience in the kernel's public API (e.g., a `applyMoveWithDecisionOverrides` that accepts override rules directly)
- **If thin wrapper**: Close as acceptable test ergonomics; no action needed

## Files to Touch

- `packages/engine/test/helpers/decision-param-helpers.ts` (read only)
- `packages/engine/src/kernel/move-decision-sequence.ts` (read only)

## Out of Scope

- Modifying the kernel's decision resolution API (follow-up if gap confirmed)
- Changing existing test patterns

## Acceptance Criteria

### Tests That Must Pass

N/A — investigation only, no code changes.

### Invariants

1. No code changes made during investigation

## Test Plan

### Commands

N/A — read-only investigation.
