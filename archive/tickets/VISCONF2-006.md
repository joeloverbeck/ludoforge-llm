# VISCONF2-006: Animation Preset Wiring

**Status**: ✅ COMPLETED
**Priority**: LOW
**Effort**: Small
**Engine Changes**: None - runner-only change
**Deps**: None

## Reassessed Baseline (validated against current code/tests)

1. `AnimationMappingOptions.presetOverrides` already exists in `packages/runner/src/animation/animation-types.ts` and is already consumed by `traceToDescriptors()`.
2. `trace-to-descriptors` already has robust preset override coverage in `packages/runner/test/animation/trace-to-descriptors.test.ts` (valid overrides, semantic overrides, incompatible overrides, custom registry support).
3. `PresetRegistry.has()` already exists in `packages/runner/src/animation/preset-registry.ts`; no registry API addition is needed.
4. The actual gap is in `packages/runner/src/animation/animation-controller.ts`: controller mapping options do not currently pass config-driven overrides into `traceToDescriptors()`.
5. `VisualConfigProvider.getAnimationPreset(actionId)` currently accepts arbitrary strings and visual-config schema allows arbitrary `animations.actions` keys.

## Problem

The visual config contract exposes animation preset overrides (`animations.actions`), but animation-controller never wires them into descriptor mapping. As a result, YAML-defined action preset overrides are inert in runtime animation playback.

## Scope (updated)

### 1. Tighten override key contract at config boundary

**Files**:
- `packages/runner/src/config/visual-config-types.ts`
- `packages/runner/src/config/visual-config-provider.ts`

Replace `animations.actions` from `record<string, string>` with an object keyed by canonical `AnimationPresetOverrideKey` values.

Rationale:
- Fail-fast configuration is cleaner than silently ignoring typos.
- Keeps runtime/controller logic strongly typed and deterministic.
- Aligns with project direction: no compatibility shims or aliasing.

### 2. Build and cache controller preset overrides once per lifecycle

**File**: `packages/runner/src/animation/animation-controller.ts`

At controller construction/start:
- Build a typed `Map<AnimationPresetOverrideKey, AnimationPresetId>` from visual config.
- Validate each configured preset id with `presetRegistry.has(id)`.
- For unknown preset ids, log warning and skip the entry (non-fatal).
- Reuse cached map in every `processTrace()` call.

### 3. Wire cached overrides into descriptor mapping

**File**: `packages/runner/src/animation/animation-controller.ts`

Pass `presetOverrides` into `traceToDescriptors()` mapping options (alongside `detailLevel` and optional `cardContext`) only when non-empty.

## Invariants (updated)

1. When `animations.actions` is omitted, behavior matches current runtime defaults.
2. Only canonical action keys are accepted by schema; unknown keys are rejected at parse/validation time.
3. Nonexistent preset ids do not crash playback; they emit warning and are ignored.
4. Overrides are applied before compatibility enforcement in `traceToDescriptors.resolvePreset()`.
5. Overrides are computed once per controller lifecycle and treated as immutable thereafter.

## Tests (updated)

1. **Schema**: `animations.actions` accepts canonical override keys and rejects unknown keys.
2. **Provider**: `getAnimationPreset()` is key-typed and returns configured values for known override keys.
3. **Controller**: passes configured overrides to `traceToDescriptors()` options.
4. **Controller**: invalid preset id logs warning and is not forwarded as override.
5. **Controller**: override map is built once and reused across multiple traces.
6. **Regression**: existing animation-controller and trace-to-descriptors suites continue passing.

## Outcome

- **Completion date**: 2026-02-19
- **What actually changed**:
  - Added canonical shared override keys in `packages/runner/src/animation/animation-types.ts` (`ANIMATION_PRESET_OVERRIDE_KEYS`).
  - Tightened visual-config schema in `packages/runner/src/config/visual-config-types.ts` so `animations.actions` is strict and only accepts canonical override keys.
  - Tightened provider contract in `packages/runner/src/config/visual-config-provider.ts` (`getAnimationPreset` now accepts typed override keys).
  - Wired visual-config animation overrides into controller mapping in `packages/runner/src/animation/animation-controller.ts`.
  - Added controller-side preset-id existence validation via `presetRegistry.has()`, warning-and-skip behavior for unknown preset ids, and one-time override-map construction per controller lifecycle.
  - Added/updated tests:
    - `packages/runner/test/animation/animation-controller.test.ts`
    - `packages/runner/test/config/visual-config-provider.test.ts`
    - `packages/runner/test/config/visual-config-schema.test.ts`
- **Deviation from original ticket draft**:
  - Switched from \"unknown keys silently ignored\" to strict schema rejection of unknown override keys for fail-fast configuration hygiene.
  - Removed unnecessary registry API work (`PresetRegistry.has()` already existed).
  - Did not mutate production game YAML for this ticket; coverage is provided by controller/schema/provider tests with regression gates.
- **Verification**:
  - `pnpm -F @ludoforge/runner test -- animation-controller visual-config-provider visual-config-schema` passed.
  - `pnpm -F @ludoforge/runner lint` passed.
  - `pnpm -F @ludoforge/runner typecheck` passed.
