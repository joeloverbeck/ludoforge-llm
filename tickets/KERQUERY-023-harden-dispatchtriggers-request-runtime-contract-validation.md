# KERQUERY-023: Harden dispatchTriggers request runtime contract validation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — kernel trigger dispatch runtime contract boundary
**Deps**: archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md, packages/engine/src/kernel/trigger-dispatch.ts, packages/engine/test/unit/trigger-dispatch.test.ts

## Problem

`dispatchTriggers` now uses a canonical request object, but runtime guards currently validate only a subset of fields. Non-TypeScript or malformed JS callers can still fail deeper in execution with opaque errors before hitting clear contract diagnostics.

## Assumption Reassessment (2026-03-05)

1. `dispatchTriggers` was migrated to a single request-object API in KERQUERY-015.
2. Runtime checks currently cover `effectPathRoot` and `evalRuntimeResources`, but not required core request fields (`def`, `state`, `rng`, `event`, `depth`, `maxDepth`, `triggerLog`).
3. Existing tests cover malformed optional fields but do not lock fail-fast behavior for missing/invalid required request fields.

## Architecture Check

1. Validating required request fields at boundary entry is cleaner and more robust than allowing downstream failures in internal helpers.
2. This is runtime contract hardening only and keeps GameDef/simulator/kernel game-agnostic with no game-specific branches.
3. No backwards-compatibility aliases/shims: enforce canonical request contract directly.

## What to Change

### 1. Add strict required-field request validation

1. Validate request object presence and required field types before using the request.
2. Validate `depth` and `maxDepth` as safe integers and `triggerLog` as array.
3. Validate `event.type` is a string and fail with `RUNTIME_CONTRACT_INVALID` on violations.

### 2. Expand request-contract regression tests

1. Add tests for missing/invalid required request fields.
2. Assert diagnostics are explicit and mention the failing field.

## Files to Touch

- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/test/unit/trigger-dispatch.test.ts` (modify/add)

## Out of Scope

- Query runtime cache API redesign (`archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md`)
- Ticket tooling integrity work (`archive/tickets/KERQUERY/KERQUERY-016-enforce-active-ticket-reference-integrity-after-archival.md`, `archive/tickets/KERQUERY/KERQUERY-020-enforce-archived-outcome-fact-integrity.md`)
- Any game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Invalid required request fields fail fast with `RUNTIME_CONTRACT_INVALID` and clear diagnostics.
2. Valid request flows remain behaviorally unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Trigger dispatch request boundary is deterministic and explicit for TS and non-TS callers.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/trigger-dispatch.test.ts` — add required-field contract-failure coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
