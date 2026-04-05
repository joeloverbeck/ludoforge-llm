# 113PREVSTPOLSUR-003: Evaluate preview-feature refs against preview state

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: Yes — agent evaluation core, agent runtime, agent preview
**Deps**: `archive/tickets/113PREVSTPOLSUR-002.md`, `specs/113-preview-state-policy-surface.md`

## Problem

When `resolveRef()` encounters a `previewStateFeature` ref kind, it must evaluate the corresponding state feature expression against the preview post-move state rather than the current state. Currently, `evaluateStateFeature()` is hardcoded to use `this.input.state` and there is no mechanism to swap the state for a preview state.

## Assumption Reassessment (2026-04-05)

1. `PolicyEvaluationContext.resolveRef()` at `policy-evaluation-core.ts:669-707` dispatches on `ref.refKind` — confirmed.
2. `evaluateStateFeature()` at `policy-evaluation-core.ts:255-264` uses `this.evaluateExpr(feature.expr, undefined)` which reads from `this.input.state` — confirmed.
3. `stateFeatureCache` at `policy-evaluation-core.ts:209` uses feature ID as key — confirmed, needs namespacing.
4. Preview state is available in `PolicyPreviewRuntime` cache as `PreviewOutcome.state` — confirmed at `policy-preview.ts:102-123`.
5. The candidate is available during `resolveRef()` calls — confirmed, passed as parameter.

## Architecture Check

1. The spec's "Keep feature ownership DRY" goal (section 4) is preserved: one authored feature definition, two evaluation contexts. The same compiled expression is evaluated against different states.
2. Cache namespacing prevents pollution: `preview:vcGuerrillaCount` vs `vcGuerrillaCount`.
3. Preview-unavailable → `undefined` follows existing preview ref semantics (no silent fallback).
4. Engine-agnostic: evaluates any game's state features against any game's preview state.

## What to Change

### 1. Add `previewStateFeature` case to `resolveRef()` (`policy-evaluation-core.ts`)

In the `case 'library':` switch on `ref.refKind`:

```typescript
case 'previewStateFeature': {
  // Get preview state for this candidate
  const previewState = this.getPreviewStateForCandidate(candidate);
  if (previewState === undefined) {
    // Preview unavailable — track as unknown and return undefined
    candidate?.unknownPreviewRefs.set(`feature.${ref.id}`, 'unresolved');
    return undefined;
  }
  candidate?.previewRefIds.add(`feature.${ref.id}`);
  return this.evaluateStateFeatureAgainstState(ref.id, previewState);
}
```

### 2. Add `evaluateStateFeatureAgainstState()` method (`policy-evaluation-core.ts`)

Create a method that evaluates a state feature expression against a given state (not necessarily `this.input.state`). This method:
- Looks up the feature in the catalog
- Creates a temporary evaluation scope with the given state
- Evaluates the feature expression
- Caches the result with a `preview:` prefix key

```typescript
private evaluateStateFeatureAgainstState(
  featureId: string,
  state: GameState,
): PolicyValue {
  const cacheKey = `preview:${featureId}`;
  const cached = this.stateFeatureCache.get(cacheKey);
  if (cached !== undefined) return cached;
  
  const feature = this.input.catalog.stateFeatures[featureId];
  if (feature === undefined) return undefined;
  
  // Evaluate expression with swapped state
  const value = this.evaluateExprWithState(feature.expr, state);
  this.stateFeatureCache.set(cacheKey, value);
  return value;
}
```

### 3. Add `evaluateExprWithState()` or state-swapping mechanism (`policy-evaluation-core.ts`)

The expression evaluator reads state from `this.input.state` throughout. For preview-feature evaluation, the state must be temporarily swapped. Options:
- Save `this.input.state`, swap, evaluate, restore (simple but requires careful error handling)
- Create a lightweight evaluation scope object with the swapped state
- Pass state as a parameter through the evaluation chain

The simplest approach: store the "active state" as a mutable field on the context, defaulting to `this.input.state`, and swap it during preview-feature evaluation. Restore after evaluation (in a try/finally).

### 4. Add `getPreviewStateForCandidate()` method (`policy-evaluation-core.ts`)

Extract the preview state from the runtime provider for the given candidate:

```typescript
private getPreviewStateForCandidate(
  candidate: PolicyEvaluationCandidate | undefined,
): GameState | undefined {
  if (candidate === undefined) return undefined;
  return this.runtimeProviders.previewSurface.getPreviewState?.(candidate);
}
```

### 5. Expose preview state from `PolicyPreviewRuntime` (`policy-preview.ts` and `policy-runtime.ts`)

Add a `getPreviewState(candidate)` method to the preview runtime interface that returns the cached preview `GameState` for a candidate (or undefined if preview failed/unavailable).

## Files to Touch

- `packages/engine/src/agents/policy-evaluation-core.ts` (modify)
- `packages/engine/src/agents/policy-preview.ts` (modify)
- `packages/engine/src/agents/policy-runtime.ts` (modify)
- `packages/engine/test/agents/policy-preview-feature-eval.test.ts` (new)

## Out of Scope

- No compilation changes (ticket 002)
- No type/schema changes (ticket 001)
- No diagnostics or cookbook (ticket 004)
- No changes to how `feature.*` (non-preview) refs are evaluated

## Acceptance Criteria

### Tests That Must Pass

1. `preview.feature.vcGuerrillaCount` evaluates against preview state (returns different value from `feature.vcGuerrillaCount` when preview state differs)
2. Cache isolation: `feature.X` and `preview.feature.X` return different cached values when states differ
3. Preview unavailable (`random`/`hidden`/`unresolved`/`failed`) → returns `undefined`, tracked in `unknownPreviewRefs`
4. `tolerateStochastic` preview still evaluates `preview.feature.*` against the stochastic preview state and records `previewOutcome: 'stochastic'`
5. Preview available → tracked in `previewRefIds`
6. Same candidate evaluated twice → second call returns cached value
7. No candidate context (state-feature scope, not candidate scope) → returns `undefined` (preview requires a candidate)
8. Existing `feature.*` evaluation unchanged (regression)
9. Existing suite: `pnpm -F @ludoforge/engine test`

### Invariants

1. `evaluateStateFeature()` (non-preview) is UNCHANGED — only the new `evaluateStateFeatureAgainstState()` uses a different state
2. Preview-feature evaluation is deterministic: same candidate + same preview state = same result
3. State swapping is safely restored even on evaluation errors (try/finally)
4. No mutation of the preview state during feature evaluation (Foundation 11)

## Test Plan

### New/Modified Tests

1. Extend the live owning unit test surfaces under `packages/engine/test/unit/agents/` for preview-feature evaluation: different results on different states, cache isolation, unavailable preview, tolerated stochastic preview, and regression for non-preview features

### Commands

1. `pnpm -F @ludoforge/engine build && node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-runtime.test.js`
2. `pnpm -F @ludoforge/engine test`

## Outcome

- Completed: 2026-04-05
- What changed:
  - `previewStateFeature` refs now evaluate authored state features against the resolved preview state in `policy-evaluation-core.ts`.
  - Preview-state evaluation is state-scoped end to end: state-feature caches, zone read contexts, current-surface resolution, and turn/seat intrinsics now follow the active evaluation state rather than always reading the base state.
  - `policy-preview.ts` and `policy-runtime.ts` now expose preview state for resolved candidates so preview-feature evaluation can reuse the existing preview cache.
  - The live owning tests in `packages/engine/test/unit/agents/policy-eval.test.ts` and `packages/engine/test/unit/agents/policy-runtime.test.ts` now cover preview-state feature evaluation, unavailable preview handling, and tolerated stochastic preview.
- Deviations from original plan:
  - The ticket's original acceptance text treated stochastic preview as unavailable. Reassessment against `docs/FOUNDATIONS.md`, the live preview contract, and Spec 113 corrected the boundary: `preview.feature.*` remains value-bearing for `stochastic` preview in `tolerateStochastic` mode, and only `random`/`hidden`/`unresolved`/`failed` are unavailable.
  - The ticket's named new test file was stale; implementation extended the existing owning unit test modules instead.
- Verification:
  - `pnpm -F @ludoforge/engine build`
  - `node --test packages/engine/dist/test/unit/agents/policy-eval.test.js packages/engine/dist/test/unit/agents/policy-runtime.test.js`
  - `pnpm -F @ludoforge/engine test` (`468/468` passing)
