# KERQUERY-026: Harden advancePhase runtime-resource contract boundary

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — phase-advance runtime contract validation and guard coverage
**Deps**: archive/tickets/KERQUERY/KERQUERY-017-make-advance-to-decision-point-a-single-runtime-resource-boundary.md, packages/engine/src/kernel/phase-advance.ts, packages/engine/test/unit/phase-advance.test.ts

## Problem

`advancePhase` now requires `EvalRuntimeResources` at type level, but there is no fail-fast runtime guard for non-TypeScript/malformed callers. If `undefined` or malformed resources are passed at runtime, downstream lifecycle code can still allocate defaults implicitly, weakening the explicit operation-boundary contract.

## Assumption Reassessment (2026-03-05)

1. `advancePhase` signature now requires explicit `evalRuntimeResources`.
2. `advancePhase` currently does not perform boundary validation that resources are present and structurally valid at runtime.
3. `dispatchLifecycleEvent` still supports an internal fallback default when its own resources input is omitted, so `advancePhase` must enforce explicit ownership before delegating.
4. Active tickets `KERQUERY-018` through `KERQUERY-025` do not lock `advancePhase` runtime boundary validation specifically.

## Architecture Check

1. Fail-fast boundary validation in `advancePhase` is cleaner than relying on downstream behavior because operation ownership becomes explicit and deterministic.
2. This is runtime infrastructure only and remains game-agnostic; no game-specific GameDef/GameSpecDoc/visual-config coupling is introduced.
3. No backwards-compatibility aliasing/shims: invalid/missing resources should fail immediately.

## What to Change

### 1. Add explicit runtime contract validation in `advancePhase`

1. Validate `evalRuntimeResources` presence and minimal required shape at function entry.
2. Throw `RUNTIME_CONTRACT_INVALID` with clear diagnostics when missing/malformed.

### 2. Add source/runtime regression guards

1. Add source-contract assertions that `advancePhase` does not call `createEvalRuntimeResources()` internally.
2. Add runtime tests that malformed/missing resources fail at `advancePhase` boundary.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)

## Out of Scope

- `dispatchTriggers` contract hardening (`tickets/KERQUERY-023-harden-dispatchtriggers-request-runtime-contract-validation.md`, `tickets/KERQUERY-024-strengthen-eval-runtime-resources-contract-guards-in-trigger-dispatch.md`)
- Query runtime cache API/policy work (`archive/tickets/KERQUERY/KERQUERY-021-enforce-query-cache-key-literal-ownership-policy.md`, `archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md`)
- Any game-specific behavior in GameDef/simulator

## Acceptance Criteria

### Tests That Must Pass

1. `advancePhase` fails fast with `RUNTIME_CONTRACT_INVALID` when resources are missing/malformed.
2. `advancePhase` source-contract guard fails if internal default allocation is reintroduced.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Runtime resource ownership is explicit at phase-advance operation boundary.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — add runtime boundary-failure tests and source-contract assertions for no internal default allocation in `advancePhase`.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
