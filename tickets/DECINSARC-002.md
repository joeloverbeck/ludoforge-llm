# DECINSARC-002: Collapse ChoicePendingRequest fields and update EffectContextBase / EffectResult types

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — `types-core.ts`, `effect-context.ts`
**Deps**: DECINSARC-001

## Problem

`ChoicePendingRequest` carries 9 occurrence-related fields (`decisionId`, `occurrenceIndex`, `occurrenceKey`, `nameOccurrenceIndex`, `nameOccurrenceKey`, `canonicalAlias`, `canonicalAliasOccurrenceIndex`, `canonicalAliasOccurrenceKey`) that all describe what is conceptually one identity. `EffectContextBase` has optional `decisionOccurrences` and `iterationPath` fields with unclear ownership. This ticket collapses these into clean types.

**Important**: This ticket changes TYPE DEFINITIONS only. It will intentionally break compilation across many files. The subsequent tickets (DECINSARC-003 through DECINSARC-007) fix those compilation errors. The purpose of landing types first is to let the compiler guide the migration.

## Assumption Reassessment (2026-03-13)

1. `ChoicePendingRequest` in `types-core.ts` lines 620–639 has exactly the 9 occurrence fields listed — confirmed.
2. `EffectContextBase` in `effect-context.ts` lines 47–59 has `decisionOccurrences?: DecisionOccurrenceContext` and `iterationPath?: string` as optional fields — confirmed.
3. `EffectResult` in `effect-context.ts` does NOT currently have a `decisionScope` field — confirmed, needs adding.
4. `ChoicePendingRequest` also has `decisionPlayer?: PlayerId` which the spec renames to `chooser?: PlayerId` — but existing code uses `decisionPlayer`. Keep `decisionPlayer` to minimize churn.

## Architecture Check

1. Collapsing 9 fields to 1 `decisionKey: DecisionKey` eliminates an entire class of alias-collision bugs.
2. Making `decisionScope` required on `EffectContextBase` removes defensive optional checks throughout effect code.
3. Adding `decisionScope` to `EffectResult` enables immutable scope threading without mutation.

## What to Change

### 1. Modify `ChoicePendingRequest` in `types-core.ts`

- Add: `readonly decisionKey: DecisionKey` (import from `decision-scope.ts`)
- Remove: `decisionId`, `occurrenceIndex`, `occurrenceKey`, `nameOccurrenceIndex`, `nameOccurrenceKey`, `canonicalAlias`, `canonicalAliasOccurrenceIndex`, `canonicalAliasOccurrenceKey`
- Keep: `kind`, `complete`, `decisionPlayer`, `name`, `type`, `options`, `targetKinds`, `min`, `max`, `reason`

### 2. Modify `EffectContextBase` in `effect-context.ts`

- Add: `readonly decisionScope: DecisionScope` (required, imported from `decision-scope.ts`)
- Remove: `decisionOccurrences?: DecisionOccurrenceContext` and `iterationPath?: string`

### 3. Modify `EffectResult` in `effect-context.ts`

- Add: `readonly decisionScope?: DecisionScope`

### 4. Update context factory functions in `effect-context.ts`

- `createExecutionEffectContext()`, `createDiscoveryStrictEffectContext()`, `createDiscoveryProbeEffectContext()`: accept `decisionScope` parameter (default to `emptyScope()`), remove `decisionOccurrences` initialization.

### 5. Update `ChoiceStochasticPendingRequest` if it mirrors occurrence fields

- Check whether `ChoiceStochasticPendingRequest` also has occurrence fields that need collapsing. Update accordingly.

## Files to Touch

- `packages/engine/src/kernel/types-core.ts` (modify)
- `packages/engine/src/kernel/effect-context.ts` (modify)

## Out of Scope

- Fixing compilation errors in consumer files (DECINSARC-003 through DECINSARC-007 handle those)
- Modifying `decision-occurrence.ts` or `decision-id.ts` (DECINSARC-004)
- Modifying any effect execution code (DECINSARC-003, DECINSARC-004)
- Modifying runner code (DECINSARC-007)
- Modifying test files or test helpers (DECINSARC-006)
- Adding or removing kernel exports (already done in DECINSARC-001)

## Acceptance Criteria

### Tests That Must Pass

1. Typecheck of `types-core.ts` and `effect-context.ts` themselves passes (the files internally consistent)
2. `DecisionKey` import from `decision-scope.ts` resolves correctly
3. `DecisionScope` import from `decision-scope.ts` resolves correctly
4. Factory functions produce contexts with `decisionScope: emptyScope()` by default
5. **Note**: Full `pnpm turbo build` will FAIL after this ticket — that is expected. The type changes intentionally break consumers to guide subsequent tickets.

### Invariants

1. `ChoicePendingRequest.decisionKey` is the sole decision identity field — no occurrence fields remain.
2. `EffectContextBase.decisionScope` is required (not optional).
3. `EffectResult.decisionScope` is optional (for threading — only set when scope advanced).
4. No game-specific identifiers appear in the modified types.
5. `ChoicePendingRequest` retains `name` field for display/binding purposes.

## Test Plan

### New/Modified Tests

1. No new test files — type changes are verified by compilation
2. Existing tests will fail to compile until DECINSARC-003+ are applied

### Commands

1. `pnpm -F @ludoforge/engine exec tsc --noEmit -- packages/engine/src/kernel/types-core.ts packages/engine/src/kernel/effect-context.ts` (targeted typecheck)
2. Full suite deferred to after DECINSARC-005
