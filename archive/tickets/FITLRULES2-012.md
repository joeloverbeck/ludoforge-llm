# FITLRULES2-012: Make Legal-Move Deduplication Action-Class Aware

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — legal move variant generation/dedup
**Deps**: `specs/00-fitl-implementation-order.md`

## Problem

Move deduplication keys currently ignore `actionClass` even though class now affects turn-flow legality and free-operation grant matching. Distinct legal variants can collapse into one move entry.

## Assumption Reassessment (2026-02-23)

1. `applyPendingFreeOperationVariants` currently dedups by `actionId + params + freeOperation` only; `actionClass` is omitted.
2. Free-operation grant applicability is explicitly class-sensitive via `grant.operationClass === moveOperationClass(def, move)`.
3. Therefore dedup identity is currently weaker than grant legality identity and can collapse class-distinct legal free-operation variants.
4. Existing architecture already resolves class via `resolveTurnFlowActionClass`; fix should reuse that model rather than introducing ticket-local class inference.

## Architecture Check

1. Class-aware dedup is cleaner than implicit collapse because it preserves semantic distinctness and deterministic replay.
2. Keeps runtime generic: the algorithm changes are structural and do not encode game-specific rules.
3. No compatibility aliasing: old collapsed behavior is removed rather than preserved via fallback.

## What to Change

### 1. Update dedup keys

Include effective move class in dedup identity for free-operation variant generation so `operation` and `limitedOperation` variants do not collide.

### 2. Preserve deterministic ordering

Keep stable ordering guarantees while allowing multiple class-distinct variants.

### 3. Add regression coverage

Add tests that prove two variants with identical id/params are preserved when class differs and both are legal.

## Files to Touch

- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (review only; no functional change expected)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` (modify)
- `packages/engine/test/unit/legal-moves.test.ts` (review only; modify only if shared helper coverage is needed)

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

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` — free-op variant dedup key includes class semantics.
2. `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` — same action id/params with class-distinct grant legality remains enumerable and deterministic.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-02-23
- Actually changed:
  - Updated free-operation dedup identity in `packages/engine/src/kernel/legal-moves-turn-order.ts` to include effective action class via `resolveTurnFlowActionClass`.
  - Introduced shared move identity helper in `packages/engine/src/kernel/move-identity.ts` and wired free-operation dedup to it for centralized move-key semantics.
  - Added unit regression in `packages/engine/test/unit/kernel/legal-moves.test.ts` validating that two free-operation variants with identical action id/params are both preserved when classes differ.
  - Added unit coverage for centralized identity semantics in `packages/engine/test/unit/kernel/move-identity.test.ts`.
  - Added integration regression in `packages/engine/test/integration/fitl-event-free-operation-grants.test.ts` validating class-distinct free-operation enumeration and deterministic ordering in card-flow context.
- Deviations from original plan:
  - `packages/engine/src/kernel/legal-moves.ts` did not require a functional change; it remained review-only.
  - Integration coverage landed in free-operation grant integration tests rather than option-matrix integration tests, because this bug manifests at free-operation variant generation/dedup.
- Verification:
  - `pnpm -F @ludoforge/engine test` passed (253/253).
  - `pnpm -F @ludoforge/engine lint` passed.
