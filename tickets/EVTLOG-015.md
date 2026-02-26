# EVTLOG-015: Enforce transfer endpoint `varName` contract with deterministic domain errors

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: EVTLOG-014

## Problem

Transfer endpoint hardening now validates endpoint object shape and scope identity, but transfer message formatting still assumes `from.varName` is always a string. Malformed endpoint payloads where `varName` is missing or non-string can still throw raw JavaScript errors instead of deterministic event-log domain errors.

## Assumption Reassessment (2026-02-26)

1. `translate-effect-trace` currently formats transfer messages with `formatIdAsDisplayName(entry.from.varName)` and no explicit runtime contract check for `varName` type.
2. Current tests cover endpoint scope and identity failures (`scope`, `player`, `zone`) and non-object endpoint payloads, but do not assert `varName` invariant failures.
3. **Mismatch + correction**: endpoint hardening is incomplete; endpoint payload contract should include `varName: string` and fail with deterministic domain errors when violated.

## Architecture Check

1. Validating `varName` in the same endpoint contract path is cleaner than allowing downstream formatter type errors.
2. This is runner rendering validation only; no game-specific behavior leaks into `GameDef` or simulator/runtime/kernel.
3. No backwards-compatibility aliases, coercions, or permissive fallback behavior should be introduced.

## What to Change

### 1. Add deterministic endpoint `varName` validation

Extend transfer endpoint payload validation to require `varName` to be a string for both `from` and `to` endpoints before formatting.

### 2. Reuse shared domain-error helpers

Keep endpoint contract failures routed through shared event-log error helpers so malformed endpoint variants fail consistently.

### 3. Add explicit `varName` invariant tests

Add tests for missing/non-string `from.varName` and `to.varName` payloads to prevent regression to raw runtime errors.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/src/model/trace-projection.ts` (modify if shared endpoint contract is enforced there)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)
- `packages/runner/test/model/trace-projection.test.ts` (modify if projection path validates contract)

## Out of Scope

- Engine schema/runtime contract changes
- Visual-copy redesign unrelated to invariant messaging

## Acceptance Criteria

### Tests That Must Pass

1. Translation throws deterministic endpoint payload error when transfer endpoint `varName` is missing or non-string.
2. Existing endpoint scope/identity hardening behavior remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Event-log transfer rendering never throws raw formatter/type errors from malformed endpoint `varName` payloads.
2. Endpoint contract validation remains game-agnostic and independent of `GameSpecDoc`/visual config content.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` - add malformed `varName` endpoint payload assertions for both `from` and `to`.
2. `packages/runner/test/model/trace-projection.test.ts` - if projection consumes normalized endpoint contract, add malformed `varName` assertions to lock deterministic failure path.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace trace-projection`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
