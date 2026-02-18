# ANIMSYS-003: Preset Registry + Built-in Presets

**Status**: ✅ COMPLETED
**Priority**: HIGH
**Effort**: Small-Medium
**Engine Changes**: None
**Deps**: ANIMSYS-001, ANIMSYS-002

## Problem

Timeline construction needs a registry that resolves descriptor kinds to reusable, named tween presets. Without a registry boundary, animation behavior becomes hardcoded and non-extensible for Spec 42 runtime overrides.

## Assumption Reassessment (2026-02-18)

1. `packages/runner/src/animation/animation-types.ts` already defines built-in preset IDs and descriptor contracts; this ticket must not duplicate those definitions in parallel constants.
2. `packages/runner/src/animation/trace-to-descriptors.ts` already hardcodes default trace-kind-to-preset mapping. This ticket should introduce a registry boundary and typing contracts first, while keeping descriptor mapping behavior stable for now.
3. `AnimationPresetId` is currently a closed union of built-ins, which conflicts with Spec 40 D3 / Spec 42 runtime extensibility. This ticket should widen preset IDs to string keys while preserving stable built-in ID constants.
4. `packages/runner/src/animation/preset-registry.ts` does not exist yet; no compatibility validation or duration metadata exists today.
5. `packages/runner/test/canvas/GameCanvas.test.ts` is not a direct validation surface for this ticket because no runtime integration occurs here.

## Architecture Reassessment

Introducing a typed, immutable preset registry is more beneficial than the current architecture because it:

- centralizes preset metadata and compatibility rules in one place;
- removes hardcoded assumptions from downstream timeline assembly;
- enables Spec 42 runtime registration of game-specific presets without engine/runtime branching;
- keeps built-in definitions immutable while allowing safe extension through cloned registry instances.

This ticket remains intentionally bounded to contracts and registry behavior. Timeline execution wiring stays in ANIMSYS-004+.

## File List (Expected)

- `packages/runner/src/animation/preset-registry.ts` (new)
- `packages/runner/src/animation/animation-types.ts` (update)
- `packages/runner/src/animation/index.ts` (update export)
- `packages/runner/test/animation/preset-registry.test.ts` (new)
- `packages/runner/test/animation/animation-types.test.ts` (update typing expectation)
- `packages/runner/test/animation/trace-to-descriptors.test.ts` (regression-only if typing changes require compile-level updates)

## Implementation Notes

- Implement a typed `PresetRegistry` with registration and lookup APIs.
- Ship built-in preset IDs from Spec 40 D3: `arc-tween`, `fade-in-scale`, `fade-out-scale`, `tint-flash`, `counter-roll`, `banner-slide`, `pulse`.
- Include default duration metadata and descriptor-kind compatibility checks.
- Keep registry runtime-agnostic except for GSAP tween factory signatures.
- Ensure built-in registry definitions are immutable and runtime extension returns new registry instances (no mutation of built-ins).
- Keep naming canonical (`preset` IDs as stable string keys, descriptor kinds from `AnimationDescriptor['kind']`).

## Out of Scope

- No trace subscription/controller logic.
- No store mutations.
- No UI controls.
- No visual-config YAML loader implementation.

## Acceptance Criteria

### Specific Tests That Must Pass

1. `packages/runner/test/animation/preset-registry.test.ts`
2. `packages/runner/test/animation/animation-types.test.ts`
3. `packages/runner/test/animation/trace-to-descriptors.test.ts` (regression)

### Invariants That Must Remain True

1. Preset IDs are stable string keys and game-agnostic.
2. Missing preset lookup surfaces recoverable errors (no process crash).
3. Registry can be extended at runtime without mutating built-in definitions.
4. Triggered-effect visual distinction remains representable via `pulse` prepend behavior.
5. No game-specific identifiers/branches are introduced in runner animation core.

## Outcome

- **Completion date**: 2026-02-18
- **What changed**:
  - Added `packages/runner/src/animation/preset-registry.ts` with:
    - typed preset definition contracts;
    - built-in preset metadata (durations + descriptor-kind compatibility);
    - immutable `PresetRegistry` create/lookup/register APIs;
    - validation for malformed or duplicate preset definitions.
  - Updated `packages/runner/src/animation/animation-types.ts` to keep built-in preset constants while widening `AnimationPresetId` to `string` for runtime extensibility (Spec 42 alignment).
  - Updated `packages/runner/src/animation/index.ts` exports to include preset registry APIs.
  - Updated `packages/runner/src/animation/trace-to-descriptors.ts` to enforce preset/descriptor compatibility through `PresetRegistry` and to accept injected registries for custom preset support.
  - Added `packages/runner/test/animation/preset-registry.test.ts` and updated `packages/runner/test/animation/animation-types.test.ts`.
  - Added/updated `packages/runner/test/animation/trace-to-descriptors.test.ts` for compatibility enforcement and custom registry override coverage.
- **Deviations from original plan**:
  - The ticket now explicitly updates the preset ID type contract. This was required to avoid a closed union that would block runtime custom preset registration.
  - Compatibility validation is enforced at descriptor mapping boundary (before timeline build exists) to fail fast on invalid preset bindings and keep future runtime composition deterministic.
  - Regression target moved from canvas runtime tests to descriptor-layer regression (`trace-to-descriptors`) because this ticket does not integrate with GameCanvas yet.
- **Verification results**:
  - `pnpm -F @ludoforge/runner test -- test/animation/preset-registry.test.ts test/animation/animation-types.test.ts test/animation/trace-to-descriptors.test.ts` ✅
  - `pnpm -F @ludoforge/runner lint` ✅
  - `pnpm -F @ludoforge/runner typecheck` ✅
