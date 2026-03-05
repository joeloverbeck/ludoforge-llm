# KERQUERY-025: Lock dispatchTriggers single-request API shape with source guards

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — API-shape regression guard for kernel trigger dispatch
**Deps**: archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md, packages/engine/src/kernel/trigger-dispatch.ts, packages/engine/test/helpers/kernel-source-guard.ts

## Problem

`dispatchTriggers` was migrated to a single request-object API, but there is no source-contract test preventing future reintroduction of positional/overloaded signatures. Without a guard, architectural drift can quietly return.

## Assumption Reassessment (2026-03-05)

1. Current implementation exposes `dispatchTriggers(request)` as the canonical boundary.
2. Existing tests validate behavior and callability but do not assert function-parameter shape at source level.
3. Active tickets do not currently lock this API-shape invariant.

## Architecture Check

1. Source-level API-shape guards are cleaner than relying on convention and prevent signature drift during refactors.
2. This is contract-policy infrastructure only and preserves game-agnostic runtime architecture.
3. No backwards-compatibility aliases/shims: guard enforces one canonical request-object entrypoint.

## What to Change

### 1. Add dispatchTriggers API-shape source guard

1. Add a lint/source-contract test asserting `dispatchTriggers` uses a single request parameter.
2. Fail on reintroduced positional signatures or overload shims.

### 2. Keep diagnostics actionable

1. Report the expected API shape in failure output.
2. Include remediation guidance in assertion message.

## Files to Touch

- `packages/engine/test/unit/lint/dispatch-triggers-api-shape-policy.test.ts` (new)
- `packages/engine/test/helpers/kernel-source-guard.ts` (modify if helper extensions are needed)

## Out of Scope

- Trigger dispatch behavior changes beyond API-shape guard
- Query cache ownership/public-surface tickets (`tickets/KERQUERY-021-enforce-query-cache-key-literal-ownership-policy.md`, `tickets/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md`)
- Any game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Guard fails if `dispatchTriggers` stops being single-parameter request-object API.
2. Existing behavior tests remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Trigger-dispatch entrypoint remains explicit and non-ambiguous.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/dispatch-triggers-api-shape-policy.test.ts` — lock request-object API shape.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/lint/dispatch-triggers-api-shape-policy.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
