# ENGINEARCH-071: Add architecture guard for explicit interpreter mode threading at effect entry boundaries

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel architecture guard tests
**Deps**: ENGINEARCH-065

## Problem

Explicit mode threading is currently enforced mainly through TypeScript contract checks and direct code review. There is no dedicated architecture guard that fails when effect entry boundaries regress to implicit mode behavior (omitting mode or reintroducing fallback semantics).

## Assumption Reassessment (2026-02-26)

1. Kernel effect entry paths now pass explicit `mode` values in current implementation.
2. Existing guard tests cover resolver normalization call patterns, but not an explicit allowlist/contract for mode threading at effect-entry construction points.
3. **Mismatch + correction**: mode-threading invariants should be asserted by dedicated architecture guard tests to prevent silent regressions.

## Architecture Check

1. Explicit guard tests are more robust than relying only on compile-time fallout because they protect architectural intent and boundary semantics.
2. Guard scope is kernel-generic and game-agnostic.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add mode-threading guard test(s)

Create/update kernel architecture guard tests to assert that effect-context construction at known entry boundaries includes explicit mode semantics.

### 2. Guard against fallback reintroduction

Add assertions that helper/fallback patterns such as `ctx.mode ?? 'execution'` are not reintroduced in kernel effect modules where explicit mode is required.

### 3. Keep guard maintainable

Use targeted AST/source checks with clear failure messages that identify violating module and boundary.

## Files to Touch

- `packages/engine/test/unit/kernel/` (add/modify guard test files)
- Optional minimal updates to guard helper utilities in `packages/engine/test/helpers/` if needed

## Out of Scope

- Behavioral changes to mode policies
- New interpreter modes

## Acceptance Criteria

### Tests That Must Pass

1. Guard test fails when an effect entry context omits explicit mode.
2. Guard test fails if implicit execution fallback patterns are reintroduced.
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

### Invariants

1. Interpreter mode is explicit at all protected effect entry boundaries.
2. Architectural anti-drift protection exists beyond type-only enforcement.

## Test Plan

### New/Modified Tests

1. New/updated kernel guard test(s) validating mode threading and fallback prohibition.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/engine lint`
