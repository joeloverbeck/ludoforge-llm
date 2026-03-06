# TOKFILAST-021: Add Effect-Surface Token-Filter Error Context Contract Coverage for Reveal/Conceal

**Status**: COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — test coverage hardening for effect runtime contracts
**Deps**: archive/tickets/TOKFILAST/TOKFILAST-014-token-filter-traversal-error-boundary-decoupling.md, archive/tickets/TOKFILAST/TOKFILAST-020-token-filter-traversal-boundary-mapper-centralization.md

## Problem

Reveal/conceal tests currently assert `TYPE_MISMATCH` for malformed token-filter shapes, but do not fully lock structured error context (`reason`, `op`, `path`). This leaves room for contract drift at effect boundaries even when error codes still pass.

## Assumption Reassessment (2026-03-06)

1. `effects-reveal.test.ts` currently checks malformed token-filter node shape (for example `{ prop: 'rank' }`) at reveal/conceal effect surfaces, not empty boolean-arity args.
2. Current reveal/conceal tests already assert partial context fidelity (`reason` and `path`) for token-filter traversal mapping.
3. Missing coverage is explicit assertion of `context.op` and explicit unsupported-operator cases (for example `op: 'xor'`) at effect surfaces.
4. Existing archived tickets `TOKFILAST-015..020` harden traversal/runtime behavior and boundary mapping, but do not add reveal/conceal effect-surface assertions for `context.op` plus unsupported-operator parity.

## Architecture Check

1. Boundary contract tests that include structured context are more robust than code-only checks.
2. Extending effect-surface tests (instead of introducing new effect-specific mapper branches) preserves the current clean architecture: a single shared traversal-to-`TYPE_MISMATCH` mapping boundary with deterministic context payloads.
3. This remains game-agnostic runtime contract hardening; no game-specific behavior is introduced.
4. No backwards-compatibility aliases/shims are introduced.

## What to Change

### 1. Strengthen reveal-surface context assertions

Extend malformed-filter tests to assert deterministic context values (`reason`, `op`, `path`) on reveal failures.

### 2. Strengthen conceal-surface context assertions

Mirror the same context checks for conceal failures, ensuring parity across both effect surfaces.

### 3. Add unsupported-operator effect-surface coverage

Add explicit unsupported-operator cases (for example `op: 'xor'`) and assert deterministic `TYPE_MISMATCH` plus context metadata (`reason`, `op`, `path`) for both reveal and conceal.

## Files to Touch

- `packages/engine/test/unit/effects-reveal.test.ts` (modify)

## Out of Scope

- Runtime predicate operator fail-closed behavior (`archive/tickets/TOKFILAST/TOKFILAST-018-token-filter-predicate-operator-fail-closed-hardening.md`).
- Traversal utility predicate-shape strictness (`archive/tickets/TOKFILAST/TOKFILAST-019-token-filter-predicate-shape-and-fold-path-contract-hardening.md`).

## Acceptance Criteria

### Tests That Must Pass

1. Reveal malformed token-filter tests assert deterministic `TYPE_MISMATCH` context (`reason/op/path`), including explicit unsupported-operator coverage.
2. Conceal malformed token-filter tests assert deterministic `TYPE_MISMATCH` context (`reason/op/path`), including explicit unsupported-operator coverage.
3. Existing suite: `pnpm -F @ludoforge/engine test:unit`.

### Invariants

1. Effect runtime token-filter error contracts remain deterministic and fail-closed.
2. Error-context behavior remains game-agnostic and independent of game-specific GameSpecDoc content.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/effects-reveal.test.ts` — strengthen reveal/conceal malformed-filter assertions to include `context.op` checks and explicit unsupported-operator coverage.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test:unit`
3. `pnpm -F @ludoforge/engine lint`

## Outcome

Updated `effects-reveal.test.ts` to align with actual runtime contracts by:
1. Strengthening existing malformed-node reveal/conceal assertions to include deterministic `context.op` (`undefined`) in addition to `reason` and `path`.
2. Adding explicit reveal/conceal unsupported-operator (`op: "xor"`) coverage that asserts deterministic `TYPE_MISMATCH` context (`reason`, `op`, `path` at root).
3. Keeping architecture unchanged (single shared token-filter traversal-to-`TYPE_MISMATCH` boundary mapper) and hardening only effect-surface contract tests.
