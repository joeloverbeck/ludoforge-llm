# ENGINEARCH-119: Exhaustive `ILLEGAL_MOVE` Reason-Contract Matrix Coverage

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel type-contract test coverage hardening
**Deps**: archive/tickets/ENGINEARCH-100-illegal-move-context-requiredness-enforcement.md, archive/tickets/ENGINEARCH-117-illegal-move-empty-context-closure.md

## Problem

Current compile-time contract tests for `illegalMoveError` cover only a small subset of reasons. Future reason additions or context-shape drift can bypass tests if they do not affect those sampled cases.

## Assumption Reassessment (2026-02-28)

1. Existing `runtime-error-contracts` tests already validate representative required-context, no-context, and canonical field typing contracts, but not every current `IllegalMoveReason`.
2. `IllegalMoveContextByReason` and `illegalMoveError` overloads now derive reason groups (`required`, `optional`, `none`) from context shape in `runtime-error.ts`.
3. There is no explicit compile-time drift guard that fails when a newly-added `IllegalMoveReason` is missing from the contract matrix tests.
4. Mismatch: architecture requires long-term contract stability across all reasons. Corrected scope is exhaustive matrix coverage of required/optional/no-context reason groups plus explicit taxonomy drift detection.

## Architecture Check

1. Matrix-style contract tests are cleaner and more extensible than sparse sample assertions.
2. This is test-layer hardening of generic kernel contracts and preserves GameDef/runtime game-agnostic boundaries.
3. No backwards-compatibility aliases/shims; tests should enforce the strict canonical contract directly.

## What to Change

### 1. Add exhaustive reason-group contract assertions

Add compile-time assertions covering every `IllegalMoveReason` in grouped form:
- required-context reasons reject missing context and accept canonical required payloads
- optional-context reasons accept with/without declared optional fields
- no-context reasons reject payload objects (after ENGINEARCH-117) and only accept zero-context invocation

### 2. Add drift guard for taxonomy growth

Add explicit compile-time exhaustiveness checks (`never`-based set-difference guards) so any new reason or group drift fails tests until matrix fixtures are updated.

### 3. Keep runtime assertions focused

Retain existing runtime payload shape checks; avoid duplicating behavior-level tests already covered elsewhere.

## Files to Touch

- `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` (modify)

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

1. `packages/engine/test/unit/kernel/runtime-error-contracts.test.ts` — extend to grouped exhaustive compile-time contract matrix assertions and taxonomy drift guards.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm turbo lint`

## Outcome

1. Updated this ticket's assumptions/scope before implementation:
   - corrected archived dependency path for ENGINEARCH-117
   - recorded current baseline accurately (representative coverage exists, matrix was not exhaustive, no explicit drift guard)
2. Implemented exhaustive reason-group matrix assertions in `runtime-error-contracts.test.ts` for all current `IllegalMoveReason` values:
   - required-context reasons: positive + missing-context rejection checks
   - optional-context reasons: with/without-context acceptance checks
   - no-context reasons: zero-context acceptance + payload rejection checks
3. Added compile-time drift guards using set-difference type assertions so reason taxonomy growth or regrouping fails tests until the matrix is updated.
4. Kept architecture generic and game-agnostic; no engine/runtime behavior changes were needed.
5. Validation completed:
   - `pnpm turbo build`
   - `node --test packages/engine/dist/test/unit/kernel/runtime-error-contracts.test.js`
   - `pnpm -F @ludoforge/engine test`
   - `pnpm turbo lint`
