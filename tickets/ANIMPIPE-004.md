# ANIMPIPE-004: Stagger/parallel sequencing support

**Status**: PENDING
**Priority**: MEDIUM
**Effort**: Medium
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003

## Problem

All animation descriptors play sequentially. Multi-card deals play one-at-a-time (5 cards = ~2s). Should support staggered dealing (5 cards overlap = ~0.8s) and parallel animations for simultaneous events.

## Assumption Reassessment (2026-02-20)

1. `timeline-builder.ts` iterates descriptors sequentially, appending each to the timeline — confirmed.
2. GSAP supports position parameters (`'<'` for parallel, `'-=N'` for stagger) — confirmed from GSAP docs.
3. `visual-config-types.ts` uses Zod v4 schemas — confirmed.
4. `visual-config-provider.ts` exposes typed accessor methods — confirmed.

## Architecture Check

1. Sequencing policies are defined in visual-config YAML (game-specific presentation data), keeping the timeline-builder generic.
2. The approach uses GSAP's native position parameters rather than custom timing math.
3. No backwards-compatibility shims. Default behavior remains sequential (matching current behavior).

## What to Change

### 1. Add sequencing types

Modify `packages/runner/src/animation/animation-types.ts`:

```typescript
export type AnimationSequencingMode = 'sequential' | 'parallel' | 'stagger';

export interface AnimationSequencingPolicy {
  readonly mode: AnimationSequencingMode;
  readonly staggerOffsetSeconds?: number;
}
```

### 2. Extend visual-config schema

Modify `packages/runner/src/config/visual-config-types.ts`:

Add optional `sequencing` section to animations config with per-descriptor-kind policies.

### 3. Add `getSequencingPolicy` to visual-config-provider

Modify `packages/runner/src/config/visual-config-provider.ts`:

Add `getSequencingPolicy(descriptorKind: string): AnimationSequencingPolicy` method with default `sequential`.

### 4. Modify timeline-builder for sequencing

Modify `packages/runner/src/animation/timeline-builder.ts`:

- Group consecutive same-kind descriptors
- For each group, look up sequencing policy
- Use GSAP timeline position parameters: sequential (append), parallel (`'<'`), stagger (`'-=N'`)

### 5. Pass sequencing config through animation controller

Modify `packages/runner/src/animation/animation-controller.ts`:

Read sequencing policies from `visualConfigProvider` and pass to `buildTimeline`.

## Files to Touch

- `packages/runner/src/animation/animation-types.ts` (modify)
- `packages/runner/src/config/visual-config-types.ts` (modify)
- `packages/runner/src/config/visual-config-provider.ts` (modify)
- `packages/runner/src/animation/timeline-builder.ts` (modify)
- `packages/runner/src/animation/animation-controller.ts` (modify)
- `packages/runner/test/animation/timeline-builder.test.ts` (modify)

## Out of Scope

- Actual preset implementations (ANIMPIPE-005-007)
- Integration tests (ANIMPIPE-008)
- Visual config YAML updates for games (ANIMPIPE-008)

## Acceptance Criteria

### Tests That Must Pass

1. Sequential group: tweens append sequentially (existing behavior preserved)
2. Parallel group: all tweens in group start at time 0
3. Stagger group: tweens overlap by configured offset
4. Mixed groups: sequential group followed by stagger group works correctly
5. Default sequencing is `sequential` when no config provided
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. Default behavior (no sequencing config) is identical to current sequential behavior
2. Sequencing policies are defined in visual-config only, not hardcoded

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/timeline-builder.test.ts` — add sequencing mode tests

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/timeline-builder.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
