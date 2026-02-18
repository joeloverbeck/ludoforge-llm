# ANIMSYS-009: Reduced Motion + Phase Announcements Accessibility

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small-Medium
**Engine Changes**: None
**Deps**: ANIMSYS-006, ANIMSYS-008

## Problem

Spec 40 requires accessibility behavior for `prefers-reduced-motion`, dynamic media-query updates, and phase-transition announcements. This path is currently missing and is needed for compliance and usability.

## File List (Expected)

- `packages/runner/src/animation/reduced-motion.ts` (new)
- `packages/runner/src/animation/animation-controller.ts` (update)
- `packages/runner/src/canvas/GameCanvas.tsx` (update)
- `packages/runner/src/canvas/interactions/aria-announcer.ts` (update if shared announcer is reused)
- `packages/runner/test/animation/reduced-motion.test.ts` (new)
- `packages/runner/test/animation/animation-controller.test.ts` (update)
- `packages/runner/test/canvas/interactions/aria-announcer.test.ts` (update)

## Implementation Notes

- Implement `matchMedia('(prefers-reduced-motion: reduce)')` detection and listener.
- Route reduced-motion state into controller (`setReducedMotion`).
- In reduced-motion mode, complete timelines instantly while preserving phase banner visibility for ~0.5s.
- Announce phase transitions through ARIA live region text updates.

## Out of Scope

- No generalized narration/event log feature.
- No sound/haptic accessibility extensions.
- No changes to kernel lifecycle semantics.
- No per-game accessibility overrides.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/reduced-motion.test.ts`
2. `packages/runner/test/animation/animation-controller.test.ts`
3. `packages/runner/test/canvas/interactions/aria-announcer.test.ts`

### Invariants That Must Remain True

1. Reduced-motion behavior is opt-in from system preference and updates dynamically.
2. Enabling reduced motion never prevents gameplay progression.
3. Phase announcements remain textual, deterministic, and game-agnostic.
4. Normal-motion behavior is unchanged when `prefers-reduced-motion` is not set.
