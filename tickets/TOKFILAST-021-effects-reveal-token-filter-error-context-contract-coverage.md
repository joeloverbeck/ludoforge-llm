# TOKFILAST-021: Add Effect-Surface Token-Filter Error Context Contract Coverage for Reveal/Conceal

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test coverage hardening for effect runtime contracts
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md, tickets/TOKFILAST-020-token-filter-traversal-boundary-mapper-centralization.md

## Problem

Reveal/conceal tests currently assert `TYPE_MISMATCH` for malformed token-filter arity, but do not lock structured error context (`reason`, `op`, `path`). This leaves room for contract drift at effect boundaries even when error codes still pass.

## Assumption Reassessment (2026-03-06)

1. `effects-reveal.test.ts` includes checks that empty boolean token-filter args fail with `TYPE_MISMATCH`.
2. Current reveal/conceal tests do not assert context fidelity for token-filter traversal mapping (`reason/op/path`).
3. Existing active tickets (`TOKFILAST-015..019`) do not specifically cover effect-surface context contract assertions for reveal/conceal.
4. Mismatch: contract coverage is weaker here than in token-filter runtime tests, where context fields are already asserted.

## Architecture Check

1. Boundary contract tests that include structured context are more robust than code-only checks.
2. This is game-agnostic runtime contract hardening; no game-specific behavior is introduced.
3. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Add reveal-surface context assertions

Extend malformed-filter tests to assert deterministic context values (`reason`, `op`, `path`) on reveal failures.

### 2. Add conceal-surface context assertions

Mirror the same context checks for conceal failures, ensuring parity across both effect surfaces.

### 3. Add unsupported-operator effect-surface coverage

Add a malformed unsupported-operator case (for example `xor`) and assert deterministic `TYPE_MISMATCH` plus context metadata.

## Files to Touch

- `packages/engine/test/unit/effects-reveal.test.ts` (modify)

## Out of Scope

- Runtime predicate operator fail-closed behavior (`archive/tickets/TOKFILAST/TOKFILAST-018-token-filter-predicate-operator-fail-closed-hardening.md`).
- Traversal utility predicate-shape strictness (`archive/tickets/TOKFILAST/TOKFILAST-019-token-filter-predicate-shape-and-fold-path-contract-hardening.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Reveal malformed token-filter tests assert deterministic `TYPE_MISMATCH` context (`reason/op/path`).
2. Conceal malformed token-filter tests assert deterministic `TYPE_MISMATCH` context (`reason/op/path`).
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Effect runtime token-filter error contracts remain deterministic and fail-closed.
2. Error-context behavior remains game-agnostic and independent of game-specific GameSpecDoc content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — strengthen reveal/conceal malformed-filter assertions to include context fidelity and unsupported-operator coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`
