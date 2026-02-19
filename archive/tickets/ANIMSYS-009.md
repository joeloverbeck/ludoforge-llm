# ANIMSYS-009: Reduced Motion + Phase Announcements Accessibility

**Status**: ✅ COMPLETED
**Priority**: MEDIUM
**Effort**: Small-Medium
**Engine Changes**: None
**Deps**: archive/tickets/ANIMSYS-006.md, archive/tickets/ANIMSYS-008.md

## Reassessed Baseline (Code + Tests)

Current runner state differs from the original assumptions:

1. `AnimationController` already exposes `setReducedMotion(reduced: boolean)` and currently fast-forwards timelines when reduced motion is enabled.
2. `GameCanvas` does not currently detect `prefers-reduced-motion` and does not wire any media-query listener to `AnimationController`.
3. `packages/runner/src/animation/reduced-motion.ts` does not exist.
4. `createAriaAnnouncer()` already provides a reusable live region, but phase-transition announcements are not currently emitted from runtime state changes.
5. Existing tests already cover controller reduced-motion behavior (`packages/runner/test/animation/animation-controller.test.ts`) and announcer semantics (`packages/runner/test/canvas/interactions/aria-announcer.test.ts`), but there is no test coverage for media-query wiring or phase-change announcements from `GameCanvas` runtime.
6. Spec 40 mentions "phase banner visibility for ~0.5s", but built-in preset tween factories are still placeholders (`NOOP_TWEEN_FACTORY`). Enforcing banner timing in this ticket would add policy in the wrong layer before concrete banner tween implementation exists.

## Problem

Spec 40 requires accessibility behavior for:

- `prefers-reduced-motion` detection,
- dynamic media-query updates at runtime,
- deterministic textual phase announcements via ARIA live region.

The runtime is currently missing these integration points.

## Scope (Updated)

- Add a reduced-motion observer module that wraps `matchMedia('(prefers-reduced-motion: reduce)')` with safe subscribe/unsubscribe behavior.
- Wire reduced-motion state into `AnimationController` from `GameCanvas` runtime, including dynamic updates.
- Announce phase changes through the existing ARIA live region from `GameCanvas` runtime state subscriptions.
- Keep behavior game-agnostic and deterministic (derived only from `renderModel` phase fields).
- Extend tests to cover reduced-motion observer behavior and runtime wiring.

## Architecture Rationale

These changes are more robust than the current architecture because they:

1. isolate browser media-query behavior behind a dedicated module instead of scattering `window.matchMedia` calls in canvas runtime code;
2. keep `AnimationController` focused on playback policy while `GameCanvas` handles environment integration and subscriptions;
3. reuse the existing live-region announcer rather than introducing a second accessibility channel;
4. avoid premature banner-duration coupling in controller logic before banner tween implementation exists.

No backward-compat aliasing is required; direct architecture should be implemented and tests updated accordingly.

## File List (Actual/Expected)

- `packages/runner/src/animation/reduced-motion.ts` (new)
- `packages/runner/src/canvas/GameCanvas.tsx` (update)
- `packages/runner/src/animation/index.ts` (export update)
- `packages/runner/test/animation/reduced-motion.test.ts` (new)
- `packages/runner/test/canvas/GameCanvas.test.ts` (update)
- `packages/runner/test/animation/animation-controller.test.ts` (regression)
- `packages/runner/test/canvas/interactions/aria-announcer.test.ts` (regression)

## Implementation Notes

- Implement reduced-motion observation with:
  - initial `matches` snapshot,
  - dynamic `change` listener support,
  - cleanup via unsubscribe.
- In `GameCanvas` runtime:
  - initialize reduced-motion state and call `animationController.setReducedMotion(...)` when controller exists,
  - subscribe to reduced-motion changes and forward updates,
  - subscribe to phase label changes (`renderModel.phaseDisplayName` fallback to `renderModel.phaseName`) and announce only on actual change.
- Keep announcer messages textual and stable (`Phase: <label>`).

## Out of Scope

- No generalized narration/event log feature.
- No sound/haptic accessibility extensions.
- No changes to kernel lifecycle semantics.
- No per-game accessibility overrides.
- No forced phase-banner duration policy in controller/timeline code.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/reduced-motion.test.ts`
2. `packages/runner/test/canvas/GameCanvas.test.ts`
3. `packages/runner/test/animation/animation-controller.test.ts` (regression)
4. `packages/runner/test/canvas/interactions/aria-announcer.test.ts` (regression)

### Invariants That Must Remain True

1. Reduced-motion behavior is derived from system preference and updates dynamically.
2. Enabling reduced motion never prevents gameplay progression.
3. Phase announcements remain textual, deterministic, and game-agnostic.
4. Normal-motion behavior is unchanged when `prefers-reduced-motion` is not set.

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Added `packages/runner/src/animation/reduced-motion.ts` with dynamic `matchMedia` observation and safe cleanup.
  - Wired reduced-motion environment state into `createGameCanvasRuntime` and forwarded it to `AnimationController.setReducedMotion(...)`.
  - Added phase-transition ARIA announcements in `createGameCanvasRuntime` by subscribing to phase label changes and emitting `Phase: <label>` via the shared live region announcer.
  - Added export surface in `packages/runner/src/animation/index.ts`.
  - Added tests in `packages/runner/test/animation/reduced-motion.test.ts` and extended `packages/runner/test/canvas/GameCanvas.test.ts`.
- **Deviations from originally planned scope**:
  - Did not add banner-duration timing logic in controller/timeline layers because preset tween factories are still placeholders and timing policy belongs with concrete banner tween implementation.
  - `packages/runner/src/animation/animation-controller.ts` and `packages/runner/src/canvas/interactions/aria-announcer.ts` required no functional changes; they remained regression-only coverage targets.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/animation/reduced-motion.test.ts test/canvas/GameCanvas.test.ts test/animation/animation-controller.test.ts test/canvas/interactions/aria-announcer.test.ts` ✅
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
