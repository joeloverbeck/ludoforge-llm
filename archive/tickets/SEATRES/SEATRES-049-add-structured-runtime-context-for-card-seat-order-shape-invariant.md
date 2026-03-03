# SEATRES-049: Add structured runtime context for card seat-order shape invariant

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes - runtime error contract typing + invariant payload context for card seat-order shape failures
**Deps**: archive/tickets/SEATRES/SEATRES-027-enforce-card-seat-order-uniqueness-and-cardinality.md

## Problem

The card metadata seat-order shape runtime invariant currently throws `RUNTIME_CONTRACT_INVALID` with message-only details. Lack of structured context weakens deterministic tooling, contract-level assertions, and parity with existing typed runtime invariant payloads.

## Assumption Reassessment (2026-03-03)

1. `assertCardMetadataSeatOrderRuntimeInvariant()` currently includes details only in formatted message text.
2. Runtime error contract types currently include typed context variants for other invariants (for example active-seat unresolvable), but not this seat-order shape invariant.
3. Existing unit coverage already asserts this invariant in `legal-moves.test.ts`, but those assertions are message-regex based (no typed context contract assertions yet).
4. Existing active tickets that reference this area (for example SEATRES-050/061/062) do not implement typed runtime context for this invariant, so this ticket remains the right scope owner.

## Architecture Check

1. Typed invariant context is cleaner and more extensible than regex-based message parsing.
2. This is game-agnostic runtime contract infrastructure; no game-specific data paths or branching are introduced.
3. No compatibility alias layer is introduced; invariant violations remain hard errors with stronger structure.

## What to Change

### 1. Define typed runtime context for card seat-order shape invariant

1. Extend runtime error context union with a dedicated invariant payload type for malformed card seat-order shape.
2. Include deterministic fields such as `invariant`, `cardId`, `metadataKey`, `distinctSeatCount`, and `duplicates`.

### 2. Emit context from runtime invariant helper and align tests

1. Update `assertCardMetadataSeatOrderRuntimeInvariant()` to pass typed context to `kernelRuntimeError`.
2. Strengthen existing legal-moves invariant tests to assert typed context fields directly (not just message regex).
3. Preserve human-readable message clarity while treating context as source of truth.

## Files to Touch

- `packages/engine/src/kernel/runtime-error.ts` (modify)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify/add)
- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify/add if present for contract assertions)

## Out of Scope

- Seat-order policy centralization (tracked separately)
- Additional boundary-flow test coverage expansion (tracked separately)
- Any game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Card seat-order shape runtime invariant emits deterministic typed context payload.
2. Tests assert context fields without relying on brittle message parsing.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime invariant contracts remain strongly typed and machine-verifiable.
2. GameDef/simulation stay game-agnostic and independent of presentation config.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/legal-moves.test.ts` - strengthen existing malformed-card-seat-order invariant tests to assert `RUNTIME_CONTRACT_INVALID` typed context payload fields.
2. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` - add explicit contract coverage for the new invariant payload shape.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint`

## Outcome

- **Completion Date**: 2026-03-03
- **What Changed**:
  - Added a dedicated `RUNTIME_CONTRACT_INVALID` typed context variant for malformed card metadata seat-order shape invariants.
  - Updated `assertCardMetadataSeatOrderRuntimeInvariant()` to emit structured context (`invariant`, `cardId`, `metadataKey`, `minDistinctSeatCount`, `distinctSeatCount`, `duplicates`) while preserving readable invariant messaging.
  - Introduced `turn-flow-invariant-contracts.ts` as the canonical source for turn-flow invariant IDs, context builders, and message renderers, and rewired kernel/effect consumers to use it.
  - Strengthened existing malformed-seat-order legal-moves tests to assert typed context payload fields directly.
  - Added runtime error contract coverage asserting the new invariant payload branch.
- **Deviations from Original Plan**:
  - No new legal-moves test case file/fixture was introduced; existing targeted tests were strengthened in place because they already covered the two malformed-shape runtime paths.
- **Verification Results**:
  - `pnpm turbo build` ✅
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` ✅
  - `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm turbo test && pnpm turbo typecheck && pnpm turbo lint` ✅
