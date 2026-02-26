# ENGINEARCH-075: Extract forEach iteration decision-ID scoping into `decision-id.ts` helper

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: Yes — `packages/engine/src/kernel/decision-id.ts`, `packages/engine/src/kernel/effects-choice.ts`
**Deps**: None

## Problem

The forEach iteration scoping logic for decision IDs is duplicated identically in both `applyChooseOne` and `applyChooseN` within `effects-choice.ts`. This violates DRY and places scoping logic far from the `composeDecisionId` function it conceptually extends.

## Assumption Reassessment (2026-02-26)

1. `composeDecisionId` in `decision-id.ts` handles template-based uniqueness (bind templates with `{$var}` references). Confirmed current code at `decision-id.ts:1-12`.
2. `iterationPath` on `EffectContext` was added to scope static-bind decisions inside forEach. Confirmed in `effect-context.ts:50-51`.
3. The duplicated pattern in `applyChooseOne` and `applyChooseN` is still identical in logic: when `composeDecisionId` returns the unmodified `internalDecisionId`, append `iterationPath`; otherwise keep the templated ID.
4. Ticket test references were partially stale:
   - `packages/engine/test/unit/kernel/decision-id.test.ts` does not exist in current tree.
   - No current FITL test explicitly named as a "Turn 8 commitment phase golden" test.
5. Current relevant coverage anchors are:
   - `packages/engine/test/unit/kernel/legal-choices.test.ts` test: `validates sequential dependent choices against progressed state across pipeline stages`
   - `packages/engine/test/integration/fitl-commitment-phase.test.ts`
   - `packages/engine/test/integration/fitl-coup-commitment-phase.test.ts`

## Architecture Check

1. Co-locating the scoping helper in `decision-id.ts` keeps all decision-ID logic in one module. Currently `effects-choice.ts` has to understand when `composeDecisionId` does vs doesn't produce unique IDs; the helper encapsulates this with one invariant-bearing function.
2. No game-specific logic. This is pure kernel infrastructure for the `chooseOne`/`chooseN` decision resolution pipeline.
3. No backwards-compatibility shims. The helper replaces inline code with identical behavior, then tests lock the invariant.

### Architecture Verdict

This change is beneficial vs current architecture: it removes duplicated control logic, centralizes a subtle identity-vs-template decision rule, and makes future extension points explicit (single place to evolve decision ID scoping semantics). Given no compatibility/aliasing requirement, this is the cleaner long-term shape than keeping repeated ad-hoc branching in effect handlers.

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
2. Existing FITL commitment integration tests:
   - `packages/engine/test/integration/fitl-commitment-phase.test.ts`
   - `packages/engine/test/integration/fitl-coup-commitment-phase.test.ts`
3. Existing suite: `pnpm turbo test --force`

### Invariants

1. `scopeDecisionIdForIteration` must be a pure function with no side effects
2. Decision IDs produced by the helper must be identical to the current inline logic

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/decision-id.test.ts` — add unit tests for `scopeDecisionIdForIteration`: (a) returns base when `iterationPath` is undefined, (b) returns base when template-resolved (base !== internal), (c) appends path when static and path defined, (d) handles nested paths like `[0][1]`
2. `packages/engine/test/unit/effects-choice.test.ts` — add regression tests to assert:
   - static bind IDs get `iterationPath` suffix when pending choice is produced
   - templated bind IDs do not receive additional `iterationPath` suffix

### Commands

1. `pnpm turbo build`
2. `cd packages/engine && node --test dist/test/unit/decision-id.test.js dist/test/unit/effects-choice.test.js dist/test/unit/kernel/legal-choices.test.js`
3. `cd packages/engine && node --test dist/test/integration/fitl-commitment-phase.test.js dist/test/integration/fitl-coup-commitment-phase.test.js`
4. `pnpm turbo test --force`
5. `pnpm turbo lint`

## Outcome

- Completion date: 2026-02-26
- What actually changed:
  - Added `scopeDecisionIdForIteration` to `packages/engine/src/kernel/decision-id.ts`.
  - Replaced duplicated inline iteration-scoping logic in `applyChooseOne` and `applyChooseN` (`packages/engine/src/kernel/effects-choice.ts`) with the new helper.
  - Added `packages/engine/test/unit/decision-id.test.ts` with helper-level invariants and edge-case coverage.
  - Added regression tests in `packages/engine/test/unit/effects-choice.test.ts` for static-bind iteration suffixing and templated-bind non-suffixing.
  - Fixed `packages/engine/test/helpers/effect-context-test-helpers.ts` to preserve `iterationPath` in test contexts (required to correctly validate scoping behavior).
- Deviations from original plan:
  - Updated stale test assumptions in this ticket:
    - `packages/engine/test/unit/kernel/decision-id.test.ts` path did not exist; actual test added at `packages/engine/test/unit/decision-id.test.ts`.
    - FITL "Turn 8 commitment golden" reference was replaced with current commitment integration tests.
  - Included one additional test-helper fix discovered via failing regression test; no production kernel behavior change beyond the intended helper extraction.
- Verification results:
  - `pnpm turbo build` passed.
  - Targeted engine tests passed:
    - `dist/test/unit/decision-id.test.js`
    - `dist/test/unit/effects-choice.test.js`
    - `dist/test/unit/kernel/legal-choices.test.js`
    - `dist/test/integration/fitl-commitment-phase.test.js`
    - `dist/test/integration/fitl-coup-commitment-phase.test.js`
  - `pnpm turbo test --force` passed (`@ludoforge/engine` and `@ludoforge/runner`).
  - `pnpm turbo lint` passed.
