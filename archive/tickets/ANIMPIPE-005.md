# ANIMPIPE-005: arc-bezier preset

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003

## Problem

The ticket originally assumed `arc-tween` was linear. That is no longer true in current code: `arc-tween` already uses a two-phase midpoint lift. The remaining quality gaps are architectural consistency and motion polish:
- Arc timing is duplicated/hard-coded in the tween factory instead of being derived from preset defaults.
- Arc segments do not explicitly set easing, so motion is less intentional than intended.
- Tests do not fully assert duration/easing invariants for arc motion.

## Assumption Reassessment (2026-02-21)

1. `arc-tween` in `packages/runner/src/animation/preset-registry.ts` already creates a two-phase arc (`from -> mid -> to`) with distance-based lift. The original linear-motion assumption was incorrect.
2. `arc-tween` compatibility mapping is already correct: `['moveToken', 'cardDeal', 'cardBurn']`.
3. Current arc implementation uses hard-coded `0.2 + 0.2` durations rather than deriving segment timing from preset default duration contract (`0.4`), creating drift risk if metadata changes.
4. Current arc implementation omits explicit easing; no `ease` is currently passed to GSAP for arc segments.
5. There is no per-descriptor duration field in animation descriptors; "duration config when provided" is out of scope for this ticket as currently architected.

## Architecture Check

1. Keep preset ID `arc-tween` and existing kind mapping; improve internals only.
2. Avoid introducing new preset IDs/aliases. Replace implementation behavior in place.
3. Make timing robust by deriving segment durations from one source of truth (preset default duration), preventing metadata/factory divergence.
4. Add explicit easing for both arc segments (`power2.inOut`) to improve motion quality with no extra dependency.
5. No new runtime dependencies required.

## What to Change

### 1. Refine `arc-tween` implementation (no ID changes)

Modify `packages/runner/src/animation/preset-registry.ts`:

Adjust the existing `arc-tween` factory to:
- Preserve midpoint/lift behavior already present.
- Derive half-duration from a single `arc-tween` default duration constant (no duplicated magic numbers).
- Apply `power2.inOut` easing on both arc segments.

### 2. Keep metadata mapping unchanged but enforce contract through tests

Keep compatible kinds the same: `['moveToken', 'cardDeal', 'cardBurn']`.
Update tests to assert:
- two tween calls are emitted
- each call uses half of the preset default duration
- both calls apply `power2.inOut`
- lift remains proportional with minimum 20px

## Files to Touch

- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/test/animation/preset-registry.test.ts` (modify)

## Out of Scope

- card-flip-3d preset (ANIMPIPE-006)
- counter-tick and banner-overlay presets (ANIMPIPE-007)
- Sequencing changes (ANIMPIPE-004)

## Acceptance Criteria

### Tests That Must Pass

1. `arc-bezier` creates two-phase tween (from→mid, mid→to)
2. Lift height is proportional to distance
3. Compatible kinds are `['moveToken', 'cardDeal', 'cardBurn']`
4. Arc segment duration is derived from `arc-tween` default duration (half + half)
5. Both arc segments apply `power2.inOut` easing
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Preset ID `arc-tween` still resolves correctly (same ID, new implementation)
2. All existing descriptor kinds that used `arc-tween` continue to work

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/preset-registry.test.ts` — strengthen `arc-tween` tests for easing and default-duration-derived segment timing

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/preset-registry.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-02-21
- What changed:
  - Corrected ticket assumptions and scope to reflect current implementation reality (arc motion already existed).
  - Updated `arc-tween` implementation to derive segment duration from a single default-duration constant.
  - Added explicit `power2.inOut` easing to both arc tween segments.
  - Strengthened arc tests to assert easing and default-duration-derived segment timing.
- Deviations from original plan:
  - Did not introduce a new `arc-bezier` preset ID or metadata remap because no aliasing/back-compat layer is desired and existing `arc-tween` already represented the intended arc behavior.
  - Removed obsolete acceptance criteria about per-descriptor duration config because that capability is not present in current descriptor architecture.
- Verification results:
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/preset-registry.test.ts` passed.
  - `pnpm -F @ludoforge/runner test` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
