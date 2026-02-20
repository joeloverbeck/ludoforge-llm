# ANIMPIPE-007: counter-tick + banner-overlay + zone-pulse presets + timing config

**Status**: PENDING
**Priority**: LOW
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003

## Problem

Several animation presets are stubs. `counter-roll` (for `varChange`/`resourceTransfer`) and `banner-slide` (for `phaseTransition`) are delay-only — they just wait without showing anything. There's also no visual feedback for zone-related events. Additionally, animation durations are hardcoded with no external timing configuration.

## Assumption Reassessment (2026-02-20)

1. `counter-roll` calls `appendDelay(context, 0.3)` only — confirmed from preset-registry.ts.
2. `banner-slide` calls `appendDelay(context, 1.5)` only — confirmed.
3. `visual-config-types.ts` has no `timing` section — confirmed.
4. `pulse` preset exists and animates alpha 1→0.4→1 — confirmed, can be used as base for zone-pulse.

## Architecture Check

1. All new presets follow the existing factory pattern in the preset registry.
2. Timing config is added to visual-config YAML (game-specific presentation data), keeping presets generic.
3. `zone-pulse` is a new preset that enhances zone visual feedback without changing zone renderer logic.

## What to Change

### 1. Implement `counter-tick` preset

Replace delay-only `counter-roll` for `varChange` and `resourceTransfer`:
- Animate a scale pulse on the token/zone container: scale 1→1.2→1
- Add a brief tint highlight
- Default duration: 0.4s

### 2. Implement `banner-overlay` preset

Replace delay-only `banner-slide` for `phaseTransition`:
- Create a temporary PixiJS Text at center of viewport
- Scale+fade in, hold briefly, fade out
- Default duration: 1.5s (0.3s in, 0.9s hold, 0.3s out)

### 3. Implement `zone-pulse` preset

New preset for zone highlight events:
- Animate zone container alpha: 1→0.3→1 with a tint flash
- Brief brighten-then-restore for "this zone was affected" feedback
- Default duration: 0.5s
- Compatible kinds: `['zoneHighlight']` (new descriptor kind)

### 4. Add animation timing config

Modify `packages/runner/src/config/visual-config-types.ts`:

Add optional `timing` section to animations config:
```yaml
animations:
  timing:
    moveToken: { duration: 0.4 }
    cardDeal: { duration: 0.2 }
    cardFlip: { duration: 0.3 }
```

### 5. Wire timing config into presets

Modify `packages/runner/src/animation/preset-registry.ts`:

Preset factories receive duration from timing config, fallback to hardcoded defaults.

### 6. Update preset metadata

Update `BUILTIN_PRESET_METADATA`:
- `varChange`/`resourceTransfer` → `counter-tick` (was `counter-roll`)
- `phaseTransition` → `banner-overlay` (was `banner-slide`)
- Add `zoneHighlight` → `zone-pulse`

## Files to Touch

- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/src/animation/animation-types.ts` (modify — add `zoneHighlight` kind)
- `packages/runner/src/config/visual-config-types.ts` (modify — add timing section)
- `packages/runner/src/config/visual-config-provider.ts` (modify — add `getTimingConfig` method)
- `packages/runner/test/animation/preset-registry.test.ts` (modify)

## Out of Scope

- arc-bezier preset (ANIMPIPE-005)
- card-flip-3d preset (ANIMPIPE-006)
- Integration tests (ANIMPIPE-008)
- Visual config YAML updates for games (ANIMPIPE-008)

## Acceptance Criteria

### Tests That Must Pass

1. `counter-tick` creates scale pulse tween for `varChange`/`resourceTransfer`
2. `banner-overlay` creates fade-in/hold/fade-out sequence for `phaseTransition`
3. `zone-pulse` creates alpha+tint animation for `zoneHighlight`
4. Timing config is respected when provided for each preset
5. Fallback to default duration when timing config absent
6. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. All presets produce visible animation (no delay-only stubs)
2. Timing durations come from visual-config, with sensible defaults

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/preset-registry.test.ts` — add tests for each new preset

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/preset-registry.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`
