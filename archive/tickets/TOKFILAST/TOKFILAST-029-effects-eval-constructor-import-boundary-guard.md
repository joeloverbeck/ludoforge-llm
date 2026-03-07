# TOKFILAST-029: Add Effects-to-Eval Constructor Import Boundary Guard

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel lint/contract guardrail coverage
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-020-token-filter-traversal-boundary-mapper-centralization.md

## Problem

`TOKFILAST-020` removed direct `effects-reveal` coupling to eval error constructors by introducing a shared boundary mapper, but there is no guardrail test preventing future reintroduction of direct imports from `eval-error.ts` into effect runtime modules.

## Assumption Reassessment (2026-03-06)

1. `packages/engine/src/kernel/effects-reveal.ts` no longer imports `typeMismatchError` and instead uses `mapTokenFilterTraversalToTypeMismatch`.
2. No current `effects-*.ts` module imports from `./eval-error.js`, so the desired boundary is currently respected by convention.
3. Current lint config and unit policy tests do not enforce an explicit effects-to-eval constructor boundary; regression protection is missing.
4. `packages/engine/test/unit/lint/contracts-public-surface-import-policy.test.ts` does not exist, so that path is not a valid edit target for this ticket.

## Architecture Check

1. Enforcing the boundary in `eslint.config.js` with `no-restricted-imports` is stronger than convention and scales better than reviewer memory.
2. A focused policy test that validates the lint rule wiring is still useful as a guardrail against future config drift.
3. This preserves game-agnostic kernel layering by keeping effects/runtime surfaces decoupled from eval-constructor internals.
4. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add a lint rule for effects/eval constructor boundaries

Add a kernel effects-specific `no-restricted-imports` rule in `eslint.config.js` that blocks imports from `./eval-error.js` and `./eval-error.ts` within `packages/engine/src/kernel/effects-*.ts`.

### 2. Add a focused lint-policy guard test

Create `packages/engine/test/unit/lint/effects-eval-import-boundary-policy.test.ts` to assert the ESLint configuration contains this restriction for effects modules.

### 3. Keep approved boundary helper path explicit

Continue using shared boundary adapters (for example `token-filter-runtime-boundary`) rather than eval constructor modules directly.

## Files to Touch

- `eslint.config.js` (modify)
- `packages/engine/test/unit/lint/effects-eval-import-boundary-policy.test.ts` (new)

## Out of Scope

- Token-filter traversal arity/path fidelity centralization (`archive/tickets/TOKFILAST/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md`).
- Predicate-op contract single-source work (`archive/tickets/TOKFILAST-025-predicate-operator-contract-single-source-unification.md`).
- Runtime behavior changes in effect execution.

## Acceptance Criteria

### Tests That Must Pass

1. Policy test fails when an effect runtime module imports eval error constructors directly.
2. Lint config contains an effects-specific restriction for `./eval-error.js|.ts`.
3. Policy test passes for current boundary-helper-based imports.
4. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Effect runtime modules remain decoupled from eval constructor internals.
2. Kernel architecture remains game-agnostic; no GameSpecDoc/visual-config coupling leaks into runtime contracts.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/lint/effects-eval-import-boundary-policy.test.ts` — enforces architectural import boundary and prevents coupling regressions.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

- Completion date: 2026-03-06
- What changed:
  - Added an effects-module lint boundary in `eslint.config.js` to forbid direct `./eval-error.js|.ts` imports from `packages/engine/src/kernel/effects-*.ts`.
  - Added `packages/engine/test/unit/lint/effects-eval-import-boundary-policy.test.ts` to lock in the ESLint boundary configuration.
  - Updated this ticket's assumptions/scope to match the real codebase/test surface before implementation.
- Deviations from original plan:
  - Original draft focused only on a policy test and listed `packages/engine/test/unit/lint/contracts-public-surface-import-policy.test.ts` as a potential edit target, but that file does not exist in `test/unit/lint`; implementation switched to a stronger lint-rule-plus-policy-test approach.
- Verification results:
  - `pnpm -F @ludoforge/engine build` passed.
  - `pnpm -F @ludoforge/engine test:unit` passed.
  - `pnpm -F @ludoforge/engine lint` passed.
