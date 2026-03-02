# SEATRES-048: Centralize card seat-order cardinality policy

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - shared turn-flow seat-order policy contract used by validator and runtime invariant surfaces
**Deps**: archive/tickets/SEATRES/SEATRES-027-enforce-card-seat-order-uniqueness-and-cardinality.md

## Problem

Card metadata seat-order cardinality policy (`>= 2` distinct seats) is currently encoded independently in validation and runtime invariant checks. This creates drift risk where compile-time and runtime behavior can diverge when policy evolves.

## Assumption Reassessment (2026-03-02)

1. Validation currently enforces insufficient distinct seats using an inline threshold check in `validateCardSeatOrderMapping()`.
2. Runtime currently enforces the same threshold separately in `assertCardMetadataSeatOrderRuntimeInvariant()`.
3. Existing active tickets do not currently scope unifying this threshold into one shared policy contract.

## Architecture Check

1. Centralizing policy in a single shared contract is cleaner and more robust than duplicate literal checks.
2. The change remains game-agnostic infrastructure; no game-specific behavior is introduced in GameDef/runtime.
3. No backwards-compatibility aliases are added; policy remains strict and deterministic.

## What to Change

### 1. Define canonical minimum distinct seat-order policy constant

1. Add one exported constant/helper for card seat-order minimum distinct seats.
2. Place it in a shared kernel contract module used by both validator and runtime invariant helpers.

### 2. Replace duplicate literal threshold logic

1. Update validator seat-order diagnostics to reference the shared policy contract.
2. Update runtime invariant checks to reference the same policy contract.
3. Ensure diagnostic/runtime messages continue to be deterministic and reflect the shared threshold.

## Files to Touch

- `packages/engine/src/kernel/seat-resolution.ts` (modify or move helper if policy module is introduced)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)

## Out of Scope

- Typed runtime context redesign for this invariant (tracked separately)
- Boundary-flow regression coverage expansion (tracked separately)
- Game-specific GameSpecDoc/YAML authoring concerns

## Acceptance Criteria

### Tests That Must Pass

1. Validation and runtime paths enforce identical minimum distinct-seat policy from one shared contract source.
2. Changing the shared policy threshold updates both paths consistently without duplicate edits.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card seat-order cardinality policy is declared once and consumed consistently at compile and runtime boundaries.
2. GameDef/runtime remain game-agnostic with no GameSpecDoc or visual-config coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` - assert diagnostics derive from shared policy contract behavior.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` - assert runtime invariant derives from shared policy contract behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`
