# ENGINEARCH-104: Free-Operation Effective-Domain Parity Between Compiler Diagnostics and Runtime

**Status**: COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler diagnostics contract alignment with runtime turn-flow eligibility semantics
**Deps**: archive/specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

Compiler sequence diagnostics and runtime eligibility do not fully share the same effective-domain semantics when both `grant.actionIds` and turn-flow defaults are absent. Runtime resolves to an empty domain (`[]`), while compiler currently treats this as undefined and skips overlap checks.

## Assumption Reassessment (2026-02-27)

1. Runtime grant action-domain resolution returns `grant.actionIds ?? turnFlow.freeOperationActionIds ?? []`.
2. Compiler sequence viability diagnostics currently evaluate overlap only when both sides resolve to non-`undefined` domains (`previous.actionIds ?? defaultActionIds` and `current.actionIds ?? defaultActionIds`).
3. Existing tests cover explicit/default mixed-domain overlap and disjoint cases, but do not cover the "both absent" effective-domain case.
4. Mismatch: compiler can skip non-overlap warnings for transitions that runtime semantics resolve to empty/non-overlapping domains; corrected scope is to codify and enforce one canonical effective-domain rule.

## Architecture Check

1. Contract parity between compiler and runtime is cleaner and more robust than partial semantic drift across layers.
2. This remains game-agnostic and generic to turn-flow grants; no game-specific or visual-config data enters runtime contracts.
3. No backwards-compatibility aliasing/shims; directly enforce canonical parity.

## What to Change

### 1. Define canonical effective-domain semantics

Choose and document one rule for absent action domains (recommended: normalize to empty array for both compiler and runtime parity).

### 2. Align compiler diagnostics implementation

Update sequence viability overlap checks to apply the canonical rule consistently, including empty-domain scenarios where both sides normalize to `[]`.

### 3. Strengthen parity tests

Add tests that pin compiler warnings and runtime denial/eligibility outcomes for equivalent empty-domain and mixed-domain scenarios, including the currently untested "both absent" case.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (no behavioral change expected; touch only if needed for clarity/refactor)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (out of scope unless a sequence-checkpoint parity gap is discovered)

## Out of Scope

- Changing authored `GameSpecDoc` surface shape for `grantFreeOperation`.
- Introducing special-case game logic.

## Acceptance Criteria

### Tests That Must Pass

1. Compiler diagnostics deterministically classify empty-domain sequence transitions under the canonical rule.
2. Runtime free-operation denial/eligibility behavior remains consistent with compiler diagnostics contract intent.
3. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. Effective action-domain semantics are defined once and applied consistently across compile and runtime layers.
2. Free-operation sequencing remains generic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/compile-effects.test.ts` — include absent/absent and absent/default/explicit effective-domain cases with deterministic warning expectations.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — runtime denial behavior when grant and turn-flow defaults both omit action domains (effective `[]`).
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — only if parity gap appears during implementation.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`

## Outcome

- **Completion date**: 2026-02-27
- **What actually changed**:
  - Compiler free-operation sequence viability diagnostics now normalize effective action domains to `[]` when both `grant.actionIds` and turn-flow defaults are absent.
  - Introduced a shared canonical resolver module for free-operation effective action domains and reused it across compiler diagnostics and runtime turn-flow legality/variant expansion paths.
  - Added compiler test coverage for absent/absent effective-domain transitions (`non-overlapping actionIds` warning expected).
  - Added runtime legal-moves coverage verifying no free-operation variants are exposed when both grant and turn-flow action domains are absent.
  - Added direct unit tests for the shared action-domain resolver contract.
- **Deviations from original plan**:
  - `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` remained unchanged because no sequence-checkpoint parity gap was found.
- **Verification results**:
  - `pnpm turbo build` passed.
  - `node --test packages/engine/dist/test/unit/kernel/free-operation-action-domain.test.js` passed.
  - `node --test packages/engine/dist/test/unit/compile-effects.test.js` passed.
  - `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js` passed.
  - `pnpm -F @ludoforge/engine test` passed (`312` tests, `0` failures).
  - `pnpm turbo lint` passed.
