# EVTLOG-013: Harden endpoint payload validation and unify endpoint error contract

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

Event-log transfer endpoint translation and endpoint display both validate scope identity, but malformed endpoint payloads that are non-objects (for example missing `from`/`to`) can still produce raw JavaScript runtime errors instead of deterministic domain errors. Endpoint invalid-scope error construction is also duplicated across modules.

## Assumption Reassessment (2026-02-26)

1. `formatScopeEndpointDisplay` now enforces strict identity and throws deterministic errors for missing identity and invalid scope.
2. `translateEffectTrace` currently maps transfer endpoints via `toScopeEndpointDisplayInput`, but still assumes endpoint object shape before scope dispatch.
3. **Mismatch + correction**: current behavior is fail-fast for many malformed payloads, but not consistently domain-typed for non-object endpoint payloads. Scope should include explicit endpoint object guards and unified error helpers.

## Architecture Check

1. Centralized endpoint validation is cleaner than scattered checks because all malformed endpoint variants fail through one contract.
2. This remains fully game-agnostic and only concerns runner rendering invariants; no game-specific behavior leaks into `GameDef`/simulation/runtime.
3. No backwards-compatibility fallback aliases or permissive coercion should be introduced.

## What to Change

### 1. Add explicit endpoint payload object guard

In endpoint normalization for transfer logs, validate endpoint values are objects before accessing `scope`. Throw deterministic domain errors for invalid endpoint payload shape.

### 2. Consolidate endpoint invalid-scope error construction

Remove duplicated invalid-scope error logic by using a shared helper (single source of truth) for endpoint-scope failure messaging.

### 3. Keep strict identity enforcement unchanged

Preserve strict `perPlayer -> playerId` and `zone -> zoneId` endpoint identity requirements with no fallback labels.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)

## Out of Scope

- Engine trace schema changes
- UI copy or formatting redesign outside error-invariant messaging

## Acceptance Criteria

### Tests That Must Pass

1. Transfer translation throws deterministic endpoint payload error when `from` or `to` is missing/non-object.
2. Invalid endpoint scope failure message remains deterministic and consistent across call paths.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Endpoint rendering and translation never fail with opaque JS destructuring/type errors for malformed endpoint payloads.
2. Endpoint validation behavior remains game-agnostic and independent from GameSpecDoc/visual config content.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/translate-effect-trace.test.ts` — add malformed non-object endpoint payload assertions to lock deterministic fail-fast behavior.
2. `packages/runner/test/model/model-utils.test.ts` — update/extend invalid-scope error consistency assertions if helper extraction changes surface behavior.

### Commands

1. `pnpm -F @ludoforge/runner test -- translate-effect-trace model-utils`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
