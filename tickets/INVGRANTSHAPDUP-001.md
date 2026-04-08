# INVGRANTSHAPDUP-001: Investigate toPendingFreeOperationGrant triplication

**Status**: PENDING
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
