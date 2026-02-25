# ENGINEARCH-026: Tighten Selector-Cardinality Builder Return Types to Exact Branch Contracts

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — eval-error typing contract hardening + type tests
**Deps**: ENGINEARCH-021

## Problem

Player selector-cardinality builder helpers currently return the broader union type `SelectorCardinalityPlayerEvalErrorContext` instead of exact branch-specific types. This permits unnecessary type widening and weakens compile-time precision at call boundaries.

## Assumption Reassessment (2026-02-25)

1. In `packages/engine/src/kernel/eval-error.ts`, `selectorCardinalityPlayerCountContext` and `selectorCardinalityPlayerResolvedContext` each return `SelectorCardinalityPlayerEvalErrorContext`.
2. Their implementations are branch-specific, so broader return typing is not required for correctness.
3. Existing tests validate context shape behavior and selector payload constraints but do not explicitly lock exact helper return-type precision.
4. `SelectorCardinalityZoneEvalErrorContext` is already exported; only the player count/resolved branch contracts still need export promotion.

## Architecture Check

1. Exact return-type contracts are cleaner and more robust than broader unions because they preserve branch invariants at construction sites.
2. This is purely kernel type-system hardening and does not introduce game-specific branches into agnostic layers.
3. No backwards-compatibility aliases/shims are introduced; stricter typing intentionally fails invalid usage.

## What to Change

### 1. Export explicit branch-specific selector-cardinality context types

Promote precise branch types needed for helper signatures and tests (player-count branch and player-resolved branch) to explicit exported contracts. Keep zone-resolved export as-is.

### 2. Narrow helper return signatures to exact branch types

Update helper return types so each helper returns its exact branch subtype rather than a wider union.

### 3. Add compile-time regression tests for widened-assignment leaks

Add type-level tests that fail when helper outputs are widened in ways that reintroduce mixed-branch payload ambiguity.

## Files to Touch

- `packages/engine/src/kernel/eval-error.ts` (modify)
- `packages/engine/test/unit/types-foundation.test.ts` (modify)

## Out of Scope

- Resolver/runtime behavior changes
- Defer-taxonomy map policy changes
- GameSpecDoc or visual-config schema changes

## Acceptance Criteria

### Tests That Must Pass

1. Helper signatures expose exact branch return contracts for selector-cardinality context construction.
2. Type-level tests fail on widened/mixed branch payload leakage from helper outputs.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`

### Invariants

1. Selector-cardinality contracts remain discriminated and branch-safe.
2. `GameDef`/simulation remain game-agnostic with no game-specific data leakage.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/types-foundation.test.ts` — add compile-time assertions for exact helper return typing and anti-widening guarantees.

### Commands

1. `pnpm -F @ludoforge/engine typecheck`
2. `pnpm -F @ludoforge/engine build`
3. `node --test packages/engine/dist/test/unit/types-foundation.test.js`
4. `pnpm -F @ludoforge/engine test:unit`

## Outcome

- **Completion date**: 2026-02-25
- **What changed**:
  - Exported explicit player selector-cardinality branch contracts:
    - `SelectorCardinalityPlayerCountEvalErrorContext`
    - `SelectorCardinalityPlayerResolvedEvalErrorContext`
  - Narrowed helper signatures to exact branch return types:
    - `selectorCardinalityPlayerCountContext` now returns `SelectorCardinalityPlayerCountEvalErrorContext`
    - `selectorCardinalityPlayerResolvedContext` now returns `SelectorCardinalityPlayerResolvedEvalErrorContext`
  - Added compile-time regression assertions in `types-foundation.test.ts` to prevent branch-widening and cross-branch assignment leaks.
  - Updated assumption/scope notes to reflect that `SelectorCardinalityZoneEvalErrorContext` was already exported.
- **Deviation from original plan**:
  - Zone-resolved branch export promotion was removed from scope because it was already implemented before this ticket.
- **Verification results**:
  - `pnpm -F @ludoforge/engine typecheck` passed.
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/types-foundation.test.js` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
