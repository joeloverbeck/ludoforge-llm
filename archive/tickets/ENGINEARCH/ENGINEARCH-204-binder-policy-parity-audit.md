# ENGINEARCH-204: Enforce Validator Policy Parity with Declared Binder Contract

**Status**: COMPLETED (2026-03-04)
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — validator contract auditing tests
**Deps**: packages/engine/src/contracts/binder-surface-contract.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/test/unit/validate-gamedef.test.ts, archive/tickets/ENGINEARCH-201-global-canonical-binding-identifiers.md

## Problem

Declared binder surfaces are centralized in shared contracts, but validator canonical-binding policy is maintained in a separate mapping table. The table is currently correct, but there is no deterministic test guard that prevents future drift when binder declarations change.

## Assumption Reassessment (2026-03-04)

1. `collectDeclaredBinderCandidatesFromEffectNode` derives declared binder candidates from `EFFECT_BINDER_SURFACE_CONTRACT` in `src/contracts`.
2. `validate-gamedef-behavior` enforces canonical declared binders via `EFFECT_DECLARED_BINDER_POLICY_BY_PATTERN`, which is manually curated.
3. Current parity is complete (17 declared effect-binder patterns and 17 validator policy entries), but there is no explicit parity audit test.
4. Scope remains to add a deterministic parity guard so future contract changes cannot drift silently.

## Architecture Check

1. A parity audit test is a net architectural improvement versus the current state because it makes cross-module contract coupling explicit and enforceable in CI.
2. This remains game-agnostic (pure contract consistency); no game-specific behavior is added to `GameDef` validation or simulation.
3. No backward-compatibility aliases/shims are introduced; this hardens strict canonical contract enforcement.
4. Ideal future architecture (out of scope): co-locate canonical-binding diagnostic metadata with binder-surface contract declarations so policy and declaration become a single source of truth.

## What to Change

### 1. Expose/derive validator policy keys for testing

Add a testable export or helper that provides canonical validator policy pattern keys for declared effect binders.

### 2. Add parity audit test

Add a unit test that computes declared binder patterns from `EFFECT_BINDER_SURFACE_CONTRACT` and fails if any declared pattern lacks validator policy coverage.

### 3. Keep diagnostics deterministic

Retain existing diagnostic codes/messages while adding only parity auditing coverage.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Changing binder declaration contract semantics.
- Changing runtime/simulator behavior.
- Introducing game-specific validation branches.

## Acceptance Criteria

### Tests That Must Pass

1. A parity audit test fails when any declared binder pattern has no validator policy mapping.
2. Existing canonical-binding diagnostics remain unchanged and path-precise.
3. Existing suite: `pnpm turbo test`.

### Invariants

1. Every declared effect binder contract pattern has an explicit validator canonical-binding policy.
2. Validator and shared contract cannot drift silently.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — add contract-vs-policy parity audit for declared binder patterns.

### Commands

1. `pnpm -F @ludoforge/engine test`
2. `pnpm turbo test`
3. `pnpm turbo lint`

## Outcome

1. Implemented as planned: added a testable validator policy-pattern export and a deterministic contract-vs-policy parity test for declared effect binders.
2. Scope remained unchanged: no runtime/simulator behavior changes, no contract semantic changes, no game-specific logic.
3. Validation result: `pnpm turbo test` and `pnpm turbo lint` both passed after fixing a transient stale dist-lock issue in the local workspace.
