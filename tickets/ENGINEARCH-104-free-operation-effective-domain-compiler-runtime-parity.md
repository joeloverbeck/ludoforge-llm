# ENGINEARCH-104: Free-Operation Effective-Domain Parity Between Compiler Diagnostics and Runtime

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — compiler diagnostics contract alignment with runtime turn-flow eligibility semantics
**Deps**: specs/17-fitl-turn-sequence-eligibility-and-card-flow.md

## Problem

Compiler sequence diagnostics and runtime eligibility do not fully share the same effective-domain semantics when both `grant.actionIds` and turn-flow defaults are absent. Runtime resolves to an empty domain (`[]`), while compiler currently treats this as undefined and skips overlap checks.

## Assumption Reassessment (2026-02-27)

1. Runtime grant action-domain resolution returns `grant.actionIds ?? turnFlow.freeOperationActionIds ?? []`.
2. Compiler sequence viability diagnostics currently evaluate overlap only when both sides resolve to non-`undefined` domains.
3. Mismatch: compiler may miss risky transitions that runtime semantics would treat as empty/non-overlapping domains; corrected scope is to codify and enforce one canonical effective-domain rule.

## Architecture Check

1. Contract parity between compiler and runtime is cleaner and more robust than partial semantic drift across layers.
2. This remains game-agnostic and generic to turn-flow grants; no game-specific or visual-config data enters runtime contracts.
3. No backwards-compatibility aliasing/shims; directly enforce canonical parity.

## What to Change

### 1. Define canonical effective-domain semantics

Choose and document one rule for absent action domains (recommended: normalize to empty array for both compiler and runtime parity).

### 2. Align compiler diagnostics implementation

Update sequence viability overlap checks to apply the canonical rule consistently, including empty-domain scenarios.

### 3. Strengthen parity tests

Add tests that pin compiler warnings and runtime denial/eligibility outcomes for equivalent empty-domain and mixed-domain scenarios.

## Files to Touch

- `packages/engine/src/cnl/compile-effects.ts` (modify)
- `packages/engine/src/kernel/turn-flow-eligibility.ts` (modify only if needed to match canonical semantics)
- `packages/engine/test/unit/compile-effects.test.ts` (modify)
- `packages/engine/test/unit/kernel/legal-moves.test.ts` (modify)
- `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` (modify if needed for parity assertions)

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

1. `packages/engine/test/unit/compile-effects.test.ts` — empty/default/explicit effective-domain matrix with expected warning behavior.
2. `packages/engine/test/unit/kernel/legal-moves.test.ts` — runtime legality/denial behavior for matching domain configurations.
3. `packages/engine/test/unit/kernel/move-decision-sequence.test.ts` — optional parity checks for sequence checkpoint behavior.

### Commands

1. `pnpm turbo build`
2. `node --test packages/engine/dist/test/unit/compile-effects.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/legal-moves.test.js`
4. `pnpm -F @ludoforge/engine test`
5. `pnpm turbo lint`
