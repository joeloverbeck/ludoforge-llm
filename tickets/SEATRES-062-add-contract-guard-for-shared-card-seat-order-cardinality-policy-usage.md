# SEATRES-062: Add contract guard for shared card seat-order cardinality policy usage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel contract guard test coverage
**Deps**: archive/tickets/SEATRES/SEATRES-027-enforce-card-seat-order-uniqueness-and-cardinality.md, archive/tickets/SEATRES/SEATRES-048-centralize-card-seat-order-cardinality-policy.md

## Problem

Seat-order cardinality is now centralized, but there is no structural guard preventing future reintroduction of duplicate literal threshold logic (`>= 2`, `< 2`) in validator/runtime surfaces.

## Assumption Reassessment (2026-03-03)

1. Cardinality policy currently routes through `turn-flow-seat-order-policy.ts`, consumed by validator/runtime invariant modules.
2. Existing tests validate behavior/messages, but no AST/source-level guard currently enforces that validator/runtime must call the shared policy helper.
3. Existing active tickets do not currently scope this specific single-source policy usage guard.

## Architecture Check

1. A source/AST contract test is cleaner than relying only on behavioral regressions because it prevents architectural drift at the dependency boundary itself.
2. This adds no game-specific behavior and preserves GameDef/runtime agnosticism.
3. No compatibility aliasing is introduced; this is strict contract enforcement.

## What to Change

### 1. Add structural contract test for policy usage

1. Add a unit contract test that inspects `validate-gamedef-extensions.ts` and `turn-flow-runtime-invariants.ts` and asserts they reference `isCardSeatOrderDistinctSeatCountValid` (shared helper) for cardinality checks.
2. Assert these files do not reintroduce direct literal threshold comparisons for card seat-order distinct-seat cardinality.

### 2. Keep deterministic and minimal guard surface

1. Scope checks specifically to card seat-order cardinality surfaces to avoid brittle broad linting.
2. Reuse existing source-guard helpers where possible.

## Files to Touch

- `packages/engine/test/unit/kernel/` (modify/add contract test file)
- `packages/engine/src/kernel/validate-gamedef-extensions.ts` (modify only if needed for deterministic AST shape)
- `packages/engine/src/kernel/turn-flow-runtime-invariants.ts` (modify only if needed for deterministic AST shape)

## Out of Scope

- Structured runtime context payload expansion (`tickets/SEATRES-049-add-structured-runtime-context-for-card-seat-order-shape-invariant.md`)
- Boundary-path and mapping-collapse behavior coverage (`tickets/SEATRES-050-add-boundary-and-mapping-collapse-contract-tests-for-card-seat-order-shape.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Contract test fails if validator/runtime cardinality checks bypass shared policy helper.
2. Contract test passes with current shared-policy architecture.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Card seat-order cardinality threshold remains single-source across compile/runtime surfaces.
2. Kernel architecture remains game-agnostic with no GameSpecDoc/visual-config coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/*card-seat-order-policy*-contract*.test.ts` — source-level guard against cardinality-policy drift.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/*card-seat-order-policy*-contract*.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo typecheck && pnpm turbo lint`
