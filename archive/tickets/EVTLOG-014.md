# EVTLOG-014: Complete destination endpoint invariant coverage for resource transfer logs

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: EVTLOG-013

## Problem

Resource-transfer endpoint rendering is strict, but coverage is asymmetric. Source (`from`) malformed identity and invalid scope paths are covered, while equivalent destination (`to`) malformed identity and invalid scope paths are not explicitly locked.

## Assumption Reassessment (2026-02-26)

1. `translate-effect-trace` uses strict endpoint validation through shared model utils (`asScopeEndpointPayloadObject`, `formatScopeEndpointDisplay`).
2. Existing tests already cover:
   - non-object `to` endpoint payload (`to must be an object`)
   - missing `from` endpoint identity for `perPlayer` and `zone`
   - invalid endpoint scope via malformed `from.scope`
3. **Mismatch + correction**: tests do not explicitly cover destination (`to`) missing identity (`perPlayer` without `player`, `zone` without `zone`) or destination invalid scope.

## Architecture Check

1. Symmetric source/destination invariant coverage is architecturally better than relying on indirect failure paths.
2. This remains test-only and preserves the existing generic, game-agnostic runtime contracts.
3. No aliasing, fallback coercion, or backwards-compatibility behavior is introduced.

## What to Change

### 1. Add destination failure-path tests

Add explicit tests for malformed destination endpoints:
- `to.scope = perPlayer` missing `player`
- `to.scope = zone` missing `zone`
- `to.scope` invalid value (deterministic invalid-scope error)

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
2. Translation throws deterministic invalid-scope errors for malformed destination scope values.
3. Existing valid transfer endpoint rendering expectations remain unchanged.
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Transfer endpoint validation is symmetric for source and destination endpoints.
2. Event-log rendering never fabricates endpoint identity and never coerces unknown scopes.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — add destination malformed-identity and invalid-scope assertions; retain valid-path assertions.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
4. `pnpm -F @ludoforge/runner typecheck`

## Outcome

- **Completion date**: 2026-02-26
- **What changed**:
  - Added destination endpoint invariant tests in `packages/runner/test/model/translate-effect-trace.test.ts` for:
    - missing `to.player` when `to.scope = perPlayer`
    - missing `to.zone` when `to.scope = zone`
    - invalid `to.scope`
  - Kept and validated existing valid-path transfer rendering assertions.
  - Applied a small runner type-safety fix to preserve full check health without behavior change:
    - `packages/runner/src/model/translate-effect-trace.ts` endpoint formatter now forwards the discriminated union input directly.
    - `packages/runner/src/model/model-utils.ts` default runtime fallback now preserves deterministic `Invalid endpoint scope for event-log rendering` behavior.
- **Deviations from original plan**:
  - Planned scope was test-only; a minimal non-behavioral typing correction in runner model code was required to pass `pnpm -F @ludoforge/runner typecheck`.
- **Verification**:
  - `pnpm -F @ludoforge/runner exec vitest run test/model/model-utils.test.ts test/model/translate-effect-trace.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
  - `pnpm -F @ludoforge/runner typecheck`
