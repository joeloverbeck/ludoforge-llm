# ENGINEARCH-119: Exhaustive `ILLEGAL_MOVE` Reason-Contract Matrix Coverage

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel type-contract test coverage hardening
**Deps**: archive/tickets/ENGINEARCH-100-illegal-move-context-requiredness-enforcement.md, tickets/ENGINEARCH-117-illegal-move-empty-context-closure.md

## Problem

Current compile-time contract tests for `illegalMoveError` cover only a small subset of reasons. Future reason additions or context-shape drift can bypass tests if they do not affect those sampled cases.

## Assumption Reassessment (2026-02-27)

1. Existing `runtime-error-contracts` tests assert compile-time requiredness for only a few reasons.
2. `IllegalMoveContextByReason` now encodes many reason-specific shapes, but test coverage is not matrix-complete.
3. Mismatch: architecture requires long-term contract stability across all reasons. Corrected scope is exhaustive matrix coverage of required/optional/no-context reason groups.

## Architecture Check

1. Matrix-style contract tests are cleaner and more extensible than sparse sample assertions.
2. This is test-layer hardening of generic kernel contracts and preserves GameDef/runtime game-agnostic boundaries.
3. No backwards-compatibility aliases/shims; tests should enforce the strict canonical contract directly.

## What to Change

### 1. Add exhaustive reason-group contract assertions

Add compile-time assertions covering every `IllegalMoveReason` in grouped form:
- required-context reasons reject missing context
- optional-context reasons accept with/without declared optional fields
- no-context reasons reject payload objects (after ENGINEARCH-117)

### 2. Add drift guard for taxonomy growth

Add an exhaustiveness assertion (for example `never`-based mapping check) so new reasons require explicit test matrix updates.

### 3. Keep runtime assertions focused

Retain existing runtime payload shape checks; avoid duplicating behavior-level tests already covered elsewhere.

## Files to Touch

- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)
- `packages/engine/test/unit/kernel/` (add dedicated type-contract matrix test file if this keeps tests clearer)

## Out of Scope

- Runtime helper behavior changes.
- Illegal-move reason taxonomy changes.
- Compiler/runner changes.

## Acceptance Criteria

### Tests That Must Pass

1. Compile-time test matrix covers every current `IllegalMoveReason` contract group.
2. Adding a new `IllegalMoveReason` fails tests unless the contract matrix is updated.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `ILLEGAL_MOVE` helper contract coverage is exhaustive and drift-resistant.
2. Contract tests remain game-agnostic and free of game-specific fixture coupling.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — extend to grouped exhaustive compile-time contract matrix assertions.
2. `packages/engine/test/unit/kernel/<new-type-contract-matrix>.test.ts` (if added) — isolate reason taxonomy exhaustiveness guard for maintainability.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`