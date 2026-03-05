# KERQUERY-027: Migrate advancePhase to single-request API and lock shape

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — phase-advance API shape hardening and call-site migration
**Deps**: archive/tickets/KERQUERY/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md, tickets/KERQUERY-026-harden-advancephase-runtime-resource-contract-boundary.md, packages/engine/src/kernel/phase-advance.ts, packages/engine/src/kernel/effects-turn-flow.ts

## Problem

`advancePhase` currently uses a positional parameter list (`def`, `state`, `evalRuntimeResources`, optional log/policy/runtime). This is functional but brittle for future evolution: positional optional tails are easier to misuse and harder to validate cleanly than a single request object boundary.

## Assumption Reassessment (2026-03-05)

1. `dispatchTriggers` has already moved to a single request-object API and reduced signature drift risk.
2. `advancePhase` remains positional and now includes a required resources argument plus optional trailing arguments.
3. Existing tests already include AST/source guards for `advancePhase` runtime-resource and operation-scope invariants (`packages/engine/test/unit/phase-advance.test.ts`), but there is still no dedicated API-shape policy guard that enforces a single request-object parameter.
4. `tickets/KERQUERY-028-enforce-operation-scoped-resource-reuse-in-phase-advance-tests.md` is active and adjacent: it assumes this migration lands first, but does not implement API-shape migration itself.

## Architecture Check

1. A single request-object API is cleaner and more extensible than positional parameters for lifecycle operations.
2. It enables explicit boundary validation and future additions without ordering hazards.
3. This remains game-agnostic runtime architecture; no game-specific branching or schema coupling is introduced.
4. The change aligns `advancePhase` with existing kernel API direction (`dispatchTriggers`) and removes optional-tail ambiguity that can silently swap `triggerLogCollector`/`policy`/`cachedRuntime`.
5. No backwards-compatibility alias/shim overloads: migrate directly to one canonical API.

## What to Change

### 1. Replace positional signature with a request object

1. Introduce `AdvancePhaseRequest` containing `def`, `state`, `evalRuntimeResources`, and optional `triggerLogCollector`, `policy`, `cachedRuntime`.
2. Change `advancePhase` to accept exactly one request object.
3. Update all runtime and test call sites to use the request object.

### 2. Add API-shape source guard

1. Add a source/lint contract test asserting `advancePhase` has one request parameter typed as `AdvancePhaseRequest`.
2. Fail if positional overloads/shims are reintroduced.
3. Keep existing `phase-advance.test.ts` AST guards focused on runtime-resource/operation-scope invariants; avoid duplicating those assertions in the lint policy file.

## Files to Touch

- `packages/engine/src/kernel/phase-advance.ts` (modify)
- `packages/engine/src/kernel/effects-turn-flow.ts` (modify)
- `packages/engine/test/helpers/replay-harness.ts` (modify)
- `packages/engine/test/unit/phase-advance.test.ts` (modify/add)
- `packages/engine/test/unit/lint/phase-advance-api-shape-policy.test.ts` (new)
- direct `advancePhase(` call sites in `packages/engine/test/integration/**` and `packages/engine/test/e2e/**` (modify as needed)

## Out of Scope

- Trigger-dispatch request hardening (`archive/tickets/KERQUERY/KERQUERY-023-harden-dispatchtriggers-request-runtime-contract-validation.md`, `tickets/KERQUERY-025-lock-dispatchtriggers-single-request-api-shape-with-source-guards.md`)
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

## Outcome

- **Completion date**: 2026-03-05
- **What actually changed**:
  - Migrated `advancePhase` to a single canonical request-object API via `AdvancePhaseRequest` in `packages/engine/src/kernel/phase-advance.ts`.
  - Migrated kernel/runtime and test call sites to request-object invocation (including `effects-turn-flow`, replay harness, unit, integration, and e2e coverage).
  - Added `packages/engine/test/unit/lint/phase-advance-api-shape-policy.test.ts` to prevent overload/positional API drift and enforce `advancePhase(request: AdvancePhaseRequest)`.
  - Updated AST source-contract assertions in `packages/engine/test/unit/phase-advance.test.ts` so operation-scoped resource threading checks validate request-property wiring instead of positional index arguments.
- **Deviations from original plan**:
  - Kept existing runtime-resource/seat-resolution source guards in `phase-advance.test.ts` and added the new API-shape lock as a dedicated lint policy file (no duplication of existing guard scope).
- **Verification results**:
  - `pnpm -F @ludoforge/engine build` ✅
  - `node --test packages/engine/dist/test/unit/lint/phase-advance-api-shape-policy.test.js packages/engine/dist/test/unit/phase-advance.test.js` ✅
  - `pnpm -F @ludoforge/engine test` ✅
  - `pnpm -F @ludoforge/engine lint` ✅
