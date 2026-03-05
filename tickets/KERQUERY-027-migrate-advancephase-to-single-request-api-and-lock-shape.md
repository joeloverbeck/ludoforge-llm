# KERQUERY-027: Migrate advancePhase to single-request API and lock shape

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — phase-advance API shape hardening and call-site migration
**Deps**: archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md, tickets/KERQUERY-026-harden-advancephase-runtime-resource-contract-boundary.md, packages/engine/src/kernel/phase-advance.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

`advancePhase` currently uses a positional parameter list (`def`, `state`, `evalRuntimeResources`, optional log/policy/runtime). This is functional but brittle for future evolution: positional optional tails are easier to misuse and harder to validate cleanly than a single request object boundary.

## Assumption Reassessment (2026-03-05)

1. `dispatchTriggers` has already moved to a single request-object API and reduced signature drift risk.
2. `advancePhase` remains positional and now includes a required resources argument plus optional trailing arguments.
3. Existing tests validate behavior but do not lock `advancePhase` request-shape invariants at source level.
4. Active tickets do not currently target `advancePhase` API-shape migration.

## Architecture Check

1. A single request-object API is cleaner and more extensible than positional parameters for lifecycle operations.
2. It enables explicit boundary validation and future additions without ordering hazards.
3. This remains game-agnostic runtime architecture; no game-specific branching or schema coupling is introduced.
4. No backwards-compatibility alias/shim overloads: migrate directly to one canonical API.

## What to Change

### 1. Replace positional signature with a request object

1. Introduce `AdvancePhaseRequest` containing `def`, `state`, `evalRuntimeResources`, and optional `triggerLogCollector`, `policy`, `cachedRuntime`.
2. Change `advancePhase` to accept exactly one request object.
3. Update all runtime and test call sites to use the request object.

### 2. Add API-shape source guard

1. Add a source/lint contract test asserting `advancePhase` has one request parameter.
2. Fail if positional overloads/shims are reintroduced.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/helpers/replay-harness.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/test/unit/lint/phase-advance-api-shape-policy.test.ts` (new)
- `packages/engine/test/integration/**` and `packages/engine/test/e2e/**` call sites (modify as needed)

## Out of Scope

- Trigger-dispatch request hardening (`tickets/KERQUERY-023-harden-dispatchtriggers-request-runtime-contract-validation.md`, `tickets/KERQUERY-025-lock-dispatchtriggers-single-request-api-shape-with-source-guards.md`)
- Query runtime cache API narrowing (`archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md`)
- Any game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. `advancePhase` exposes a single canonical request-object API only.
2. All engine runtime/test call sites compile and pass without positional fallbacks.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Phase-advance API boundary remains explicit, deterministic, and extensible.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/phase-advance-api-shape-policy.test.ts` — enforce single-request API shape.
2. `packages/engine/test/unit/phase-advance.test.ts` — migrate behavioral + source-contract assertions to request-object call style.
3. Affected integration/e2e tests — migrate `advancePhase` call sites without changing behavior assertions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/phase-advance-api-shape-policy.test.js packages/engine/dist/test/unit/phase-advance.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
