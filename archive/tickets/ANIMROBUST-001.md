# ANIMROBUST-001: Fail-fast animation sprite validation

**Status**: ✅ COMPLETED
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
4. **Existing test baseline is broader than setup-only**: There are multiple tests in `timeline-builder.test.ts` that currently rely on silent skip behavior in normal play (for example `silently skips descriptors with missing sprite references` at line 152, plus missing guard tests at lines 378 and 407). These must be updated, not only the setup test.
5. **Setup trace test**: Confirmed at `timeline-builder.test.ts:686-721` — setup trace with missing containers is expected and must remain non-throwing.
6. **Controller error handling behavior**: `createAnimationController` already wraps `buildTimeline` in `try/catch` and reports `Timeline build failed.` (`animation-controller.ts:146-182`, test at `animation-controller.test.ts:988-1034`). Throwing from timeline build will fail-fast for the current trace while preserving controller liveness for future traces.
7. **buildTimeline call site**: At line 38 — `filterVisualDescriptors(descriptors, spriteRefs)` is called before the `isSetupTrace` check at line 40. The function needs the flag to differentiate.

## Architecture Check

1. **Fail-fast during play is an architectural improvement**: Missing sprite references in normal play are consistency violations between state and render graph. Throwing at timeline construction exposes these violations immediately instead of masking them as "missing animation."
2. **Setup trace must remain permissive**: Setup processing can observe transiently missing token containers; this is legitimate initialization behavior. Keeping setup as "skip missing descriptors" preserves startup robustness.
3. **Controller-level resilience remains intact**: Because the controller catches timeline build errors, fail-fast does not crash the animation system; it fails a bad trace and continues with future traces.
4. **No game-specific coupling**: The strict-vs-permissive split is based on lifecycle context (`isSetupTrace`) and remains engine-agnostic.
5. **Long-term ideal shape (not in this ticket)**: Replace the boolean parameter with an explicit validation mode (for example `spriteValidation: 'strict' | 'permissive'`) to make policy intent clearer and extensible. Out of scope for this small ticket.

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

### 4. Update existing normal-play silent-skip tests

Replace or adjust tests that currently assert silent skip in normal play so they assert fail-fast throwing behavior instead.

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

1. During normal play (`isSetupTrace: false`): `buildTimeline` throws when a descriptor has a missing sprite reference
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
   - Modify existing normal-play silent-skip test to verify throw on missing sprite during normal play (default `isSetupTrace=false`)
   - Keep existing setup trace behavior test to verify silent skip remains in setup
   - Add/modify assertion verifying error message contains descriptor kind and missing-sprite reason details

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter verbose timeline-builder`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`

## Outcome

- **Completion date**: 2026-02-21
- **What changed**:
  - `timeline-builder` now enforces strict missing-sprite validation during normal play by throwing with descriptor kind + missing reason.
  - Timeline setup uses explicit policy options (`spriteValidation: 'permissive'`, `initializeTokenVisibility: true`) instead of `isSetupTrace`.
  - Permissive validation keeps setup traces tolerant of missing sprite references.
  - Runner animation tests were updated to reflect strict normal-play behavior and preserved setup-trace skip semantics.
- **Deviation from original plan**:
  - Scope expanded slightly in tests: multiple existing normal-play silent-skip tests were updated, not only one setup-focused test.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- --reporter verbose timeline-builder`
  - `pnpm -F @ludoforge/runner typecheck`
  - `pnpm -F @ludoforge/runner lint`
