# ENG-005: Retire Free-Operation Retrofit After Canonical Builder Parity

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `packages/engine/src/kernel` free-operation discovery architecture cleanup
**Deps**: `/home/joeloverbeck/projects/ludoforge-llm/tickets/README.md`, `/home/joeloverbeck/projects/ludoforge-llm/tickets/ENG-003-remove-split-free-operation-discovery-between-direct-seeding-and-retrofit.md`, `/home/joeloverbeck/projects/ludoforge-llm/tickets/ENG-004-converge-execution-context-and-staged-free-operation-discovery.md`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts`, `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts`

## Problem

Even after canonical-builder parity work is done, the architecture will remain split until `applyPendingFreeOperationVariants()` stops acting as a second free-operation discovery mechanism.

As long as that retrofit exists as move-creation logic:

- legal move explanations remain duplicated
- future fixes risk drift between direct seeding and retrofit
- discovery bugs can be masked instead of corrected at the canonical source

## Assumption Reassessment (2026-03-11)

1. This ticket should not start before `ENG-004` is complete. Current green behavior still depends on retrofit for some flows.
2. Once canonical-builder parity exists, keeping retrofit as move creation would be pure architectural debt.
3. The cleanup belongs entirely in the agnostic kernel. No game-specific behavior should leak into the removal.

## Architecture Check

1. The clean end state is one discovery mechanism: canonical ready-grant candidate creation in `legal-moves.ts`, followed by ordinary turn-flow filtering.
2. `legal-moves-turn-order.ts` should remain responsible only for turn-flow filtering/window rules, not for creating free-operation moves.
3. No backwards-compatibility shim or alias should preserve the old retrofit path once parity is proven.

## What to Change

### 1. Remove Retrofit Move Creation

Reduce `applyPendingFreeOperationVariants()` so it no longer creates or authorizes free-operation moves.

### 2. Tighten Architectural Guards

Update kernel architecture tests so `legal-moves-turn-order.ts` is prevented from:

- probing free-operation applicability for move creation
- probing free-operation authorization for move creation
- probing free-operation decision admission for move creation

### 3. Preserve Cross-Surface Parity

Ensure legality/apply/legal-move surfaces remain aligned after retrofit removal.

## Files to Touch

- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts` (modify)

## Out of Scope

- re-solving execution-context / staged-grant parity work tracked in `ENG-004`
- game-data rewrites
- runner / visual changes

## Acceptance Criteria

1. `applyPendingFreeOperationVariants()` no longer creates free-operation moves.
2. `legal-moves-turn-order.ts` no longer imports or calls free-operation discovery admission helpers for move creation.
3. `legalMoves`, `legalChoicesDiscover`, and `applyMove` remain aligned for free-operation denials and admissions.
4. `packages/engine/test/unit/kernel/legal-moves.test.ts` passes.
5. `packages/engine/test/unit/kernel/legality-surface-parity.test.ts` passes.
6. `pnpm -F @ludoforge/engine test` passes.

## Test Plan

### New/Modified Tests

1. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legal-moves.test.ts` — restore or add architecture guards that prove retrofit no longer creates free-operation moves.
Rationale: the architectural boundary should be enforced directly in source-level tests.
2. `/home/joeloverbeck/projects/ludoforge-llm/packages/engine/test/unit/kernel/legality-surface-parity.test.ts` — keep cross-surface parity green after retrofit removal.
Rationale: once the second discovery path is removed, surface behavior must remain consistent.

### Commands

1. `pnpm run check:ticket-deps`
2. `pnpm -F @ludoforge/engine build`
3. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node /home/joeloverbeck/projects/ludoforge-llm/packages/engine/dist/test/unit/kernel/legality-surface-parity.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm -F @ludoforge/engine lint`
7. `pnpm -F @ludoforge/engine typecheck`
