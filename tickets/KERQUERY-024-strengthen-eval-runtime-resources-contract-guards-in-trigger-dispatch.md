# KERQUERY-024: Strengthen EvalRuntimeResources contract guards in trigger dispatch

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel runtime-resource contract validation hardening
**Deps**: archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md, packages/engine/src/kernel/trigger-dispatch.ts, packages/engine/src/kernel/eval-context.ts, packages/engine/test/unit/trigger-dispatch.test.ts

## Problem

Current `evalRuntimeResources` validation in trigger dispatch only checks object presence for `collector` and `queryRuntimeCache`. This is shallow and can allow malformed doubles/inputs to pass boundary checks and fail deeper with less actionable errors.

## Assumption Reassessment (2026-03-05)

1. `EvalRuntimeResources` canonical shape is `{ collector, queryRuntimeCache }`.
2. Trigger dispatch currently performs only minimal object-presence checks for this shape.
3. Existing active tickets do not explicitly harden method-level structural validation at this boundary.

## Architecture Check

1. Strengthened boundary validation yields earlier, clearer failures and reduces runtime ambiguity.
2. This remains architecture-policy hardening with no game-specific logic in GameDef/runtime paths.
3. No backwards-compatibility aliases/shims: invalid resource objects should fail immediately.

## What to Change

### 1. Strengthen runtime-resource guard precision

1. Validate minimal callable/surface contract used by trigger dispatch descendants (collector/query cache access expectations).
2. Keep checks minimal and behavior-focused to avoid overfitting implementation details.

### 2. Add malformed-resource regression coverage

1. Add tests where fields exist but are wrong runtime shape.
2. Ensure failures remain `RUNTIME_CONTRACT_INVALID` with actionable messages.

## Files to Touch

- `packages/engine/src/kernel/trigger-dispatch.ts` (modify)
- `packages/engine/test/unit/trigger-dispatch.test.ts` (modify/add)

## Out of Scope

- Query cache public-surface narrowing (`tickets/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md`)
- Context-constructor guard ticket (`tickets/KERQUERY-018-enforce-runtime-resource-constructor-contract-guards.md`)
- Any game-specific GameSpecDoc or visual-config behavior

## Acceptance Criteria

### Tests That Must Pass

1. Structurally malformed `evalRuntimeResources` fail at trigger-dispatch boundary with explicit contract errors.
2. Valid resources continue to execute unchanged behavior.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime resource ownership boundary remains explicit and deterministic.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/trigger-dispatch.test.ts` — extend malformed-resource contract tests beyond field presence.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/trigger-dispatch.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
