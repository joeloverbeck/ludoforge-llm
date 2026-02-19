# VISCONF2-006: Animation Preset Wiring

**Status**: PENDING
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None — runner-only change
**Deps**: None

## Problem

The visual config schema defines animation action overrides at `packages/runner/src/config/visual-config-types.ts:108-110`:

```typescript
const AnimationsConfigSchema = z.object({
  actions: z.record(z.string(), z.string()).optional(),
});
```

The `VisualConfigProvider` exposes `getAnimationPreset(actionId)` at line 108-110 of `visual-config-provider.ts`, but the animation system **never consumes it**.

In `animation-controller.ts:84-91`, `traceToDescriptors()` is called with a mapping options object, but the `presetOverrides` field is never populated from visual config:

```typescript
const descriptors = deps.traceToDescriptors(
  trace,
  {
    detailLevel,
    ...(cardContext === undefined ? {} : { cardContext }),
  },
  deps.presetRegistry,
);
```

The `AnimationMappingOptions.presetOverrides` type at `animation-types.ts:31` is `ReadonlyMap<AnimationPresetOverrideKey, AnimationPresetId>`, but no code builds this map from visual config `animations.actions`.

## What to Change

### 1. Add `actionPresetOverrides` field to `AnimationMappingOptions`

**File**: `packages/runner/src/animation/animation-types.ts`

The existing `presetOverrides` field already serves this purpose. No type change needed — just need to populate it.

### 2. Build overrides map from visual config in animation controller

**File**: `packages/runner/src/animation/animation-controller.ts`

In `processTrace()` (line 76-117):

```typescript
const overrides = buildPresetOverrides(options.visualConfigProvider);

const descriptors = deps.traceToDescriptors(
  trace,
  {
    detailLevel,
    presetOverrides: overrides.size > 0 ? overrides : undefined,
    ...(cardContext === undefined ? {} : { cardContext }),
  },
  deps.presetRegistry,
);
```

Add helper function:

```typescript
function buildPresetOverrides(
  provider: VisualConfigProvider,
): ReadonlyMap<AnimationPresetOverrideKey, AnimationPresetId> {
  const overrides = new Map<AnimationPresetOverrideKey, AnimationPresetId>();
  const VALID_OVERRIDE_KEYS: readonly AnimationPresetOverrideKey[] = [
    'moveToken', 'cardDeal', 'cardBurn', 'createToken', 'destroyToken',
    'setTokenProp', 'cardFlip', 'varChange', 'resourceTransfer', 'phaseTransition',
  ];

  for (const key of VALID_OVERRIDE_KEYS) {
    const preset = provider.getAnimationPreset(key);
    if (preset !== null) {
      overrides.set(key, preset);
    }
  }

  return overrides;
}
```

### 3. Validate preset IDs against registry

In `buildPresetOverrides()`, after looking up the preset from visual config, validate it exists in the preset registry. If it doesn't exist, log a warning and skip the override (don't crash).

Use `presetRegistry.has(presetId)` or equivalent — may need to add a `has()` method to `PresetRegistry` if it only has `requireCompatible()`.

### 4. Cache the overrides map

The overrides map is derived from `VisualConfigProvider` which is immutable per game session. Build it once at `start()` time and reuse across all `processTrace()` calls, rather than rebuilding per trace.

## Invariants

1. When no `animations.actions` config exists, behavior is identical to current (no overrides).
2. Only valid `AnimationPresetOverrideKey` values are accepted — unknown keys in the YAML are silently ignored.
3. An override that references a nonexistent preset ID logs a warning but does not throw.
4. Overrides are applied before the preset registry's compatibility check in `resolvePreset()`.
5. The overrides map is immutable and built once per controller lifecycle.

## Tests

1. **Unit — buildPresetOverrides with no config**: Provider has no `animations`, verify empty map returned.
2. **Unit — buildPresetOverrides with valid overrides**: Provider has `animations.actions: {moveToken: "pulse"}`, verify map contains `moveToken → "pulse"`.
3. **Unit — buildPresetOverrides ignores unknown keys**: Provider has `animations.actions: {unknownAction: "pulse"}`, verify map is empty (unknown key ignored).
4. **Unit — overrides passed to traceToDescriptors**: Mock `traceToDescriptors`, configure provider with one override, call `processTrace()`, verify `presetOverrides` in the options passed to `traceToDescriptors` contains the override.
5. **Unit — invalid preset ID logs warning**: Provider has `animations.actions: {moveToken: "nonexistent-preset"}`, verify warning logged and override skipped.
6. **Unit — overrides cached across traces**: Process two traces, verify `buildPresetOverrides` is called only once (not per trace).
7. **Integration — Texas Hold'em with animation overrides**: Add `animations.actions.cardDeal: "fade-in-scale"` to Texas Hold'em visual config, verify card deal animations use the overridden preset.
8. **Regression**: Existing animation controller and trace-to-descriptors tests still pass.
