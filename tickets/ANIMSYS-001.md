# ANIMSYS-001: Animation Module Foundation + GSAP Setup

**Status**: PENDING
**Priority**: HIGH
**Effort**: Small
**Engine Changes**: None
**Deps**: None

## Problem

Spec 40 requires a dedicated animation subsystem entrypoint and GSAP/PixiPlugin bootstrap. The runner currently has no animation module skeleton, so downstream work (descriptor mapping, timeline construction, queueing, controls) has no stable integration point.

## File List (Expected)

- `packages/runner/src/animation/gsap-setup.ts` (new)
- `packages/runner/src/animation/animation-types.ts` (new)
- `packages/runner/src/animation/index.ts` (new)
- `packages/runner/test/animation/gsap-setup.test.ts` (new)
- `packages/runner/test/animation/animation-types.test.ts` (new)

## Implementation Notes

- Register `PixiPlugin` exactly once.
- Export a shared `gsap` instance/config accessor used by later tickets.
- Define the full `AnimationDescriptor` discriminated union and supporting option types from Spec 40 D2.
- Keep this ticket limited to contracts/bootstrap; no trace mapping or timelines yet.

## Out of Scope

- No trace-to-descriptor conversion logic.
- No queue/controller/store wiring.
- No UI components.
- No per-game visual config registration (Spec 42).

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/gsap-setup.test.ts`
2. `packages/runner/test/animation/animation-types.test.ts`
3. `packages/runner/test/canvas/layers.test.ts` (regression: effects layer contract unaffected)
4. `packages/runner/test/canvas/GameCanvas.test.ts` (regression: canvas runtime still initializes)

### Invariants That Must Remain True

1. Animation code remains game-agnostic (no hardcoded game/card/action identifiers).
2. No changes to engine packages or kernel trace schemas.
3. Existing canvas layer ordering (`effectsGroup` present and non-interactive) is unchanged.
4. Importing animation module has no side effects that mutate store state.
