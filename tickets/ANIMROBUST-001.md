# ANIMROBUST-001: Fail-fast animation sprite validation

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small
**Engine Changes**: None — runner-only
**Deps**: None

## Problem

The `filterVisualDescriptors` function in `timeline-builder.ts:91-113` silently skips descriptors with missing sprite references regardless of context. During setup trace processing this is expected — sprites for newly created tokens may not exist yet. During normal play, a missing sprite indicates a bug (e.g. the canvas layer failed to create a container for a token). Silent skipping during play hides these bugs, making them hard to diagnose.

## Assumption Reassessment (2026-02-21)

1. **filterVisualDescriptors signature**: Confirmed at `timeline-builder.ts:91-93` — takes `descriptors` and `spriteRefs`, no `isSetupTrace` parameter. The setup/play distinction is not available inside this function.
2. **isSetupTrace availability**: Confirmed at `timeline-builder.ts:24` — `BuildTimelineOptions` has `readonly isSetupTrace?: boolean`. It's available in `buildTimeline` (line 40) but not passed to `filterVisualDescriptors`.
3. **Current skip behavior**: At lines 105-108 — `getMissingSpriteReason` returns a reason, the descriptor is silently skipped with `lastSourceSkipped = true`. No warning, no error.
4. **Setup trace test**: Confirmed at `timeline-builder.test.ts:711-717` — test verifies "During setup trace, missing containers are expected — no warning". This behavior must be preserved.
5. **buildTimeline call site**: At line 38 — `filterVisualDescriptors(descriptors, spriteRefs)` is called before the `isSetupTrace` check at line 40. The function needs the flag to differentiate.

## Architecture Check

1. **Fail-fast during play**: Throwing on missing sprites during normal play surfaces bugs immediately at the animation layer rather than silently degrading the visual experience. This follows the project's "root cause analysis" and "failure investigation" rules.
2. **Silent skip during setup**: Setup traces legitimately reference tokens whose sprites haven't been created yet. Throwing here would break initialization. The context flag cleanly separates the two behaviors.
3. **No game-specific logic**: The setup/play distinction is a generic animation lifecycle concept, not game-specific. No game branching introduced.

## What to Change

### 1. Add isSetupTrace parameter to filterVisualDescriptors

Change the function signature to accept a third parameter:
```typescript
function filterVisualDescriptors(
  descriptors: readonly AnimationDescriptor[],
  spriteRefs: TimelineSpriteRefs,
  isSetupTrace: boolean,
): readonly VisualAnimationDescriptor[]
```

### 2. Implement context-aware handling of missing sprites

In the body where `getMissingSpriteReason` returns non-null:
- If `isSetupTrace` is `true`: silent skip (current behavior)
- If `isSetupTrace` is `false`: throw an error with the missing sprite reason, descriptor kind, and relevant IDs (tokenId, zoneId) for debuggability

### 3. Update buildTimeline call site

Pass `options?.isSetupTrace ?? false` as the third argument to `filterVisualDescriptors` at line 38.

## Files to Touch

- `packages/runner/src/animation/timeline-builder.ts` (modify)
- `packages/runner/test/animation/timeline-builder.test.ts` (modify)

## Out of Scope

- Changes to `getMissingSpriteReason` internals
- Changes to `prepareTokensForAnimation`
- Animation controller changes
- Logging infrastructure for warnings

## Acceptance Criteria

### Tests That Must Pass

1. During normal play (`isSetupTrace: false`): `filterVisualDescriptors` throws when a descriptor has a missing sprite reference
2. During setup trace (`isSetupTrace: true`): `filterVisualDescriptors` silently skips descriptors with missing sprites (existing behavior preserved)
3. Error message includes the descriptor kind and missing sprite reason for debuggability
4. Existing setup trace tests continue to pass
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Setup trace processing never throws on missing sprites
2. Normal play processing always throws on missing sprites (fail-fast)
3. No behavioral change to descriptors that have valid sprite references

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/timeline-builder.test.ts` — add/modify tests:
   - New: verify throw on missing sprite during normal play (isSetupTrace false/absent)
   - Existing: verify silent skip during setup trace still passes (test at line 711)
   - New: verify error message contains descriptor kind and reason

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter verbose timeline-builder`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
