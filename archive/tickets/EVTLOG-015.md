# EVTLOG-015: Enforce transfer endpoint `varName` contract with deterministic domain errors

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: EVTLOG-014

## Problem

Transfer endpoint hardening now validates endpoint object shape and scope identity, but transfer message formatting still assumes `from.varName` is always a string. Malformed endpoint payloads where `varName` is missing or non-string can still throw raw JavaScript errors instead of deterministic event-log domain errors.

## Assumption Reassessment (2026-02-26)

1. `translate-effect-trace` currently formats transfer messages with `formatIdAsDisplayName(entry.from.varName)` and no explicit runtime contract check for `varName` type.
2. Current tests cover endpoint scope and identity failures (`scope`, `player`, `zone`) and non-object endpoint payloads, but do not assert `varName` invariant failures.
3. **Mismatch + correction**: endpoint hardening is incomplete; transfer message rendering requires `from.varName` and should fail with deterministic domain errors when endpoint `varName` is missing/non-string.
4. **Scope correction**: `trace-projection` does not consume endpoint `varName`; enforcing this renderer-specific invariant there adds coupling without improving architecture. Keep the contract check in event-log translation/shared model utilities.

## Architecture Check

1. Validating `varName` in the same endpoint contract path is cleaner than allowing downstream formatter type errors.
2. This is runner rendering validation only; no game-specific behavior leaks into `GameDef` or simulator/runtime/kernel.
3. No backwards-compatibility aliases, coercions, or permissive fallback behavior should be introduced.

## What to Change

### 1. Add deterministic endpoint `varName` validation

Extend transfer endpoint payload validation to require `varName` to be a string for both `from` and `to` endpoints before transfer message formatting.

### 2. Reuse shared domain-error helpers

Keep endpoint contract failures routed through shared event-log error helpers so malformed endpoint variants fail consistently.

### 3. Add explicit `varName` invariant tests

Add tests for missing/non-string `from.varName` and `to.varName` payloads to prevent regression to raw runtime errors.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)
- `packages/runner/test/model/model-utils.test.ts` (modify if shared helper behavior is asserted directly)

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
2. `packages/runner/test/model/model-utils.test.ts` - if helper coverage is added, assert deterministic error for missing/non-string endpoint `varName`.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace model-utils`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-26
- What changed:
  - Added deterministic endpoint `varName` contract checks in shared runner model utilities.
  - Updated transfer message translation to validate both endpoint payloads (`from` and `to`) before formatting and to reuse validated endpoint objects for display conversion.
  - Added/updated tests covering missing and non-string `varName` failures in both utility-level and event-log translation paths.
- Deviations from original plan:
  - Removed `trace-projection` changes from scope after reassessment; projection does not consume `varName`, so enforcing renderer formatting invariants there would increase coupling without architectural benefit.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- translate-effect-trace model-utils` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
