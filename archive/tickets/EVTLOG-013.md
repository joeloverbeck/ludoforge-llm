# EVTLOG-013: Harden endpoint payload validation and unify endpoint error contract

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: None

## Problem

Event-log transfer endpoint translation and endpoint display already reject invalid endpoint scopes and missing endpoint identity, but malformed endpoint payloads that are non-objects (for example missing `from`/`to`, `null`, primitives) can still produce raw JavaScript runtime errors instead of deterministic domain errors. Invalid-scope error construction is also duplicated across modules.

## Assumption Reassessment (2026-02-26)

1. `formatScopeEndpointDisplay` enforces strict endpoint identity and throws deterministic errors for missing `playerId`/`zoneId` and invalid scope.
2. `translateEffectTrace` maps transfer endpoints via `toScopeEndpointDisplayInput`, but currently reads `endpoint.scope` before endpoint shape validation.
3. Existing tests already cover invalid scope and missing endpoint identity in both `model-utils` and `translate-effect-trace` paths.
4. `projectEffectTraceEntry` currently reads transfer endpoint scopes (`entry.from.scope` / `entry.to.scope`) while deriving projection metadata and also assumes endpoint object shape.
5. **Discrepancy corrected**: current remaining gap is deterministic handling for malformed non-object endpoint payloads (for example missing `from`/`to`, `null`, primitive endpoint values), not basic scope/identity handling.

## Architecture Check

1. Centralized endpoint payload guards are cleaner than call-site assumptions because malformed endpoint variants fail through one deterministic contract.
2. Reusing one invalid-scope error helper avoids duplicate error-contract logic and keeps message drift risk low.
3. This remains game-agnostic runner rendering logic with no game-specific behavior.
4. No backward-compatibility aliases or permissive coercion should be introduced.

## What to Change

### 1. Add explicit endpoint payload object guard

In endpoint normalization for transfer logs, validate endpoint values are non-null objects before scope dispatch. Throw deterministic domain errors for invalid endpoint payload shape.

### 2. Consolidate endpoint invalid-scope error construction

Remove duplicated invalid-scope error logic by using a shared helper (single source of truth) for endpoint-scope failure messaging.

### 3. Keep strict identity enforcement unchanged

Preserve strict `perPlayer -> playerId` and `zone -> zoneId` endpoint identity requirements with no fallback labels.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/src/model/trace-projection.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Engine trace schema changes
- UI copy or formatting redesign outside error-invariant messaging

## Acceptance Criteria

### Tests That Must Pass

1. Transfer translation throws deterministic endpoint payload-shape error when `from` or `to` is missing/non-object.
2. Invalid endpoint scope failure message remains deterministic and consistent across call paths.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Endpoint rendering and translation never fail with opaque JS destructuring/type errors for malformed endpoint payloads.
2. Endpoint validation behavior remains game-agnostic and independent from GameSpecDoc/visual config content.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` - add malformed non-object endpoint payload assertions (`from` missing, `to` null/primitive) to lock deterministic fail-fast behavior.
2. `packages/runner/test/model/translate-effect-trace.test.ts` - assert invalid-scope messaging remains stable through transfer translation after helper consolidation.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace model-utils`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`

## Outcome

- Completion date: 2026-02-26
- Implemented:
  - Added shared endpoint payload object guard and shared invalid-scope helper in `model-utils`.
  - Applied payload-shape guards in both transfer endpoint normalization (`translate-effect-trace`) and transfer projection metadata derivation (`trace-projection`) so malformed endpoints fail deterministically before raw property access.
  - Added malformed `from`/`to` endpoint tests in `translate-effect-trace` (`missing from`, `to = null`, `to = primitive`).
- Deviation from original plan:
  - Added `packages/runner/src/model/trace-projection.ts` to scope because raw runtime failures were triggered in projection before translation endpoint formatting.
- Verification:
  - `pnpm -F @ludoforge/runner test -- test/model/translate-effect-trace.test.ts test/model/model-utils.test.ts`
  - `pnpm -F @ludoforge/runner test`
  - `pnpm -F @ludoforge/runner lint`
