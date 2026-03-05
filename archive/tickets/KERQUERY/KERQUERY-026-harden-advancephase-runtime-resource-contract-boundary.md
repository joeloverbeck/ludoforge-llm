# KERQUERY-026: Harden advancePhase runtime-resource contract boundary

**Status**: COMPLETED (2026-03-05)
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — phase-advance runtime contract validation and guard coverage
**Deps**: archive/tickets/KERQUERY/KERQUERY-017-make-advance-to-decision-point-a-single-runtime-resource-boundary.md, packages/engine/src/kernel/phase-advance.ts, packages/engine/test/unit/phase-advance.test.ts

## Problem

`advancePhase` now requires `EvalRuntimeResources` at type level and already performs a fail-fast runtime contract assertion. The remaining risk is regression drift: there is no explicit test coverage that locks this boundary behavior for missing/malformed runtime resources, and no source-contract guard that prevents accidental reintroduction of internal default allocation in `advancePhase`.

## Assumption Reassessment (2026-03-05)

1. `advancePhase` signature now requires explicit `evalRuntimeResources`.
2. `advancePhase` currently performs boundary validation via `assertEvalRuntimeResourcesContract(evalRuntimeResources, 'advancePhase evalRuntimeResources')` at function entry.
3. `dispatchLifecycleEvent` still supports an internal fallback default when its own resources input is omitted, so `advancePhase` must enforce explicit ownership before delegating.
4. Active-ticket dependency assumptions from `KERQUERY-018` through `KERQUERY-025` are stale because those items are archived; none currently blocks this hardening work.

## Architecture Check

1. Fail-fast boundary validation in `advancePhase` is cleaner than relying on downstream behavior because operation ownership becomes explicit and deterministic.
2. This is runtime infrastructure only and remains game-agnostic; no game-specific GameDef/GameSpecDoc/visual-config coupling is introduced.
3. No backwards-compatibility aliasing/shims: invalid/missing resources should fail immediately.
4. Because runtime validation already exists in production code, the highest-value change is to harden test contracts so future refactors cannot silently weaken the boundary.

## What to Change

### 1. Add source/runtime regression guards

1. Add source-contract assertions that `advancePhase` does not call `createEvalRuntimeResources()` internally.
2. Add runtime tests that missing/malformed resources fail at `advancePhase` boundary with `RUNTIME_CONTRACT_INVALID`.
3. Keep `advancePhase` production behavior unchanged unless tests expose a real contract gap.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)

Expected touch after reassessment:
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/src/kernel/phase-advance.ts` only if a genuine contract bug is discovered while adding guards.

## Out of Scope

- `dispatchTriggers` contract hardening (`archive/tickets/KERQUERY/KERQUERY-023-harden-dispatchtriggers-request-runtime-contract-validation.md`, `archive/tickets/KERQUERY/KERQUERY-024-strengthen-eval-runtime-resources-contract-guards-in-trigger-dispatch.md`)
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

## Outcome

- Corrected stale assumptions before implementation: `advancePhase` already had runtime boundary validation; active-ticket dependency assumptions were outdated.
- Added hardening tests in `phase-advance.test.ts` for:
  - missing `evalRuntimeResources` at runtime,
  - malformed collector contract,
  - malformed query runtime cache contract,
  - source guard preventing internal `createEvalRuntimeResources()` allocation inside `advancePhase`.
- No production kernel logic changes were required because the boundary behavior already matched the intended architecture.
