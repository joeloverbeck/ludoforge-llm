# FITLRULES2-012: Make Legal-Move Deduplication Action-Class Aware

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — legal move variant generation/dedup
**Deps**: `specs/00-fitl-implementation-order.md`

## Problem

Move deduplication keys currently ignore `actionClass` even though class now affects turn-flow legality and free-operation grant matching. Distinct legal variants can collapse into one move entry.

## Assumption Reassessment (2026-02-23)

1. `applyPendingFreeOperationVariants` dedup key uses only `actionId + params + freeOperation`.
2. Turn-flow class can differ for same action id/params in constrained contexts.
3. Mismatch correction: dedup identity must include class semantics whenever class affects legality/execution.

## Architecture Check

1. Class-aware dedup is cleaner than implicit collapse because it preserves semantic distinctness and deterministic replay.
2. Keeps runtime generic: the algorithm changes are structural and do not encode game-specific rules.
3. No compatibility aliasing: old collapsed behavior is removed rather than preserved via fallback.

## What to Change

### 1. Update dedup keys

Include resolved/effective action class in dedup identity for free-operation variant generation.

### 2. Preserve deterministic ordering

Keep stable ordering guarantees while allowing multiple class-distinct variants.

### 3. Add regression coverage

Add tests that prove two variants with identical id/params are preserved when class differs and both are legal.

## Files to Touch

- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/test/unit/legal-moves.test.ts` (modify)
- `packages/engine/test/integration/fitl-option-matrix.test.ts` (modify)

## Out of Scope

- Changing option-matrix policy itself
- Free-operation grant feature redesign
- Schema changes

## Acceptance Criteria

### Tests That Must Pass

1. Dedup no longer removes class-distinct legal variants.
2. Move ordering remains deterministic across repeated enumerations.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Legal move enumeration is deterministic and class-semantics preserving.
2. No game-specific branching appears in dedup logic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/legal-moves.test.ts` — dedup key includes class semantics.
2. `packages/engine/test/integration/fitl-option-matrix.test.ts` — constrained second-eligible scenarios retain both class-distinct options when legal.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`
