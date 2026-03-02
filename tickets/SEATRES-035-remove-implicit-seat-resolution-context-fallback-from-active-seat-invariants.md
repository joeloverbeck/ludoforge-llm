# SEATRES-035: Remove implicit seat-resolution context fallback from active-seat invariants

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — kernel/effect active-seat invariant call contracts
**Deps**: archive/tickets/SEATRES-018-thread-seat-resolution-context-through-turn-flow-operation-scopes.md

## Problem

`requireCardDrivenActiveSeat(...)` currently accepts optional seat-resolution context and silently creates one when omitted. This retains implicit lifecycle behavior at a core invariant boundary and allows regressions away from explicit operation ownership.

## Assumption Reassessment (2026-03-02)

1. `requireCardDrivenActiveSeat(def, state, surface, seatResolution?)` currently has optional context and internal fallback creation.
2. Multiple call sites still omit context (`turn-flow-eligibility`, `legal-moves-turn-order`, and possibly others), so implicit builder behavior remains reachable.
3. Active tickets `SEATRES-030`, `SEATRES-031`, and `SEATRES-032` cover invariant typing/parity contracts, not mandatory lifecycle ownership at call boundaries.

## Architecture Check

1. Mandatory context injection at invariant boundaries is cleaner and more robust than optional fallback creation.
2. This strengthens strict operation ownership and discourages hidden performance regressions.
3. The change is game-agnostic and does not encode game-specific branching; no alias/shim path is introduced.

## What to Change

### 1. Make active-seat invariant context explicit and required

1. Update `requireCardDrivenActiveSeat(...)` signature to require `SeatResolutionContext`.
2. Remove internal fallback creation.
3. Ensure all kernel/effect call sites pass operation-scoped context explicitly.

### 2. Align operation entry points to own context lifecycle

1. For each operation entry boundary (for example legal-moves flow, turn-flow eligibility flow, phase progression flow, effect application path), build context once and thread through helper chain.
2. Keep error surface/message semantics unchanged while tightening call contracts.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify)
- `packages/engine/src/kernel/legal-moves-turn-order.ts` (modify)
- `packages/engine/src/kernel/legal-moves.ts` (modify)
- `packages/engine/src/kernel/apply-move.ts` (modify)
- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify if call chain relies on invariant helper)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/legal-moves.test.ts` (modify/add if API surface assertions exist there)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/test/unit/effects-turn-flow.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` (modify/add)

## Out of Scope

- Changing top-level error code taxonomy (`RUNTIME_CONTRACT_INVALID` vs `EFFECT_RUNTIME`)
- Seat-catalog/compiler/validator tickets
- Runner/UI visual behavior

## Acceptance Criteria

### Tests That Must Pass

1. `requireCardDrivenActiveSeat` cannot be called without explicit prebuilt context.
2. All affected operation flows continue matching existing runtime behavior and diagnostics.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Active-seat invariant evaluation always consumes operation-scoped seat-resolution context.
2. Kernel/runtime remain game-agnostic and alias-free.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/turn-flow-runtime-invariants.test.ts` — enforce explicit context requirement and resolver parity.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` and `packages/engine/test/unit/legal-moves.test.ts` — verify legal-moves paths preserve behavior under mandatory context threading.
3. `packages/engine/test/unit/phase-advance.test.ts` and `packages/engine/test/unit/effects-turn-flow.test.ts` — verify coup/effect active-seat invariant behavior parity after contract tightening.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/turn-flow-runtime-invariants.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
5. `node --test packages/engine/dist/test/unit/effects-turn-flow.test.js`
6. `pnpm -F @ludoforge/engine test`
7. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
