# CONOPESURREG-005: Reassess condition validation metadata refactor scope

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Maybe — verification/doc-only unless a real defect is found
**Deps**: CONOPESURREG-001, CONOPESURREG-002

## Problem

This ticket originally assumed `packages/engine/src/kernel/validate-conditions.ts` still duplicated condition structural field walking in a per-operator switch. That assumption is now stale. The file already uses metadata-driven traversal via `getConditionOperatorMeta(condition.op)` and `validateConditionStructure(...)`.

The remaining need is to keep the ticket set accurate: this ticket no longer owns a missing traversal refactor, and it should not be mistaken for ownership of the separate typed-metadata follow-up.

## Assumption Reassessment (2026-03-14)

1. `packages/engine/src/kernel/validate-conditions.ts` already performs metadata-driven structural traversal for condition validation.
2. The remaining explicit branches in that file are already the intended operator-specific checks: boolean arity, marker lattice validation, map-space property validation, and comparison-operator marker-state literal handling.
3. There is no remaining duplicate structural traversal refactor to land here unless a defect is discovered.
4. The still-open architectural weakness in this area is typing precision: metadata field names are plain strings and consumers cast through `Record<string, unknown>`.
5. That typing issue is separate in scope and should be tracked by a dedicated ticket rather than silently folded into this stale one.

## Architecture Check

1. Correcting stale ticket ownership is cleaner than leaving misleading refactor instructions in the active queue.
2. The current production architecture already matches the Spec 62 direction: metadata owns structural shape, while consumer files keep their semantic checks local.
3. A typed-metadata follow-up should stay game-agnostic and contract-focused, not introduce aliases, shims, or game-specific branching.

## What to Change

### 1. Keep this ticket informational unless a real defect is found

Do not re-refactor `validate-conditions.ts` just to satisfy the original wording. Only touch kernel code if a verified bug or architectural mismatch is found during future work.

### 2. Point typed-metadata work to the dedicated follow-up

Use `CONOPESURREG-006` for the stronger typing improvement around condition metadata field access.

## Files to Touch

- `tickets/CONOPESURREG-005.md` (modify)

## Out of Scope

- Re-implementing metadata-driven validation traversal that already exists
- Folding typed metadata work into this ticket; see `CONOPESURREG-006`
- Modifying `types-ast.ts`
- Refactoring unrelated condition evaluation, display, or lowering logic

## Acceptance Criteria

### Tests That Must Pass

1. No code changes are required unless a real defect is found.
2. If future code changes are made under this ticket, they must preserve validation behavior and pass `pnpm -F @ludoforge/engine test`.
3. Any follow-up typing work is handled under `CONOPESURREG-006`, not hidden here.

### Invariants

1. Active tickets must match the current codebase rather than stale pre-refactor assumptions.
2. Condition structural metadata remains centralized in `condition-operator-meta.ts`.

## Test Plan

### New/Modified Tests

1. No tests required for this ticket as corrected; it is a scope/ownership correction.

### Commands

1. `pnpm run check:ticket-deps`
