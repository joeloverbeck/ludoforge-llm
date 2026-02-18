# ANIMSYS-008: Animation Playback Controls UI (Speed/Pause/Skip/AI Modes)

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small-Medium
**Engine Changes**: None
**Deps**: ANIMSYS-005, ANIMSYS-007

## Problem

Spec 40 requires player-facing controls for animation speed, pause/resume, skip-current, AI detail level, and AI auto-skip. These controls are not currently present in the DOM UI layer.

## File List (Expected)

- `packages/runner/src/ui/AnimationControls.tsx` (new)
- `packages/runner/src/ui/AnimationControls.module.css` (new)
- `packages/runner/src/ui/UIOverlay.tsx` (update)
- `packages/runner/src/ui/GameContainer.tsx` (update if prop wiring is needed)
- `packages/runner/test/ui/AnimationControls.test.tsx` (new)
- `packages/runner/test/ui/UIOverlay.test.ts` (update)
- `packages/runner/test/ui/GameContainer.test.ts` (regression/update)

## Implementation Notes

- Implement controls for 1x/2x/4x speed, pause/play, skip current, AI detail selector, AI auto-skip toggle.
- Connect controls to queue/controller/AI playback APIs.
- Ensure controls reflect current state (selected speed, paused status, detail level, auto-skip enabled).
- Keep styling consistent with existing UI overlay patterns.

## Out of Scope

- No changes to canvas renderer internals.
- No changes to animation descriptor or timeline logic.
- No session persistence of control preferences (unless already present in store conventions).
- No unrelated UI layout refactors.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/ui/AnimationControls.test.tsx`
2. `packages/runner/test/ui/UIOverlay.test.ts`
3. `packages/runner/test/ui/GameContainer.test.ts`

### Invariants That Must Remain True

1. Playback controls do not block normal move input when animations are idle.
2. Control actions map to queue/controller APIs without race conditions.
3. Existing overlay components (phase, warnings, terminal, etc.) continue rendering correctly.
4. UI remains game-agnostic and does not include game-specific labels/logic.
