# DECINSARC-003: Rewrite effect execution to use DecisionScope threading

**Status**: PENDING
**Priority**: HIGH
**Effort**: Large
**Engine Changes**: Yes — `effects-choice.ts`, `effects-control.ts`, `effect-dispatch.ts`
**Deps**: DECINSARC-001, DECINSARC-002

## Problem

Effect execution currently uses mutable `DecisionOccurrenceContext` counters threaded via `EffectContextBase`, a separate `iterationPath` string accumulated in `effects-control.ts`, and ad hoc key construction in `effects-choice.ts`. This ticket rewrites all three to use the immutable `DecisionScope` and codec functions from DECINSARC-001.

This is the largest and most critical ticket in the series — it touches the core effect pipeline.

## Assumption Reassessment (2026-03-13)

1. `effects-choice.ts` (~1110 lines) calls `composeScopedDecisionId()`, `consumeDecisionOccurrence()`, `resolveMoveParamForDecisionOccurrence()` — confirmed, all three call sites need rewriting.
2. `effects-control.ts` — `applyForEach()` accumulates `iterationPath` via string concatenation `${ctx.iterationPath ?? ''}[${iterIdx}]` — confirmed, replace with `withIterationSegment()`.
3. `effect-dispatch.ts` — `applyEffectsWithBudget()` threads context sequentially through effects — confirmed, need to add scope threading alongside existing bindings threading.
4. `applyRollRandom()` in `effects-choice.ts` clones `DecisionOccurrenceContext` per branch — confirmed, immutable scope eliminates clone need.

## Architecture Check

1. Immutable scope threading eliminates the entire class of branch-contamination bugs.
2. `advanceScope()` replaces both `composeScopedDecisionId()` and `consumeDecisionOccurrence()` — two concerns merged into one clean operation.
3. No game-specific logic introduced; all changes are to generic effect machinery.

## What to Change

### 1. Rewrite `effects-choice.ts` — `applyChooseOne()`

- Replace `composeScopedDecisionId()` + `consumeDecisionOccurrence()` with single `advanceScope(ctx.decisionScope, internalDecisionId, resolvedBind)` call
- Use returned `key: DecisionKey` to look up `move.params[key]`
- When constructing `ChoicePendingRequest`, set `decisionKey: key` (single field, no occurrence fields)
- Return `decisionScope` in `EffectResult` so dispatch can thread it forward

### 2. Rewrite `effects-choice.ts` — `applyChooseN()`

- Same pattern as `applyChooseOne()` — replace occurrence machinery with `advanceScope()` + `DecisionKey` lookup

### 3. Rewrite `effects-choice.ts` — `applyRollRandom()`

- In discovery mode: pass `ctx.decisionScope` directly to each branch context (immutable = free isolation, no cloning needed)
- Remove `cloneDecisionOccurrenceContext()` calls
- Branch merging: compare pending decisions by `decisionKey` equality

### 4. Rewrite `effects-control.ts` — `applyForEach()`

- Replace `iterationPath: \`${ctx.iterationPath ?? ''}[${iterIdx}]\`` with `decisionScope: withIterationSegment(ctx.decisionScope, iterIdx)`
- Remove all references to `ctx.iterationPath`

### 5. Rewrite `effect-dispatch.ts` — `applyEffectsWithBudget()`

- Thread `decisionScope` through the effect sequence, same pattern as existing `bindings` threading:
  ```
  let currentScope = ctx.decisionScope;
  // after each effect:
  currentScope = result.decisionScope ?? currentScope;
  ```
- Top-level `applyEffect`/`applyEffects` entry points: create `emptyScope()` as the initial scope (replaces `createDecisionOccurrenceContext()`)

### 6. Remove imports of `decision-occurrence.ts` and `decision-id.ts`

- Remove all imports of `consumeDecisionOccurrence`, `resolveMoveParamForDecisionOccurrence`, `createDecisionOccurrenceContext`, `cloneDecisionOccurrenceContext`, `composeScopedDecisionId` from these three files
- Add imports of `advanceScope`, `withIterationSegment`, `emptyScope`, `formatDecisionKey` from `decision-scope.ts`

## Files to Touch

- `packages/engine/src/kernel/effects-choice.ts` (modify — major rewrite of `applyChooseOne`, `applyChooseN`, `applyRollRandom`)
- `packages/engine/src/kernel/effects-control.ts` (modify — `applyForEach` iteration path handling)
- `packages/engine/src/kernel/effect-dispatch.ts` (modify — scope threading in `applyEffectsWithBudget`, `emptyScope()` at entry points)

## Out of Scope

- Modifying `move-decision-sequence.ts` (DECINSARC-004)
- Modifying `legal-choices.ts` (DECINSARC-004)
- Deleting `decision-occurrence.ts` or `decision-id.ts` (DECINSARC-005)
- Modifying test helpers or tests (DECINSARC-006)
- Modifying runner code (DECINSARC-007)
- Any game-specific logic changes

## Acceptance Criteria

### Tests That Must Pass

1. `applyChooseOne` with a simple bind produces a `ChoicePendingRequest` with correct `decisionKey` (no occurrence fields)
2. `applyChooseOne` with a template bind + resolved value produces `decision:xxx::resolved` format key
3. `applyChooseN` produces the same canonical key format as `applyChooseOne` for equivalent decisions
4. `applyRollRandom` in discovery mode: branches do not contaminate each other's scope
5. `applyRollRandom` merging: identical `decisionKey` across branches merges correctly
6. `applyForEach` produces keys with `[N]` iteration segments
7. Nested `applyForEach` produces keys with `[N][M]` segments
8. `applyEffectsWithBudget` threads scope forward: second decision in sequence gets occurrence `#2` if same base key
9. Separate top-level `applyEffect` calls start with fresh scope (no cross-call leakage)
10. **Note**: Full `pnpm turbo build` may still fail — `move-decision-sequence.ts` and `legal-choices.ts` not yet updated.

### Invariants

1. No mutable `DecisionOccurrenceContext` referenced anywhere in these three files.
2. No `iterationPath` string field referenced on context — absorbed into `DecisionScope`.
3. Stochastic branch isolation is guaranteed by immutability (no explicit cloning).
4. `EffectResult.decisionScope` is set whenever `advanceScope()` is called.
5. `emptyScope()` is the sole entry point for fresh scope creation.

## Test Plan

### New/Modified Tests

1. `packages/engine/test/unit/kernel/effects-choice.test.ts` — update/add tests for `applyChooseOne`, `applyChooseN`, `applyRollRandom` using new `decisionKey` field
2. `packages/engine/test/unit/kernel/effects-control.test.ts` — update `forEach` tests for iteration scope
3. `packages/engine/test/unit/kernel/effect-dispatch.test.ts` — add scope threading tests

### Commands

1. `pnpm -F @ludoforge/engine build`
2. `node --test packages/engine/dist/test/unit/kernel/effects-choice.test.js`
3. `node --test packages/engine/dist/test/unit/kernel/effects-control.test.js`
4. `node --test packages/engine/dist/test/unit/kernel/effect-dispatch.test.js`
