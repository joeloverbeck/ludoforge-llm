# ENGINEARCH-204: Enforce Validator Policy Parity with Declared Binder Contract

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: Yes — validator contract auditing tests
**Deps**: packages/engine/src/contracts/binder-surface-contract.ts, packages/engine/src/kernel/validate-gamedef-behavior.ts, packages/engine/test/unit/validate-gamedef.test.ts, archive/tickets/ENGINEARCH-201-global-canonical-binding-identifiers.md

## Problem

Declared binder surfaces are centralized in shared contracts, but validator canonical-binding policy is still a separate mapping table. If a new binder declaration path is added in contract and the validator mapping is not updated, enforcement can silently drift.

## Assumption Reassessment (2026-03-03)

1. `collectDeclaredBinderCandidatesFromEffectNode` now derives declared binder candidates from `EFFECT_BINDER_SURFACE_CONTRACT` in `src/contracts`.
2. `validate-gamedef-behavior` enforces canonical declared binders via `EFFECT_DECLARED_BINDER_POLICY_BY_PATTERN`, which is manually curated.
3. Mismatch: there is no explicit parity audit test proving every contract-declared binder pattern has validator policy coverage. Scope is corrected to add a deterministic parity guard.

## Architecture Check

1. Contract-to-validator parity checks are cleaner than relying on developer discipline because they prevent silent contract drift.
2. This remains game-agnostic (pure contract consistency); no game-specific behavior is added to `GameDef` validation or simulation.
3. No backward-compatibility aliases/shims are introduced; this only hardens strict canonical contract enforcement.

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
