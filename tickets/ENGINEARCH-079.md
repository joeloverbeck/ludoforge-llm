# ENGINEARCH-079: Make transfer endpoint utility surface explicit and remove duplicated test helpers

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None - runner-only
**Deps**: None

## Problem

Transfer endpoint utilities in `model-utils` still use generic "endpoint/scope" naming that can blur ownership boundaries as model utilities grow. In parallel, test files duplicate local `catchError` helpers, increasing drift risk in assertion plumbing.

## Assumption Reassessment (2026-02-26)

1. Transfer endpoint normalization is centralized in `model-utils`, but type/helper names remain partly generic (`ScopeEndpointPayloadObject`, `ScopeEndpointDisplayInput`, `invalidEndpointScope`).
2. `trace-projection.test.ts` and `translate-effect-trace.test.ts` each define identical local `catchError` helpers.
3. **Mismatch + correction**: architecture is functionally correct, but naming and test-helper duplication still leave clarity/maintenance debt.

## Architecture Check

1. Explicit transfer-scoped naming improves long-term extensibility by preventing accidental reuse for unrelated endpoint concepts.
2. Consolidating shared test helper behavior reduces duplication and future drift without changing runtime behavior.
3. This remains game-agnostic runner infrastructure work, with no game-specific logic and no compatibility aliases.

## What to Change

### 1. Rename transfer endpoint types/helpers for explicit domain ownership

Use transfer-specific names for transfer-only contracts and guard utilities in `model-utils` and dependent imports/usages.

### 2. Consolidate duplicated test helper

Move repeated `catchError` helper into a shared test helper module under `packages/runner/test/model/helpers/` and consume it from both tests.

## Files to Touch

- `packages/runner/src/model/model-utils.ts` (modify)
- `packages/runner/src/model/trace-projection.ts` (modify)
- `packages/runner/src/model/translate-effect-trace.ts` (modify)
- `packages/runner/test/model/trace-projection.test.ts` (modify)
- `packages/runner/test/model/translate-effect-trace.test.ts` (modify)
- `packages/runner/test/model/helpers/` (new helper file)

## Out of Scope

- Endpoint behavior/semantics changes
- Engine/runtime/schema layer changes

## Acceptance Criteria

### Tests That Must Pass

1. Runtime behavior and error semantics remain unchanged after naming cleanup.
2. Model tests no longer duplicate identical local `catchError` helper implementations.
3. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Transfer endpoint contracts stay centralized and explicitly transfer-scoped.
2. Cleanup introduces no game-specific coupling and no compatibility aliases.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/trace-projection.test.ts` — use shared helper import; keep existing assertions unchanged.
2. `packages/runner/test/model/translate-effect-trace.test.ts` — use shared helper import; keep existing assertions unchanged.

### Commands

1. `pnpm -F @ludoforge/runner test -- trace-projection translate-effect-trace model-utils`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner lint`
