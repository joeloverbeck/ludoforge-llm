# ENGINEARCH-078: Add direct contract tests for transfer endpoint normalizer

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: None

## Problem

`normalizeTransferEndpoint` is now the canonical transfer endpoint contract gate for projection and rendering, but it lacks direct unit-level contract tests. Current coverage is indirect through higher-level tests, which weakens failure localization and leaves valid output-shape invariants under-specified.

## Assumption Reassessment (2026-02-26)

1. `packages/runner/src/model/model-utils.ts` exports `normalizeTransferEndpoint` and it is consumed by both `trace-projection` and `translate-effect-trace`.
2. `packages/runner/test/model/model-utils.test.ts` currently tests `optionalPlayerId`, scope display formatting, and endpoint varName guards, but not `normalizeTransferEndpoint` itself.
3. **Mismatch + correction**: indirect coverage in projection/translation tests is not enough for canonical contract ownership. Add direct normalizer tests in `model-utils.test.ts`.

## Architecture Check

1. Direct unit tests at the canonical contract point are cleaner than relying only on downstream tests, because they lock invariants where they are defined.
2. This work is runner model-only and preserves game-agnostic boundaries; no game-specific behavior is introduced.
3. No compatibility aliases/shims are introduced.

## What to Change

### 1. Add direct `normalizeTransferEndpoint` success-path tests

Assert exact normalized outputs for `global`, `perPlayer`, and `zone` endpoints, including required/forbidden identity fields.

### 2. Add direct `normalizeTransferEndpoint` failure-path tests

Assert deterministic errors for:
- non-object endpoint payload,
- invalid scope,
- missing/non-string `varName`,
- missing required scope identity (`playerId`/`zoneId`).

## Files to Touch

- `packages/runner/test/model/model-utils.test.ts` (modify)

## Out of Scope

- Projection/translation behavior changes
- Engine/runtime schema or contract changes

## Acceptance Criteria

### Tests That Must Pass

1. `model-utils.test.ts` directly validates normalizer outputs and deterministic failures for all supported scopes.
2. Existing projection/translation tests continue to pass unchanged.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Transfer endpoint contract remains defined and validated in one place (`normalizeTransferEndpoint`).
2. Endpoint normalization semantics remain game-agnostic and deterministic.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/model-utils.test.ts` — add direct `normalizeTransferEndpoint` contract matrix (valid + invalid) to lock canonical behavior.

### Commands

1. `pnpm -F @ludoforge/runner test -- model-utils trace-projection translate-effect-trace`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
