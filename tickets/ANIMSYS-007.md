# ANIMSYS-007: AI Turn Playback Policy and Detail Levels

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Small-Medium
**Engine Changes**: None
**Deps**: ANIMSYS-002, ANIMSYS-005, ANIMSYS-006

## Problem

Spec 40 requires separate AI playback behavior (detail filtering, per-step delay, skip-current-turn, auto-skip AI turns). The current runner AI flow has no animation policy layer.

## File List (Expected)

- `packages/runner/src/animation/ai-playback.ts` (new)
- `packages/runner/src/store/ai-move-policy.ts` (update if needed)
- `packages/runner/src/store/game-store.ts` (update for AI animation preferences)
- `packages/runner/test/animation/ai-playback.test.ts` (new)
- `packages/runner/test/store/ai-move-policy.test.ts` (update)
- `packages/runner/test/ui/AITurnOverlay.test.tsx` (regression/update if controls state is surfaced)

## Implementation Notes

- Implement detail-level modes from Spec 40 D7 (`full`, `standard`, `minimal`) via descriptor-layer filtering.
- Add configurable per-step delay defaulting to `0.5s`.
- Implement “Skip AI turn” behavior (complete current AI animation immediately).
- Implement “Skip all AI turns” toggle behavior (auto-skip until next human decision point).
- Keep policy as orchestration only; reuse existing queue/controller primitives.

## Out of Scope

- No new GSAP preset behavior.
- No reduced-motion media-query implementation.
- No broad UI redesign outside AI playback controls.
- No changes to engine AI algorithms.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/ai-playback.test.ts`
2. `packages/runner/test/store/ai-move-policy.test.ts`
3. `packages/runner/test/ui/AITurnOverlay.test.tsx`

### Invariants That Must Remain True

1. AI playback policy does not mutate kernel state; it only affects visual timing/detail.
2. “Skip all AI turns” never skips required human input states.
3. Default AI behavior remains deterministic when animation options are unchanged.
4. No game-specific AI animation branching is introduced.
