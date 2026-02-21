# ANIMPIPE-007: counter-tick + banner-overlay presets + animation timing config

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Large
**Engine Changes**: None — runner-only
**Deps**: ANIMPIPE-001, ANIMPIPE-002, ANIMPIPE-003

## Problem

Several animation presets are stubs. `counter-roll` (for `varChange`/`resourceTransfer`) and `banner-slide` (for `phaseTransition`) are delay-only — they just wait without showing anything. Additionally, animation durations are hardcoded with no external timing configuration.

## Assumption Reassessment (2026-02-21)

1. `counter-roll` calls `appendDelay(context, 0.3)` only — confirmed from preset-registry.ts.
2. `banner-slide` calls `appendDelay(context, 1.5)` only — confirmed.
3. `visual-config-types.ts` has no `timing` section — confirmed.
4. `pulse` preset exists but animates scale (1→1.08→1), not alpha — corrected.
5. No `zoneHighlight` animation descriptor kind exists in `animation-types.ts`, and `trace-to-descriptors.ts` cannot emit it — corrected.
6. Preset context only has token/zone refs + positions; it does not provide a dedicated screen-space overlay API. Creating/destroying transient text nodes inside preset registry would couple preset logic with scene lifecycle responsibilities — corrected.

## Architecture Check

1. Presets remain tween factories over existing render refs; they should not become ad hoc scene-graph lifecycle managers.
2. Timing config belongs in visual-config (game-specific presentation data) and should be consumed by timeline assembly, not hardcoded in presets.
3. Renaming delay-only stubs to concrete preset ids (`counter-tick`, `banner-overlay`) is beneficial and cleaner than retaining misleading names.
4. `zoneHighlight` cannot be added runner-only without upstream descriptor/trace support; that is explicitly out of scope for this ticket.

## What to Change

### 1. Replace delay stub with `counter-tick` preset

Replace delay-only `counter-roll` mapping for `varChange` and `resourceTransfer`:
- Use preset id `counter-tick`
- Implement visible tween behavior using existing sprite refs (no delay-only stub)
- Default duration: 0.4s

### 2. Replace delay stub with `banner-overlay` preset

Replace delay-only `banner-slide` for `phaseTransition`:
- Use preset id `banner-overlay`
- Implement visible tween behavior for `phaseTransition` using existing refs
- Do not introduce preset-owned text object lifecycle in this ticket
- Default duration: 1.5s

### 3. Add animation timing config

Modify `packages/runner/src/config/visual-config-types.ts`:

Add optional `timing` section to animations config:
```yaml
animations:
  timing:
    moveToken: { duration: 0.4 }
    cardDeal: { duration: 0.2 }
    cardFlip: { duration: 0.3 }
```

### 4. Wire timing config into timeline assembly

Modify runner animation config/provider/timeline wiring:

- Expose per-descriptor duration lookup from visual-config provider
- Apply duration overrides in timeline building
- Fallback to preset defaults when timing config is absent

### 5. Update preset metadata and default mappings

Update `BUILTIN_PRESET_METADATA`:
- `varChange`/`resourceTransfer` → `counter-tick` (replace `counter-roll`)
- `phaseTransition` → `banner-overlay` (replace `banner-slide`)

Update built-in preset id list and related tests accordingly.

## Files to Touch

- `packages/runner/src/animation/preset-registry.ts` (modify)
- `packages/runner/src/animation/animation-types.ts` (modify — replace renamed preset ids)
- `packages/runner/src/config/visual-config-types.ts` (modify — add timing section)
- `packages/runner/src/config/visual-config-provider.ts` (modify — add `getTimingConfig` method)
- `packages/runner/src/animation/timeline-builder.ts` (modify — consume timing overrides)
- `packages/runner/src/animation/animation-controller.ts` (modify — provide timing overrides)
- `packages/runner/test/animation/preset-registry.test.ts` (modify)
- `packages/runner/test/animation/animation-types.test.ts` (modify)
- `packages/runner/test/animation/trace-to-descriptors.test.ts` (modify)
- `packages/runner/test/animation/timeline-builder.test.ts` (modify)
- `packages/runner/test/config/visual-config-provider.test.ts` (modify)
- `packages/runner/test/config/visual-config-schema.test.ts` (modify)

## Out of Scope

- arc-bezier preset (ANIMPIPE-005)
- card-flip-3d preset (ANIMPIPE-006)
- Integration tests (ANIMPIPE-008)
- Visual config YAML updates for games (ANIMPIPE-008)
- New descriptor/trace kind `zoneHighlight` (requires upstream event model work)

## Acceptance Criteria

### Tests That Must Pass

1. `counter-tick` is no longer delay-only and emits visible tween operations for `varChange`/`resourceTransfer`
2. `banner-overlay` is no longer delay-only and emits visible tween operations for `phaseTransition`
3. Timing config is respected when provided for descriptor kinds
4. Fallback to default duration when timing config is absent
5. Existing suite: `pnpm -F @ludoforge/runner test`

### Invariants

1. No built-in visual preset is delay-only for mapped visual trace kinds
2. Timing durations come from visual-config when defined, with deterministic defaults otherwise

## Test Plan

### New/Modified Tests

1. `packages/runner/test/animation/preset-registry.test.ts` — add tests for each new preset
2. `packages/runner/test/animation/timeline-builder.test.ts` — assert timing override plumbing
3. `packages/runner/test/config/visual-config-provider.test.ts` — assert timing lookup mapping
4. `packages/runner/test/config/visual-config-schema.test.ts` — assert timing schema behavior

### Commands

1. `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/preset-registry.test.ts`
2. `pnpm -F @ludoforge/runner test && pnpm -F @ludoforge/runner typecheck`

## Outcome

- Completion date: 2026-02-21
- What changed:
  - Replaced built-in preset ids `counter-roll`/`banner-slide` with `counter-tick`/`banner-overlay` (no alias/back-compat).
  - Implemented visible tween behavior for both presets (removed delay-only behavior for mapped visual kinds).
  - Added `animations.timing` schema/provider support and wired duration overrides through animation controller + timeline builder.
  - Updated animation/config tests to reflect renamed preset ids and timing behavior.
- Deviations from original plan:
  - Removed `zone-pulse`/`zoneHighlight` from scope because runner has no `zoneHighlight` descriptor kind or mapping source in the current pipeline.
  - Kept `banner-overlay` implementation within existing preset context (no preset-owned Pixi text object lifecycle introduced).
- Verification results:
  - `pnpm -F @ludoforge/runner test -- --reporter=verbose packages/runner/test/animation/preset-registry.test.ts packages/runner/test/animation/timeline-builder.test.ts packages/runner/test/animation/animation-types.test.ts packages/runner/test/animation/trace-to-descriptors.test.ts packages/runner/test/config/visual-config-provider.test.ts packages/runner/test/config/visual-config-schema.test.ts` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
