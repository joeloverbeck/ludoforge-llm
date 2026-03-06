# TOKFILAST-026: Decouple Validator Predicate-Op Checks from Query Runtime Module

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel validation/runtime module boundary cleanup
**Deps**: archive/tickets/TOKFILAST-025-predicate-operator-contract-single-source-unification.md

## Problem

`validate-gamedef-behavior.ts` currently imports predicate-op helpers from `query-predicate.ts`, which is a runtime evaluator module. This creates avoidable validator-to-runtime coupling and weakens architectural layering.

## Assumption Reassessment (2026-03-06)

1. Validator predicate-op diagnostics currently rely on `isPredicateOp`/`PREDICATE_OPERATORS` imported from `query-predicate.ts`.
2. `query-predicate.ts` also owns runtime evaluation logic and eval error construction, so importing from it is broader than validator needs.
3. TOKFILAST `019`/`020`/`021`/`024` are archived; `025` completed predicate-op contract extraction and left this validator/runtime boundary decoupling as a follow-up.

## Architecture Check

1. Validator logic should depend on neutral contract modules, not runtime evaluators, to keep module ownership clean and extensible.
2. Decoupling preserves game-agnostic kernel boundaries and prevents accidental runtime-only dependency bleed into validation passes.
3. No backwards-compatibility aliases/shims are introduced; behavior remains fail-closed and deterministic.

## What to Change

### 1. Move validator dependency to neutral contract source

Update validator imports to consume predicate-op contracts from a dedicated contract module (from TOKFILAST-025), not from runtime evaluation modules.

### 2. Ensure runtime keeps explicit boundary ownership

`query-predicate.ts` should keep runtime behavior/error semantics only, while sharing contract primitives via the neutral module.

### 3. Add a boundary guard test

Add a lint/contract test ensuring validator modules do not import runtime query evaluator modules for predicate-op contracts.

## Files to Touch

- `packages/engine/src/kernel/validate-gamedef-behavior.ts` (modify)
- `packages/engine/src/kernel/query-predicate.ts` (modify, if needed after import moves)
- `packages/engine/test/unit/lint/<validator-runtime-import-boundary-policy>.test.ts` (new)

## Out of Scope

- Predicate-node shape/path traversal hardening (`archive/tickets/TOKFILAST/TOKFILAST-019-token-filter-predicate-shape-and-fold-path-contract-hardening.md`).
- Effect-surface token-filter error-context test deepening (`archive/tickets/TOKFILAST/TOKFILAST-021-effects-reveal-token-filter-error-context-contract-coverage.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Validator no longer imports predicate-op contracts from `query-predicate.ts`.
2. A policy/guard test fails if validator-runtime import coupling is reintroduced.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Validator, schema, and runtime remain layered around neutral shared contracts.
2. Predicate-op validation behavior stays deterministic and game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/<validator-runtime-import-boundary-policy>.test.ts` — enforce validator import boundaries against runtime evaluator modules.
2. `packages/engine/test/unit/validate-gamedef.test.ts` — retain unsupported predicate-op diagnostic behavior after decoupling.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - `validate-gamedef-behavior.ts` now imports `isPredicateOp`/`PREDICATE_OPERATORS` from `predicate-op-contract.ts`, not `query-predicate.ts`.
  - Removed predicate-op re-exports from `query-predicate.ts`, keeping runtime evaluator boundaries explicit.
  - Added boundary guard test `validator-runtime-import-boundary-policy.test.ts` to prevent validator imports from runtime evaluator modules and prevent re-export alias drift.
- Deviations from original plan:
  - No additional changes in `validate-gamedef.test.ts` were required because existing behavior remained identical and already covered.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
