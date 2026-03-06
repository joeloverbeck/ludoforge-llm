# TOKFILAST-029: Add Effects-to-Eval Constructor Import Boundary Guard

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — kernel lint/contract guardrail coverage
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-020-token-filter-traversal-boundary-mapper-centralization.md

## Problem

`TOKFILAST-020` removed direct `effects-reveal` coupling to eval error constructors by introducing a shared boundary mapper, but there is no guardrail test preventing future reintroduction of direct imports from `eval-error.ts` into effect runtime modules.

## Assumption Reassessment (2026-03-06)

1. `packages/engine/src/kernel/effects-reveal.ts` no longer imports `typeMismatchError` and instead uses `mapTokenFilterTraversalToTypeMismatch`.
2. Current unit/lint policy tests do not enforce a generic import boundary that blocks effect modules from importing eval constructor helpers directly.
3. Mismatch: architecture intent exists in implementation, but policy-level regression protection is missing.

## Architecture Check

1. A boundary-policy test is cleaner and more robust than relying on reviewer memory for import hygiene.
2. This preserves game-agnostic kernel layering by keeping effects/runtime surfaces decoupled from eval-constructor internals.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add a lint policy test for effects/eval constructor boundaries

Create a focused policy test asserting kernel effect modules do not import eval constructor factories directly (for example `typeMismatchError`, `createEvalError`).

### 2. Keep approved boundary helper path explicit

Allow effect modules to depend on shared boundary adapters (for example `token-filter-runtime-boundary`) rather than constructor modules.

## Files to Touch

- `packages/engine/test/unit/lint/effects-eval-import-boundary-policy.test.ts` (new)
- `packages/engine/test/unit/lint/contracts-public-surface-import-policy.test.ts` (modify, if shared helper assertions are centralized there instead)

## Out of Scope

- Token-filter traversal arity/path fidelity centralization (`tickets/TOKFILAST-027-token-filter-empty-args-path-fidelity-centralization.md`).
- Predicate-op contract single-source work (`archive/tickets/TOKFILAST-025-predicate-operator-contract-single-source-unification.md`).
- Runtime behavior changes in effect execution.

## Acceptance Criteria

### Tests That Must Pass

1. Policy test fails when an effect runtime module imports eval error constructors directly.
2. Policy test passes for current boundary-helper-based imports.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

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

