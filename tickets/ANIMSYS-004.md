# ANIMSYS-004: Timeline Builder with Graceful Degradation

**Status**: PENDING
**Priority**: HIGH
**Effort**: Medium
**Engine Changes**: None
**Deps**: ANIMSYS-002, ANIMSYS-003

## Problem

Spec 40 requires conversion of descriptors into sequential GSAP timelines using token/zone containers and zone positions. The runner currently has no timeline builder and no resilience behavior for missing sprites or tween failures.

## File List (Expected)

- `packages/runner/src/animation/timeline-builder.ts` (new)
- `packages/runner/src/animation/preset-registry.ts` (update)
- `packages/runner/src/animation/animation-types.ts` (update)
- `packages/runner/test/animation/timeline-builder.test.ts` (new)
- `packages/runner/test/canvas/renderers/token-renderer.test.ts` (regression)
- `packages/runner/test/canvas/renderers/zone-renderer.test.ts` (regression)

## Implementation Notes

- Implement `buildTimeline(descriptors, registry, spriteRefs)` from Spec 40 D4.
- Append descriptor tweens sequentially.
- Ignore `SkippedDescriptor` entries.
- For missing token/zone containers: `console.warn` and continue.
- Catch per-descriptor GSAP failures and continue timeline assembly.
- Prepend `pulse` tween when `isTriggered === true` and preset supports it.

## Out of Scope

- No queueing or playback controls.
- No store subscription/effectTrace orchestration.
- No reduced-motion branch.
- No AI turn policies.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/timeline-builder.test.ts`
2. `packages/runner/test/canvas/renderers/token-renderer.test.ts`
3. `packages/runner/test/canvas/renderers/zone-renderer.test.ts`
4. `packages/runner/test/canvas/layers.test.ts` (regression: effects layer still valid target)

### Invariants That Must Remain True

1. Timeline builder never throws on missing sprite references.
2. Failed descriptor tween generation does not block subsequent descriptors.
3. Timeline order preserves descriptor order.
4. No game-specific animation logic is introduced.
