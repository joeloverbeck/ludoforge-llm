# PIPEVAL-002: Extract pipeline test scaffold helper to reduce boilerplate

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: None

## Problem

The 5 new pipeline zoneProp validation tests each repeat ~40 lines of identical zone definitions and pipeline structure. The test file (`validate-gamedef.test.ts`) already has helpers like `withCardDrivenTurnFlow` and `withSingleActionEffect` for other repeated scaffolds. A `withPipelineStageEffect` helper would follow the same pattern and reduce ~200 lines to ~50.

## Assumption Reassessment (2026-03-05)

1. `validate-gamedef.test.ts` is already 4262 lines — confirmed.
2. There is no `withSingleActionEffect` helper in this file. The existing top-level helper is `withCardDrivenTurnFlow`, which is unrelated to pipeline `zoneProp` scaffolding.
3. The repeated setup (board zone + aux zone + `actionPipelines[0]`) appears in 5 nearby tests, but only 4 use `stages[0].effects`; 1 uses `costEffects`.
4. The board zone with `category` plus `attributes` is the shared prerequisite that enables map-space property validation for these tests.

## Architecture Check

1. A helper is still beneficial: it centralizes the invariant test scaffold and keeps each test focused on the property under validation.
2. A stage-only helper is insufficient for current duplication because one of the five tests validates the same `zoneProp` semantics via `costEffects`.
3. A single generic helper that can target `stage` or `cost` surfaces is cleaner and more extensible than one-off helpers per surface.
4. No game-specific logic is introduced; this remains generic test infrastructure.
5. No backwards-compatibility concern; this is a structural test refactor with unchanged assertions.

## What to Change

### 1. Add a generalized pipeline `zoneProp` scaffold helper

In `validate-gamedef.test.ts`, add a helper near `withCardDrivenTurnFlow` that builds the shared zone and pipeline skeleton, then places the condition under either:

1. `actionPipelines[0].stages[0].effects[0].if.when` (stage surface), or
2. `actionPipelines[0].costEffects[0].if.when` (cost surface).

Suggested signature:

```typescript
const withPipelineZonePropCondition = (
  prop: string,
  right: unknown,
  surface: 'stage' | 'cost' = 'stage',
): GameDef => {
  const base = createValidGameDef();
  return {
    ...base,
    zones: [
      {
        id: 'market:none', zoneKind: 'board', owner: 'none', visibility: 'public',
        ordering: 'set', category: 'city',
        attributes: { population: 2, country: 'southVietnam' }, adjacentTo: [],
      },
      { id: 'deck:none', zoneKind: 'aux', owner: 'none', visibility: 'hidden', ordering: 'stack' },
    ],
    actionPipelines: [{
      id: 'profile-a', actionId: 'playCard', legality: null,
      costValidation: null, costEffects: [], targeting: {},
      costEffects: surface === 'cost'
        ? [{ if: { when: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop }, right }, then: [] } }]
        : [],
      stages: [{
        stage: 'resolve',
        effects: surface === 'stage'
          ? [{ if: { when: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop }, right }, then: [] } }]
          : [],
      }],
      atomicity: 'atomic',
    }],
  } as unknown as GameDef;
};
```

### 2. Refactor 5 tests to use helper

Replace inline scaffolds in:

1. `reports unknown zoneProp in pipeline stage effects` (`spaceId`, stage)
2. `accepts valid zoneProp id in pipeline stage effects` (`id`, stage)
3. `accepts valid zoneProp category in pipeline stage effects` (`category`, stage)
4. `accepts valid attribute prop in pipeline stage effects` (`population`, stage)
5. `reports unknown zoneProp in pipeline costEffects` (`badProp`, cost)

## Files to Touch

- `packages/engine/test/unit/validate-gamedef.test.ts` (modify)

## Out of Scope

- Moving the helper to `test/helpers/` (it's specific to this test file)
- Refactoring other test boilerplate

## Acceptance Criteria

### Tests That Must Pass

1. All 5 pipeline zoneProp tests still pass with identical assertions
2. Existing suite: `pnpm turbo test --force`

### Invariants

1. No test behavior change — purely structural refactor

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/validate-gamedef.test.ts` — refactor only, no new tests

### Commands

1. `pnpm turbo build && pnpm turbo test --force`

## Outcome

- Completion date: 2026-03-05
- What changed:
  - Added `withPipelineZonePropCondition(prop, right, surface)` to `packages/engine/test/unit/validate-gamedef.test.ts`.
  - Refactored 5 pipeline `zoneProp` tests to use the helper (4 stage-surface tests, 1 cost-surface test).
  - Preserved all existing assertions and diagnostic path expectations.
- Deviations from original plan:
  - Original plan proposed a stage-only helper (`withPipelineZonePropInStageEffect`).
  - Implementation used a generalized stage/cost helper because current duplication spans both surfaces.
- Verification results:
  - `pnpm -F @ludoforge/engine test:unit -- validate-gamedef` passed.
  - `pnpm turbo build` passed.
  - `pnpm turbo test --force` passed.
  - `pnpm turbo lint` passed.
