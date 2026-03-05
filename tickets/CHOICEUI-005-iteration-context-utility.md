# CHOICEUI-005: Iteration Context Extraction Utility

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: Yes -- barrel export only (`packages/engine/src/kernel/index.ts`)
**Deps**: None

## Problem

When the kernel iterates over a `chooseN` result (e.g., "for each selected space, choose placement type"), the runner has no way to determine which element of the iteration the current decision applies to. The kernel encodes this context in the `decisionId` string via `composeScopedDecisionId()`, but the runner lacks a utility to parse it.

This context is needed by CHOICEUI-006 (choice context header) and CHOICEUI-007/008 (breadcrumb improvements) to show "Choosing for Da Nang (1 of 3)" and to group breadcrumb steps by iteration.

## Assumption Reassessment (2026-03-05)

1. `composeScopedDecisionId()` in `packages/engine/src/kernel/decision-id.ts` (line 29) uses two encoding patterns:
   - `::resolvedBind` suffix when a bind template resolves to a unique value (e.g., `decision:abc::da-nang:none`)
   - `[N]` suffix when no template resolution happened (e.g., `decision:abc[0]`)
2. `extractResolvedBindFromDecisionId()` exists at line 39 of `decision-id.ts` but is NOT exported from `packages/engine/src/kernel/index.ts`.
3. The `PartialChoice` type in `store-types.ts` stores `value: MoveParamValue` which is the array when a `chooseN` result is stored.
4. The runner's `RenderZone` type has `id` and `displayName` fields for zone name resolution.

## Architecture Check

1. The engine change is purely additive: exporting an existing read-only utility function from the barrel. No behavioral changes to the engine.
2. The runner utility is a pure function with no side effects -- easy to test in isolation.
3. Keeps the parsing logic in the runner (not engine), since the interpretation of iteration context for UI display is a runner concern.

## What to Change

### 1. Export `extractResolvedBindFromDecisionId` from engine barrel

In `packages/engine/src/kernel/index.ts`, add:
```typescript
export { extractResolvedBindFromDecisionId } from './decision-id.js';
```

Verify this is re-exported from the engine's top-level runtime barrel so the runner can import it as `@ludoforge/engine/runtime`.

### 2. Create `packages/runner/src/model/iteration-context.ts`

New file with:

```typescript
export interface IterationContext {
  readonly iterationIndex: number;
  readonly iterationTotal: number;
  readonly currentEntityId: string;
  readonly currentEntityDisplayName: string;
}

export function parseIterationContext(
  decisionId: string,
  choiceStack: readonly PartialChoice[],
  zonesById: ReadonlyMap<string, RenderZone>,
): IterationContext | null
```

**Implementation logic**:

1. Try `extractResolvedBindFromDecisionId(decisionId)` to get a resolved bind string (e.g., `"da-nang:none"`).
2. If no resolved bind, check for `[N]` suffix pattern via regex `/\[(\d+)\]$/`.
3. Search `choiceStack` in reverse for the most recent entry whose `value` is an array -- this is the `chooseN` result the kernel is iterating over.
4. If no array found in stack, return `null`.
5. If resolved bind found: find its index in the array (strict equality match). If `[N]` found: use N directly as the index.
6. If index out of bounds or not found, return `null`.
7. Resolve the entity ID to a display name: look up `zonesById.get(entityId)?.displayName`, fallback to `formatIdAsDisplayName(entityId)`.
8. Return `{ iterationIndex, iterationTotal: array.length, currentEntityId, currentEntityDisplayName }`.

## Files to Touch

- `packages/engine/src/kernel/index.ts` (modify -- add barrel export)
- `packages/runner/src/model/iteration-context.ts` (new)
- `packages/runner/test/model/iteration-context.test.ts` (new)

## Out of Scope

- Using `parseIterationContext()` in `derive-render-model.ts` (CHOICEUI-006, CHOICEUI-007).
- Modifying `decision-id.ts` logic (the function already exists and works correctly).
- Adding iteration context to `RenderModel` types (CHOICEUI-006).
- Handling non-zone entity types (token IDs) in iteration resolution -- only zone lookup is needed for current use cases.

## Acceptance Criteria

### Tests That Must Pass

1. `parseIterationContext` returns correct `IterationContext` for a `decisionId` with `::resolvedBind` pattern when the choice stack contains a matching array.
2. `parseIterationContext` returns correct `IterationContext` for a `decisionId` with `[N]` suffix pattern.
3. `parseIterationContext` returns `null` when the `decisionId` has no iteration encoding.
4. `parseIterationContext` returns `null` when the choice stack has no array values.
5. `parseIterationContext` returns `null` when the resolved bind is not found in the array.
6. Zone display name resolution: uses `zonesById` lookup when available, falls back to `formatIdAsDisplayName()`.
7. `extractResolvedBindFromDecisionId` is importable from `@ludoforge/engine/runtime`.
8. Existing suite: `pnpm -F @ludoforge/engine test` and `pnpm -F @ludoforge/runner test`.

### Invariants

1. Engine barrel export is additive only -- no existing exports removed or renamed.
2. `parseIterationContext` is a pure function with no side effects.
3. `IterationContext.iterationIndex` is zero-based and `< iterationTotal`.

## Test Plan

### New/Modified Tests

1. `packages/runner/test/model/iteration-context.test.ts` -- comprehensive unit tests covering all six acceptance criteria scenarios above.

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `pnpm -F @ludoforge/engine test`
3. `pnpm -F @ludoforge/runner test`
4. `pnpm turbo typecheck`
