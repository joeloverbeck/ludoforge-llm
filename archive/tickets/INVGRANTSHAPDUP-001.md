# INVGRANTSHAPDUP-001: Investigate toPendingFreeOperationGrant triplication

**Status**: COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — investigation only (consolidation ticket as follow-up if confirmed)
**Deps**: None

## Problem

The function `toPendingFreeOperationGrant` — converting a grant contract to a pending grant object — appears duplicated in three locations:
1. `packages/engine/src/kernel/turn-flow-eligibility.ts`
2. `packages/engine/src/kernel/free-operation-viability.ts`
3. Inline construction in `packages/engine/src/kernel/effects-turn-flow.ts`

If all three produce the same field set, this is a DRY violation. The natural consolidation target is `grant-lifecycle.ts`.

## Assumption Reassessment (2026-04-08)

1. `toPendingFreeOperationGrant` exists in turn-flow-eligibility.ts — needs verification of exact location and signature
2. `toPendingFreeOperationGrant` exists in free-operation-viability.ts — needs verification
3. Inline construction in effects-turn-flow.ts — needs verification of field-set equivalence

## Architecture Check

1. This is an investigation, not an implementation — no code changes
2. If confirmed identical, a single consolidation ticket moves the factory to `grant-lifecycle.ts`
3. If the three sites intentionally produce different field subsets, the duplication is acceptable

## What to Change

### 1. Read and compare all three sites

Read `toPendingFreeOperationGrant` in `turn-flow-eligibility.ts` and `free-operation-viability.ts`. Read the inline construction in `effects-turn-flow.ts` (around line 324-345). Diff the field sets.

### 2. Check for intentional differences

Are any fields conditionally omitted in one site but not others? Does one site produce a subset for probing purposes?

### 3. Write verdict

- **Confirmed identical**: Write a follow-up consolidation ticket (move to `grant-lifecycle.ts`, update 3 import sites)
- **Rejected**: Document which fields differ and why the duplication is intentional

## Files to Touch

- No source files modified
- Read: `packages/engine/src/kernel/turn-flow-eligibility.ts`
- Read: `packages/engine/src/kernel/free-operation-viability.ts`
- Read: `packages/engine/src/kernel/effects-turn-flow.ts`
- Read: `packages/engine/src/kernel/grant-lifecycle.ts` (natural consolidation target)

## Out of Scope

- Implementing the consolidation (that's a follow-up ticket)
- The broader grant array authority split (covered by prior archived report)

## Acceptance Criteria

### Tests That Must Pass

1. No tests — investigation only

### Invariants

1. No source files modified
2. Verdict includes a field-by-field comparison of the three sites

## Test Plan

### New/Modified Tests

1. None

### Commands

1. None — static analysis only

## Verdict (2026-04-08)

**Confirmed identical**. The pending-grant construction is duplicated across all three named sites:

1. `packages/engine/src/kernel/turn-flow-eligibility.ts`
2. `packages/engine/src/kernel/free-operation-viability.ts`
3. `packages/engine/src/kernel/effects-turn-flow.ts`

### Field-by-field comparison

All three construct the same pending-grant field set:

1. `grantId`
2. `phase`
3. `seat`
4. Optional `executeAsSeat`
5. `operationClass`
6. Optional `actionIds`
7. Optional `zoneFilter`
8. Optional `tokenInterpretations`
9. Optional `moveZoneBindings`
10. Optional `moveZoneProbeBindings`
11. Optional `sequenceContext`
12. Optional `executionContext`
13. Optional `allowDuringMonsoon`
14. Optional `viabilityPolicy`
15. Optional `completionPolicy`
16. Optional `outcomePolicy`
17. Optional `postResolutionTurnFlow`
18. `remainingUses`
19. Optional `sequenceBatchId`
20. Optional `sequenceIndex`

### Corrected architectural boundary

The original ticket's suggested consolidation target, `packages/engine/src/kernel/grant-lifecycle.ts`, is stale against the live module graph. `grant-lifecycle.ts` already imports `free-operation-viability.ts`, and `free-operation-viability.ts` already imports `grant-lifecycle.ts`. Moving the shared factory directly into `grant-lifecycle.ts` would require extra dependency untangling and is not the narrowest `docs/FOUNDATIONS.md`-compliant follow-up.

### Follow-up

Created follow-up ticket `tickets/GRANTPENDBUILDER-001.md` to extract one authoritative pending-grant builder into a neutral helper module and migrate all three callers atomically.

## Outcome

Completed: 2026-04-08

Investigation confirmed that pending free-operation grant construction is duplicated identically across `turn-flow-eligibility.ts`, `free-operation-viability.ts`, and `effects-turn-flow.ts`. The review also established that the original proposed consolidation target, `grant-lifecycle.ts`, is not the narrowest safe extraction point because the live module graph already couples it with `free-operation-viability.ts`.

Deviation from original plan: instead of recommending a move into `grant-lifecycle.ts`, the investigation created follow-up ticket `tickets/GRANTPENDBUILDER-001.md` for a neutral shared helper module that can absorb all three callers atomically without adding a cycle-prone dependency.

Verification results: static analysis only, per ticket scope. Confirmed the three construction sites and their field sets directly in source, created the follow-up ticket, and ran `pnpm run check:ticket-deps` successfully before archival.
