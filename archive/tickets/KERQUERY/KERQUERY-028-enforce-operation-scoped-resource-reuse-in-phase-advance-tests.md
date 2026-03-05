# KERQUERY-028: Enforce operation-scoped resource reuse in phase-advance tests

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test architecture and regression-strengthening for phase-advance resource ownership
**Deps**: archive/tickets/KERQUERY/KERQUERY-017-make-advance-to-decision-point-a-single-runtime-resource-boundary.md, archive/tickets/KERQUERY/KERQUERY-019-centralize-eval-resource-test-fixture-builders.md, packages/engine/test/unit/phase-advance.test.ts

## Problem

`advanceToDecisionPoint` now owns a single operation-scoped resources boundary, but several multi-step `advancePhase` tests still construct fresh `createEvalRuntimeResources()` per phase step. Behavior checks pass, yet test architecture no longer models canonical operation-scoped ownership.

## Assumption Reassessment (2026-03-05)

1. `advanceToDecisionPoint` already enforces one operation-scoped resources object when omitted (locked by existing source-contract tests in `phase-advance.test.ts`).
2. `packages/engine/test/helpers/replay-harness.ts` already allocates one `operationResources` and threads it through bounded phase loops.
3. Multiple multi-step scenarios in `packages/engine/test/unit/phase-advance.test.ts` still pass a fresh resources object per intra-scenario `advancePhase` call.
4. No current ticket explicitly converts those multi-step `phase-advance` unit scenarios to operation-scoped resource reuse.

## Architecture Check

1. Reusing one resources object per multi-step scenario mirrors production ownership boundaries and catches identity regressions earlier.
2. The strongest long-term architecture here is explicit operation-scoped resources in every phase-chain test, with no per-step implicit fixture allocation.
3. This is test-infrastructure hardening only and preserves game-agnostic kernel/runtime boundaries.
4. No backwards-compatibility shims or alias paths: tests should enforce the canonical ownership pattern directly.

## What to Change

### 1. Tighten unit phase-chain tests to use operation-scoped resources

1. In `phase-advance.test.ts`, update multi-step scenarios to allocate one `operationResources` per scenario.
2. Thread `operationResources` through all intra-scenario `advancePhase` calls.
3. Keep behavior assertions unchanged.

### 2. Add explicit regression coverage for operation-scoped reuse

1. Add or strengthen a unit test that exercises multi-step `advancePhase` loops with one shared resources object and asserts expected lifecycle/query-cache behavior remains stable.
2. Prefer shared helper builders only where they materially reduce duplication in this file.

## Files to Touch

- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)

## Out of Scope

- Runtime behavior changes in kernel phase logic
- `advancePhase` API-shape migration (`archive/tickets/KERQUERY/KERQUERY-027-migrate-advancephase-to-single-request-api-and-lock-shape.md`)
- Query runtime cache policy/public-surface tickets (`archive/tickets/KERQUERY/KERQUERY-021-enforce-query-cache-key-literal-ownership-policy.md`, `archive/tickets/KERQUERY/KERQUERY-022-tighten-query-runtime-cache-public-surface-to-domain-accessors.md`)
- Broad integration/e2e sweep of every `advancePhase` call site (can be split into a follow-up ticket if needed)

## Acceptance Criteria

### Tests That Must Pass

1. Multi-step phase-chain unit tests reuse one operation-scoped resources object per scenario.
2. Existing behavior assertions remain unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Test architecture enforces explicit operation-boundary resource ownership.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/phase-advance.test.ts` — convert multi-step phase-chain scenarios to operation-scoped resources reuse.
2. `packages/engine/test/unit/phase-advance.test.ts` — add/strengthen regression coverage for shared-resource behavior across multi-step `advancePhase` loops.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/phase-advance.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`

## Outcome

- **Completion Date**: 2026-03-05
- **What Changed**:
  - Reassessed ticket assumptions/scope first: removed stale assumptions about `replay-harness.ts` and existing `advanceToDecisionPoint` source-contract coverage, and narrowed scope to unit `phase-advance` phase-chain scenarios.
  - Updated multi-step phase-chain unit tests in `phase-advance.test.ts` to allocate one `operationResources` per scenario and thread it through each intra-scenario `advancePhase` call.
  - Strengthened lifecycle/runtime-resource regression coverage by converting the runtime-resource lifecycle test into a two-step advance that reuses one shared `EvalRuntimeResources` object and confirms cache interactions continue across steps.
- **Deviations From Original Plan**:
  - Did not modify `packages/engine/test/helpers/replay-harness.ts`, integration tests, or e2e tests because those assumptions were stale or broader than this ticket's corrected scope.
- **Verification Results**:
  - `pnpm -F @ludoforge/engine build` passed.
  - `node --test packages/engine/dist/test/unit/phase-advance.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (386/386).
  - `pnpm -F @ludoforge/engine lint` passed.
