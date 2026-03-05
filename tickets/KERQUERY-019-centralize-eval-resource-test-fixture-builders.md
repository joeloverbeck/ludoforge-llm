# KERQUERY-019: Centralize eval-resource test fixture builders

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — engine test fixture architecture for eval/effect contexts
**Deps**: archive/tickets/KERQUERY/KERQUERY-012-preserve-resource-identity-across-legal-choices-discovery.md, packages/engine/test/helpers/effect-context-test-helpers.ts, packages/engine/test/unit/eval-condition.test.ts, packages/engine/test/unit/eval-query.test.ts

## Problem

Many tests now manually construct `EvalRuntimeResources`/`EvalContext` fixtures. This duplicates boilerplate and increases drift risk for future contract changes.

## Assumption Reassessment (2026-03-05)

1. Multiple unit/integration test files now hand-roll the same resource fixture pattern.
2. Current helper coverage does not provide a canonical shared builder for eval/effect context resources.
3. No active ticket currently targets fixture deduplication for this new resources contract.

## Architecture Check

1. Shared fixture builders reduce duplication and keep context contracts consistent under future refactors.
2. This change is test-infrastructure only and does not introduce game-specific runtime behavior.
3. No backwards-compatibility aliasing/shims: migrate tests directly to the canonical helper APIs.

## What to Change

### 1. Add canonical test helpers for runtime resources/context construction

1. Add helper(s) to create `EvalRuntimeResources`.
2. Add helper(s) to create `EvalContext` with explicit resources identity.

### 2. Migrate representative high-churn tests to the new helper

1. Replace repeated local fixture code in core eval/query/selector test files.
2. Keep behavior assertions unchanged; only fixture construction should move.

## Files to Touch

- `packages/engine/test/helpers/eval-context-test-helpers.ts` (new)
- `packages/engine/test/unit/eval-condition.test.ts` (modify)
- `packages/engine/test/unit/eval-query.test.ts` (modify)
- `packages/engine/test/unit/eval-value.test.ts` (modify)
- `packages/engine/test/unit/resolve-selectors.test.ts` (modify)

## Out of Scope

- Runtime behavior changes in kernel/effects paths
- Trigger-dispatch signature work (`tickets/KERQUERY-015-harden-trigger-dispatch-signature-and-runtime-contracts.md`)
- Query runtime cache ownership/key policy tickets (`tickets/KERQUERY-013-centralize-query-runtime-cache-index-keys-and-typed-accessors.md`, `tickets/KERQUERY-014-enforce-query-runtime-cache-ownership-boundary-contracts.md`)

## Acceptance Criteria

### Tests That Must Pass

1. Target tests consume shared helper(s) for runtime resources/context fixtures.
2. Test behavior/output remains unchanged.
3. Existing suite: `pnpm -F @ludoforge/engine test`.

### Invariants

1. Test fixtures preserve canonical runtime resource identity semantics.
2. GameDef/runtime/simulator remain game-agnostic.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/helpers/eval-context-test-helpers.ts` — canonical builder for context/resource fixtures.
2. `packages/engine/test/unit/eval-condition.test.ts` — migrate fixture construction to helper.
3. `packages/engine/test/unit/eval-query.test.ts` — migrate fixture construction to helper.
4. `packages/engine/test/unit/eval-value.test.ts` — migrate fixture construction to helper.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/eval-condition.test.js packages/engine/dist/test/unit/eval-query.test.js packages/engine/dist/test/unit/eval-value.test.js`
3. `pnpm -F @ludoforge/engine test`
4. `pnpm -F @ludoforge/engine lint`
