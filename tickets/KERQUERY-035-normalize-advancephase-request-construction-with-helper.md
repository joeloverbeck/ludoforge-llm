# KERQUERY-035: Normalize advancePhase request construction with helper

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel request-construction ergonomics and call-site consistency
**Deps**: archive/tickets/KERQUERY/KERQUERY-027-migrate-advancephase-to-single-request-api-and-lock-shape.md, archive/tickets/KERQUERY/KERQUERY-028-enforce-operation-scoped-resource-reuse-in-phase-advance-tests.md, packages/engine/src/kernel/phase-advance.ts, packages/engine/src/kernel/effects-turn-flow.ts, packages/engine/test/helpers/replay-harness.ts

## Problem

`advancePhase` now correctly uses `AdvancePhaseRequest`, but several call sites construct optional fields with repeated conditional spread patterns. This is correct but noisy, increases local shape variance, and makes future request-surface changes harder to propagate consistently.

## Assumption Reassessment (2026-03-05)

1. `advancePhase` has a single canonical request-object API with required `evalRuntimeResources` and optional `triggerLogCollector`/`policy`/`cachedRuntime`.
2. Current call sites in kernel/test helpers repeat optional-field filtering via object spread ternaries to satisfy `exactOptionalPropertyTypes`.
3. Existing active tickets do not currently target normalization of request-object construction ergonomics for `advancePhase`.

## Architecture Check

1. Centralizing request construction in one helper is cleaner than ad hoc object-shape assembly at each caller and reduces surface drift risk.
2. This is API ergonomics/refactor work only; it does not introduce game-specific behavior and preserves `GameDef`/runtime/simulator agnosticism.
3. No backwards-compatibility aliasing/shims: `advancePhase` remains a single canonical request-object entrypoint.

## What to Change

### 1. Add a canonical request-construction helper

1. Introduce a small helper that builds `AdvancePhaseRequest` and omits undefined optional fields in one place.
2. Keep helper scope kernel-local and typed explicitly to `AdvancePhaseRequest`.

### 2. Migrate call sites to helper usage

1. Replace repeated conditional spread patterns in kernel/harness call sites with helper usage.
2. Keep behavior identical and avoid expanding `advancePhase` public API.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/helpers/replay-harness.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify only if source guard assertions require updates)

## Out of Scope

- New lifecycle semantics or turn-flow behavior changes
- Additional runtime-resource policy work already scoped in `tickets/KERQUERY-032-add-negative-runtime-resource-contract-tests-across-kernel-boundaries.md` and `tickets/KERQUERY-033-enforce-eval-runtime-resource-boundary-guard-policy.md`
- Query-runtime-cache ownership and key-policy tickets (`archive/tickets/KERQUERY/KERQUERY-029-derive-query-cache-key-literal-policy-from-canonical-owner.md`, `archive/tickets/KERQUERY/KERQUERY-030-harden-query-runtime-cache-ownership-policy-with-ast-signature-checks.md`, `archive/tickets/KERQUERY/KERQUERY-031-enforce-query-runtime-cache-index-immutability-at-write-boundary.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Kernel/harness call sites no longer assemble `AdvancePhaseRequest` via repeated conditional spread ternaries.
2. `advancePhase` behavior remains unchanged across existing lifecycle and turn-flow tests.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. `advancePhase` stays single-request and deterministic at the API boundary.
2. Runtime/kernel/simulation architecture remains game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — adjust source-contract assertions only if helper extraction changes AST expectations.
2. `packages/engine/test/unit/effects-turn-flow.test.ts` — ensure phase-advance effect path behavior stays identical after helper-based request construction.
3. `packages/engine/test/unit/replay-harness.test.ts` — confirm bounded phase-advance helper still preserves semantics while using normalized request construction.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js packages/engine/dist/test/unit/effects-turn-flow.test.js packages/engine/dist/test/unit/replay-harness.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
