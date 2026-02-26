# EVTLOG-014: Complete transfer endpoint identity invariant coverage for destination endpoints

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: EVTLOG-013

## Problem

Strict endpoint identity checks were added for transfer endpoints, but test coverage currently emphasizes malformed source (`from`) endpoint identity and does not explicitly lock equivalent destination (`to`) endpoint failure paths.

## Assumption Reassessment (2026-02-26)

1. `translate-effect-trace` now uses strict endpoint identity rendering for resource transfer endpoint display.
2. Existing tests cover invalid endpoint scope and missing `from` endpoint identity for `perPlayer` and `zone`.
3. **Mismatch + correction**: destination endpoint malformed-identity paths are not explicitly asserted and should be covered to prevent asymmetric regressions.

## Architecture Check

1. Symmetric source/destination invariant tests are cleaner and more robust than relying on implicit coverage.
2. This work is test-only and keeps `GameDef`/runtime game-agnostic contracts untouched.
3. No backwards-compatibility fallback behavior is introduced.

## What to Change

### 1. Add destination identity failure tests

Add explicit tests for malformed destination endpoints:
- `to.scope = perPlayer` missing `player`
- `to.scope = zone` missing `zone`

### 2. Preserve valid-path behavior assertions

Retain representative valid transfer endpoint rendering assertions to ensure strictness changes do not regress normal log messaging.

## Files to Touch

- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Additional runtime behavior changes
- Any schema or engine-level contract updates

## Acceptance Criteria

### Tests That Must Pass

1. Translation throws deterministic missing-identity errors for malformed destination `perPlayer` and `zone` endpoints.
2. Existing valid transfer endpoint rendering expectations remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Transfer endpoint identity validation is symmetric for source and destination endpoints.
2. Event-log rendering never fabricates endpoint identity.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — add destination malformed-identity assertions and retain valid-path assertions.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`
