# SEATRES-063: Replace function-derived active-seat surface IDs with domain semantics

**Status**: COMPLETED (2026-03-03)
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes — kernel/effect active-seat invariant contract IDs and assertions
**Deps**: archive/tickets/SEATRES/SEATRES-051-replace-function-name-surface-literals-with-stable-semantic-ids.md

## Problem

Active-seat invariant `surface` IDs are namespaced but still function-derived (`...isActiveSeatEligibleForTurnFlow`, `...applyGrantFreeOperation`, etc.). This keeps runtime diagnostics coupled to implementation naming instead of true domain semantics.

## Assumption Reassessment (2026-03-03)

1. Active-seat invariant surface IDs are now centralized in `turn-flow-active-seat-invariant-surfaces.ts`, but values still mirror function names.
2. Emitters already consume registry constants, so renaming IDs can be done centrally without introducing call-site raw string drift.
3. Existing tests assert the current function-derived IDs; scope must include updating expected literals, surface constants used by tests, and message assertions where `surface` appears.
4. The current file list is incomplete for a no-alias migration: if registry keys are renamed to domain semantics, all key consumers in kernel modules and tests must be updated in the same ticket.

## Architecture Check

1. Domain-semantic IDs are cleaner and more robust than function-derived IDs because contract identity survives internal refactors and file/function renames.
2. This remains game-agnostic infrastructure work in kernel/effect contracts; no GameSpecDoc or game-specific runtime branches are introduced.
3. No backwards-compatibility aliasing: replace old IDs directly and update tests to canonical domain-semantic IDs.

## What to Change

### 1. Rename surface ID literals to domain semantics

1. Replace function-derived string values in `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS` with domain-semantic IDs (for example `turnFlow.activeSeat.checkEligibility`, `turnFlow.activeSeat.evaluateGrantMatch`, `turnFlow.activeSeat.resolveCoupSeat`).
2. Rename constant keys to domain-semantic names in the same pass (no compatibility aliases, no dual-key registry).
3. Update all key consumers to the new canonical key names.

### 2. Update runtime/effect contract expectations

1. Update all tests asserting exact `context.surface` values to new semantic IDs.
2. Update message regex assertions that include old function-derived surface text.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-active-seat-invariant-surfaces.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify for renamed surface key references)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify for renamed surface key references)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify for renamed surface key references)
- `packages/engine/src/kernel/phase-advance.ts` (modify for renamed surface key references)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify if exact expected surface text changes)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify)
- `packages/engine/test/unit/effect-error-contracts.test.ts` (modify)
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` (modify for renamed key references)

## Out of Scope

- Error-reason taxonomy redesign (`EffectRuntimeReason`, `KernelRuntimeErrorCode`)
- Seat-resolution algorithm changes
- Any game-specific GameSpecDoc/YAML or visual-config changes

## Acceptance Criteria

### Tests That Must Pass

1. No active-seat invariant `surface` ID contains implementation function names.
2. Kernel/effect active-seat invariant parity remains intact except for new semantic `surface` values.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat `surface` IDs are centralized, deterministic, and implementation-name-agnostic.
2. GameDef/simulator/kernel remain game-agnostic with no game-specific identifier branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — update canonical surface registry expectation and parity fixtures.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — update unresolved-active-seat effect context and message assertions.
3. `packages/engine/test/unit/effect-error-contracts.test.ts` — update typed effect runtime context fixture/assertion to new semantic IDs.
4. `packages/engine/test/unit/kernel/legal-moves.test.ts` — update unresolved-active-seat context surface assertions.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
4. `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
5. `pnpm -F @ludoforge/engine test`
6. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What changed**:
  - Replaced all function-derived active-seat surface IDs with domain-semantic IDs in `TURN_FLOW_ACTIVE_SEAT_INVARIANT_SURFACE_IDS`.
  - Renamed registry keys to domain-semantic names and updated all kernel/test consumers in one pass with no alias layer.
  - Updated runtime/effect contract tests and message assertions to canonical semantic IDs.
  - Added a regression guard test to prevent drift back to function-derived surface fragments.
- **Deviations from original plan**:
  - Scope expanded (as reassessed in this ticket) to include source consumer files because key renames were applied, not value-only swaps.
- **Verification results**:
  - `pnpm turbo build` passed.
  - Targeted tests passed:
    - `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
    - `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
    - `node --test packages/engine/dist/test/unit/effect-error-contracts.test.js`
    - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
    - `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js`
  - `pnpm -F @ludoforge/engine test` passed.
  - `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` passed.
