# DECINSARC-007: Migrate runner types, store, and render model to DecisionKey

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: DECINSARC-001, DECINSARC-002

## Problem

The runner tightly couples to `ChoicePendingRequest` shape. After collapsing occurrence fields to `decisionKey`, the runner's `PartialChoice` type, `game-store.ts`, `iteration-context.ts`, and `derive-render-model.ts` must be updated. `iteration-context.ts` also imports `extractResolvedBindFromDecisionId` from the engine, which is being deleted — it must switch to `parseDecisionKey`.

## Assumption Reassessment (2026-03-13)

1. `PartialChoice` in `store-types.ts` has `decisionId: string` — confirmed, needs renaming to `decisionKey: DecisionKey`.
2. `game-store.ts` — `buildMove` writes `choice.decisionId` to params, `submitChoice` reads `state.choicePending.decisionId` — confirmed, both need updating.
3. `iteration-context.ts` (76 lines) imports `extractResolvedBindFromDecisionId` from engine, uses regex `ITERATION_INDEX_PATTERN` to parse iteration index from decision id — confirmed, replace with `parseDecisionKey()`.
4. `derive-render-model.ts` passes `decisionId` to `parseIterationContext()` — confirmed, update to `decisionKey`.
5. Worker bridge passes `Move`/`ChoiceRequest` transparently — confirmed, no changes needed.
6. `ChoicePanel.tsx` receives render model which abstracts key format — confirmed, minimal or no changes.
7. Runner code/tests must not assume every `DecisionKey` starts with `decision:`: simple static binds now serialize as raw keys like `$target`, while templated authored decision ids still keep the `decision:...::resolvedBind` shape.

## Architecture Check

1. Runner uses the same `DecisionKey` type from engine — shared type contract.
2. `parseDecisionKey()` from codec replaces both `extractResolvedBindFromDecisionId()` and the regex-based parsing in `iteration-context.ts`.
3. No backwards-compatibility shims in the runner.

## What to Change

### 1. Update `packages/runner/src/store/store-types.ts`

- `PartialChoice.decisionId: string` → `decisionKey: DecisionKey`
- Import `DecisionKey` from `@ludoforge/engine`

### 2. Update `packages/runner/src/store/game-store.ts`

- `buildMove`: `choice.decisionId` → `choice.decisionKey`
- `submitChoice`: `state.choicePending.decisionId` → `state.choicePending.decisionKey`
- Any other references to `decisionId` on `PartialChoice` or `ChoicePendingRequest`

### 3. Rewrite `packages/runner/src/model/iteration-context.ts`

- Remove import of `extractResolvedBindFromDecisionId` from engine
- Import `parseDecisionKey` from `@ludoforge/engine`
- Replace `extractResolvedBindFromDecisionId(decisionId)` + regex parsing with `parseDecisionKey(decisionKey)` — extract `resolvedBind`, `iterationPath` from parsed result
- Remove `ITERATION_INDEX_PATTERN` regex
- Function signature: accept `decisionKey: DecisionKey` instead of `decisionId: string`

### 4. Update `packages/runner/src/model/derive-render-model.ts`

- All `pending.decisionId` → `pending.decisionKey`
- Pass `decisionKey` to `parseIterationContext()`
- `extractIterationGroupId` uses codec parse if applicable

### 5. Update any UI components if needed

- Check `ChoicePanel.tsx` and other UI components for direct `decisionId` references
- Likely minimal changes since UI receives render model, not raw pending request

## Files to Touch

- `packages/runner/src/store/store-types.ts` (modify)
- `packages/runner/src/store/game-store.ts` (modify)
- `packages/runner/src/model/iteration-context.ts` (modify — rewrite)
- `packages/runner/src/model/derive-render-model.ts` (modify)
- Any UI components with direct `decisionId` references (modify, if found)

## Out of Scope

- Modifying engine kernel source files (done in DECINSARC-001 through DECINSARC-005)
- Modifying engine tests (done in DECINSARC-006)
- Worker bridge changes (transparent — no changes needed)
- Visual config or CSS changes
- Game-specific UI behavior
- Animation system changes

## Acceptance Criteria

### Tests That Must Pass

1. Runner unit tests: `pnpm -F @ludoforge/runner test`
2. `PartialChoice` type uses `decisionKey: DecisionKey` — no `decisionId` field
3. `buildMove` correctly writes params keyed by `DecisionKey`
4. `submitChoice` correctly reads `decisionKey` from pending choice
5. `parseIterationContext` correctly extracts iteration info from `DecisionKey` via codec
6. Render model derivation correctly passes `decisionKey` through
7. Runner typecheck passes: `pnpm -F @ludoforge/runner exec tsc --noEmit`
8. Runner lint passes: `pnpm -F @ludoforge/runner lint`

### Invariants

1. No `decisionId` string field on `PartialChoice` — replaced by `decisionKey: DecisionKey`.
2. No import of `extractResolvedBindFromDecisionId` from engine (deleted module).
3. No regex-based decision key parsing — use codec `parseDecisionKey` exclusively.
4. Runner imports `DecisionKey` and codec functions from `@ludoforge/engine` public API.
5. Worker bridge remains unchanged (transparent pass-through).

## Test Plan

### New/Modified Tests

1. `packages/runner/test/store/` — update any tests referencing `PartialChoice.decisionId`
2. `packages/runner/test/model/iteration-context.test.ts` — rewrite for `parseDecisionKey` usage
3. `packages/runner/test/model/derive-render-model.test.ts` — update `decisionId` → `decisionKey`

### Commands

1. `pnpm -F @ludoforge/runner test`
2. `pnpm -F @ludoforge/runner exec tsc --noEmit`
3. `pnpm -F @ludoforge/runner lint`
