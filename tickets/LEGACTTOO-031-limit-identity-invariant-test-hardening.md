# LEGACTTOO-031: Limit Identity Invariant Test Hardening

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — tests only (engine + runner)
**Deps**: tickets/LEGACTTOO-030-first-class-limit-identity-contract.md, archive/tickets/LEGACTTOO/LEGACTTOO-026-availability-section-limit-rendering-hardening.md

## Problem

Current tests validate basic limit rendering and presence of IDs, but miss key invariants:

1. Distinct ID behavior when multiple limits share the same scope (for example two `turn` limits).
2. Explicit parity checks that `AnnotatedActionDescription.limitUsage` and `tooltipPayload.ruleState.limitUsage` carry aligned IDs for the same action limits.

Without these tests, regressions can reintroduce implicit positional coupling or inconsistent identity propagation.

## Assumption Reassessment (2026-03-07)

1. Existing tests assert `id` presence in condition-annotator and runner UI paths. Confirmed in `packages/engine/test/unit/kernel/condition-annotator.test.ts` and `packages/runner/test/ui/AvailabilitySection.test.ts`.
2. No test currently asserts duplicate-scope limits produce distinct IDs. Confirmed by absence in current engine/runner limit-usage tests.
3. No explicit test currently asserts ID parity between description-level `limitUsage` and tooltip `ruleState.limitUsage`. Confirmed in current `condition-annotator` tests.

## Architecture Check

1. Strengthening invariant tests is the lowest-risk path to keep identity contracts robust while architecture evolves.
2. Tests remain game-agnostic and validate shared engine/runtime behavior rather than game-specific fixtures.
3. No compatibility aliases/shims are introduced; tests enforce the canonical contract.

## What to Change

### 1. Add duplicate-scope identity tests

Create tests where an action has multiple limits with identical scope and verify IDs are unique and stable.

### 2. Add cross-surface parity tests

Assert ID/order/value parity between `result.limitUsage` and `result.tooltipPayload.ruleState.limitUsage` for the same action.

### 3. Add runner stability assertion with same-scope multi-limit entries

Extend runner `AvailabilitySection` tests to prove node stability when two same-scope limits update usage independently.

## Files to Touch

- `packages/engine/test/unit/kernel/condition-annotator.test.ts` (modify)
- `packages/runner/test/ui/AvailabilitySection.test.ts` (modify)
- `packages/runner/test/ui/ActionTooltip.test.ts` (modify if parity coverage needed in fallback path)

## Out of Scope

- Core type/compile contract changes (covered by LEGACTTOO-030)
- UI layout/theming refactors
- Any game-specific scenario behavior

## Acceptance Criteria

### Tests That Must Pass

1. Duplicate-scope multi-limit actions produce distinct/stable IDs across description and tooltip surfaces.
2. Description and tooltip limit usage arrays are parity-checked for ID/scope/max/usage consistency.
3. Existing suite: `pnpm -F @ludoforge/engine test`
4. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Limit identity contract is validated independently of usage values.
2. Identity propagation remains deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/condition-annotator.test.ts` — duplicate-scope and cross-surface parity assertions.
2. `packages/runner/test/ui/AvailabilitySection.test.ts` — same-scope multi-limit rerender stability assertions.
3. `packages/runner/test/ui/ActionTooltip.test.ts` — confirm fallback/footer path handles canonical IDs in multi-limit cases.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/condition-annotator.test.js`
3. `pnpm -F @ludoforge/runner test -- AvailabilitySection.test.ts ActionTooltip.test.ts`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm -F @ludoforge/runner test`
