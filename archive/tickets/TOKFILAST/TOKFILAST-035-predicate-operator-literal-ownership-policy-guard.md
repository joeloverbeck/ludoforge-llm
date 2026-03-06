# TOKFILAST-035: Enforce Predicate-Operator Literal Ownership Policy Across Kernel + CNL

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — lint/policy guardrail coverage
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-034-cnl-predicate-operator-single-source-and-no-alias-shorthand.md

## Problem

Even after centralizing predicate-op contracts, there is no dedicated ownership policy test that prevents future reintroduction of duplicate predicate-operator literal ownership and import-source drift across kernel/CNL implementation modules.

## Assumption Reassessment (2026-03-06)

1. Canonical predicate-op ownership exists in `packages/engine/src/contracts/predicate-op-contract.ts` and is exported through `packages/engine/src/contracts/index.ts`.
2. `src/kernel` and `src/cnl` are expected to consume shared contracts via `../contracts/index.js` per contracts public-surface policy (`packages/engine/src/contracts/index.ts` header comment).
3. Existing tests include validator/runtime boundary checks (`packages/engine/test/unit/lint/validator-runtime-import-boundary-policy.test.ts`) but no global ownership-lint guard that scans kernel/CNL for duplicate predicate-op literal tuples and symbol ownership/import drift.
4. Active tickets `TOKFILAST-036` to `TOKFILAST-038` cover adjacent validator/runtime concerns, but do not establish this cross-module ownership guardrail for kernel/CNL.

## Architecture Check

1. A centralized ownership policy test is more robust than relying on reviewer memory for contract-boundary discipline.
2. Guarding literal ownership plus import provenance in shared engine modules strengthens long-term extensibility and avoids silent contract drift.
3. This is game-agnostic contract governance only; no game-specific behavior is introduced.
4. No backwards-compatibility aliases/shims: predicate-op symbols must be imported from the canonical contracts barrel without renaming.

## What to Change

### 1. Add predicate-op ownership lint policy test

Add a lint/policy unit test that scans `src/kernel` and `src/cnl` and fails if predicate-op literal tuples are re-declared outside canonical contract ownership modules.

### 2. Enforce canonical import source and no aliasing for predicate-op symbols

Assert `PredicateOp`, `PREDICATE_OPERATORS`, and `isPredicateOp` are consumed from canonical `../contracts/index.js` import paths in kernel/CNL modules and not re-declared/re-exported elsewhere.

### 3. Keep overlap boundaries explicit

Do not duplicate ticket `TOKFILAST-036` AST hardening scope for validator-specific import assertions; this ticket’s policy should remain ownership-focused and module-scope broad.

## Files to Touch

- `packages/engine/test/unit/lint/predicate-op-contract-ownership-policy.test.ts` (new)
- `packages/engine/test/helpers/lint-policy-helpers.ts` (modify only if needed)

## Out of Scope

- Runtime predicate semantics changes.
- Validator regex-vs-AST hardening in `validator-runtime-import-boundary-policy.test.ts` (ticket `TOKFILAST-036`).
- CNL diagnostic taxonomy changes.

## Acceptance Criteria

### Tests That Must Pass

1. Policy fails when predicate-op literal tuples are duplicated outside canonical ownership modules.
2. Policy fails when kernel/CNL modules import predicate-op ownership symbols from non-canonical paths or with aliasing.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Predicate-op contract ownership remains centralized and explicit.
2. Kernel/CNL predicate-op consumption remains routed through the contracts public surface (`../contracts/index.js`).
3. Game-agnostic engine architecture remains free of game-specific branching.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/predicate-op-contract-ownership-policy.test.ts` — enforce canonical ownership/import boundaries for predicate-op contract symbols across kernel/CNL.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What actually changed:
  - Reassessed and corrected ticket assumptions/scope to align with current contracts public-surface policy (`../contracts/index.js` for kernel/CNL consumers) and to avoid overlap with `TOKFILAST-036`.
  - Added `packages/engine/test/unit/lint/predicate-op-contract-ownership-policy.test.ts` to enforce:
    - no duplicate `['eq', 'neq', 'in', 'notIn']` tuple literals in `src/kernel` and `src/cnl`
    - no local declaration/re-export drift for `PredicateOp`, `PREDICATE_OPERATORS`, `isPredicateOp`
    - no non-canonical or aliased imports for those symbols (must come from `../contracts/index.js`).
- Deviations from original plan:
  - `packages/engine/test/helpers/lint-policy-helpers.ts` was not modified; the new policy test was implemented as a standalone AST-based lint policy for better fit across both kernel and CNL module roots.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed (279/279).
  - `pnpm -F @ludoforge/engine lint` passed.
