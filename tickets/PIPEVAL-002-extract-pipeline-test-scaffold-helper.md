# PIPEVAL-002: Extract pipeline test scaffold helper to reduce boilerplate

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — test-only
**Deps**: None

## Problem

The 5 new pipeline zoneProp validation tests each repeat ~40 lines of identical zone definitions and pipeline structure. The test file (`validate-gamedef.test.ts`) already has helpers like `withCardDrivenTurnFlow` and `withSingleActionEffect` for other repeated scaffolds. A `withPipelineStageEffect` helper would follow the same pattern and reduce ~200 lines to ~50.

## Assumption Reassessment (2026-03-05)

1. `validate-gamedef.test.ts` is already ~4200 lines — confirmed. Adding helpers reduces growth pressure.
2. `withSingleActionEffect` at line 45 is the closest existing pattern — returns a GameDef with a customized effect.
3. The zone array with `zoneKind: 'board'` and attributes is what makes `mapSpacePropKinds` non-empty — this setup is reused identically in all 5 tests.

## Architecture Check

1. Test DRY: a helper makes intent clearer — each test only specifies the property name being tested, not the 40-line scaffold.
2. No game-specific logic — the helper uses generic zone/pipeline structures.
3. No backwards-compatibility concern — pure test refactor.

## What to Change

### 1. Add `withPipelineZonePropInStageEffect` helper

In `validate-gamedef.test.ts`, add a helper near the existing `withSingleActionEffect`:

```typescript
const withPipelineZonePropInStageEffect = (prop: string, right: unknown): GameDef => {
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
      stages: [{
        stage: 'resolve',
        effects: [{
          if: {
            when: { op: '==', left: { ref: 'zoneProp', zone: 'market:none', prop }, right },
            then: [],
          },
        }],
      }],
      atomicity: 'atomic',
    }],
  } as unknown as GameDef;
};
```

### 2. Refactor 5 tests to use helper

Replace the inline scaffolds in the `id`, `category`, `population`, `spaceId`, and `badProp` tests.

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
