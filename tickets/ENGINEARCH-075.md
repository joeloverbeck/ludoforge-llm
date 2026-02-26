# ENGINEARCH-075: Extract forEach iteration decision-ID scoping into `decision-id.ts` helper

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/decision-id.ts`, `packages/engine/src/kernel/effects-choice.ts`
**Deps**: None

## Problem

The forEach iteration scoping logic for decision IDs is duplicated identically in both `applyChooseOne` and `applyChooseN` within `effects-choice.ts`. This violates DRY and places scoping logic far from the `composeDecisionId` function it conceptually extends.

## Assumption Reassessment (2026-02-26)

1. `composeDecisionId` in `decision-id.ts` handles template-based uniqueness (bind templates with `{$var}` references). Confirmed current code at `decision-id.ts:1-12`.
2. `iterationPath` on `EffectContext` was added to scope static-bind decisions inside forEach. Confirmed in `effect-context.ts:50-51`.
3. The duplicated 4-line pattern in `applyChooseOne` (lines 62-69) and `applyChooseN` (lines 145-149) is identical in logic: check if `composeDecisionId` returned the unmodified `internalDecisionId`, and if so append `iterationPath`.

## Architecture Check

1. Co-locating the scoping helper in `decision-id.ts` keeps all decision-ID logic in one module. Currently `effects-choice.ts` has to understand when `composeDecisionId` does vs doesn't produce unique IDs — the helper encapsulates this.
2. No game-specific logic. This is pure kernel infrastructure for the `chooseOne`/`chooseN` decision resolution pipeline.
3. No backwards-compatibility shims. The helper replaces inline code with an identical-behavior function.

## What to Change

### 1. Add `scopeDecisionIdForIteration` to `decision-id.ts`

```typescript
export const scopeDecisionIdForIteration = (
  baseDecisionId: string,
  internalDecisionId: string,
  iterationPath: string | undefined,
): string => {
  const needsIterationScoping = baseDecisionId === internalDecisionId;
  return needsIterationScoping && iterationPath !== undefined
    ? `${baseDecisionId}${iterationPath}`
    : baseDecisionId;
};
```

### 2. Replace inline scoping in `effects-choice.ts`

In both `applyChooseOne` and `applyChooseN`, replace the 4-line inline pattern with:
```typescript
const decisionId = scopeDecisionIdForIteration(baseDecisionId, effect.chooseOne.internalDecisionId, ctx.iterationPath);
```

Move the explanatory comment to the JSDoc of the new helper.

## Files to Touch

- `packages/engine/src/kernel/decision-id.ts` (modify — add helper)
- `packages/engine/src/kernel/effects-choice.ts` (modify — use helper, remove duplicated inline logic)

## Out of Scope

- Adding `iterationPath` to `removeByPriority` (confirmed unnecessary: it only constructs `moveToken` effects, not decisions)
- Changing `composeDecisionId` signature (the helper wraps it, doesn't modify it)

## Acceptance Criteria

### Tests That Must Pass

1. Existing `legal-choices.test.ts` test "validates sequential dependent choices against progressed state across pipeline stages" — uses scoped decision IDs
2. FITL golden test Turn 8 commitment phase — exercises forEach with static-bind decisions
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. `scopeDecisionIdForIteration` must be a pure function with no side effects
2. Decision IDs produced by the helper must be identical to the current inline logic

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/decision-id.test.ts` — add unit tests for `scopeDecisionIdForIteration`: (a) returns base when `iterationPath` is undefined, (b) returns base when template-resolved (base !== internal), (c) appends path when static and path defined, (d) handles nested paths like `[0][1]`

### Commands

1. `cd packages/engine && node --test dist/test/unit/kernel/decision-id.test.js`
2. `pnpm turbo test --force`
