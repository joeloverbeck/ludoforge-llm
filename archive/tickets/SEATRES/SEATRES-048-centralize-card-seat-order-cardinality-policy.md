# SEATRES-048: Centralize card seat-order cardinality policy

**Status**: COMPLETED (2026-03-03)
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - shared turn-flow seat-order policy contract used by validator and runtime invariant surfaces
**Deps**: archive/tickets/SEATRES/SEATRES-027-enforce-card-seat-order-uniqueness-and-cardinality.md

## Problem

Card metadata seat-order cardinality policy (`>= 2` distinct seats) is currently encoded independently in validation and runtime invariant checks. This creates drift risk where compile-time and runtime behavior can diverge when policy evolves.

## Assumption Reassessment (2026-03-03)

1. Validation enforces insufficient distinct seats inline in `validateCardSeatOrderMapping()` (`validate-gamedef-extensions.ts`) with `shape.distinctSeatCount < 2`.
2. Runtime enforces the same threshold separately in `assertCardMetadataSeatOrderRuntimeInvariant()` (`turn-flow-runtime-invariants.ts`) with `shape.distinctSeatCount >= 2`.
3. Runtime cardinality enforcement is reached through `initializeTurnFlowEligibilityState()` (`turn-flow-eligibility.ts`) via `resolveCardSeatOrder() -> assertCardMetadataSeatOrderRuntimeInvariant()`. `legal-moves` tests cover this path indirectly.
4. No existing shared policy constant/helper currently defines this threshold in kernel contracts.

## Reassessed Architecture Decision

1. Centralizing this threshold in one contract is more robust than duplicate literals because policy changes become single-source and compile/runtime behavior cannot silently drift.
2. The cleanest placement is a dedicated shared kernel contract module for turn-flow card seat-order policy, rather than mixing policy literals into seat-resolution utilities.
3. This keeps engine behavior game-agnostic and avoids compatibility aliasing: one strict policy, reused everywhere.

## What to Change

### 1. Define canonical minimum distinct seat-order policy contract

1. Add one exported constant/helper for minimum distinct seats for card metadata seat-order.
2. Place it in a shared kernel contract module consumed by both validator and runtime invariant logic.

### 2. Replace duplicate literal threshold logic

1. Update validator seat-order diagnostics to use the shared policy contract.
2. Update runtime invariant checks to use the same policy contract.
3. Keep diagnostic/runtime messages deterministic and sourced from the shared threshold value.

### 3. Strengthen tests around shared policy usage

1. Update validation tests to assert failure behavior/messages derive from the shared policy contract.
2. Update runtime-path tests (legal-moves initialization path) to assert invariant messaging aligns with the shared policy contract.

## Files to Touch

- `packages/engine/src/kernel/turn-flow-seat-order-policy.ts` (add)
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

1. `packages/engine/test/unit/validate-gamedef.test.ts` - assert diagnostics reflect shared policy threshold contract.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` - assert runtime invariant messaging reflects shared policy threshold contract through eligibility initialization path.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/validate-gamedef.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test --force && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

1. Added `packages/engine/src/kernel/turn-flow-seat-order-policy.ts` with a single shared policy contract (`CARD_SEAT_ORDER_MIN_DISTINCT_SEATS`) and validator/runtime helper.
2. Replaced duplicate literal threshold checks in validator and runtime invariant surfaces with the shared policy helper and threshold-backed messaging.
3. Strengthened unit coverage in:
   - `validate-gamedef.test.ts` to assert diagnostics/suggestions use the shared threshold value.
   - `kernel/legal-moves.test.ts` to assert runtime invariant messaging includes the shared minimum threshold through eligibility initialization flow.
4. Also exported the new contract from `packages/engine/src/kernel/index.ts` so policy usage remains explicit and reusable.
5. Verification:
   - `pnpm turbo build`, focused unit tests, `pnpm -F @ludoforge/engine test`, `pnpm turbo test --force`, `pnpm turbo typecheck --force`, and `pnpm turbo lint` passed.
