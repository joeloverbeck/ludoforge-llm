# Animation System Review & Spec 40 Revision

**Date**: 2026-02-18
**Scope**: Spec 40 rewrite, EffectTraceDestroyToken kernel addition, Spec 42 clarification

---

## Background

Spec 40 (Animation System) was written early in the frontend roadmap, before the kernel's effect trace types were finalized and before the canvas infrastructure (Specs 38-39) was built. A thorough review against the actual codebase revealed several issues requiring a full rewrite.

## Issues Found

### 1. Game-Agnosticism Violations

Old D5 ("Card-Specific Animations") hardcoded card game patterns (shuffle, deal, flip, burn) into the core animation system. This violates the engine's agnostic design: the animation system should not contain game-specific animation logic. Card animations are a visual config concern (Spec 42).

### 2. Phantom Trace Types

The old spec referenced `destroyToken` and `conditional` as trace entry kinds, but:
- `destroyToken` did not exist in the kernel's `EffectTraceEntry` union. The `applyDestroyToken` function in `effects-token.ts` did not emit a trace entry.
- `conditional` does not exist and was never planned as a trace type.

### 3. Missing Trace Types

The following kernel trace types were not addressed in the old spec:
- `resourceTransfer` -- added in the execution tracing design (2026-02-13)
- `lifecycleEvent` -- phase/turn lifecycle transitions
- `forEach` -- loop trace entries
- `reduce` -- reduce trace entries

### 4. No Queue Mechanism

The old spec's verification checklist included "rapid move sequence queues animations correctly" but the spec itself had no queue design. The `AnimationController` was a simple play/pause controller with no queuing.

### 5. Missing Cross-Cutting Concerns

- No testing strategy (the old `traceToTimeline` coupled GSAP to mapping logic, making it untestable without mocking)
- No accessibility (`prefers-reduced-motion`)
- No error handling (what happens when a sprite is missing?)

### 6. Undocumented Integration Points

The spec did not document how the animation system connects to:
- `TokenRenderer.getContainerMap()` / `ZoneRenderer.getContainerMap()` for sprite references
- `PositionStore` for zone world positions
- `canvas-updater` and the `animationPlaying` flag gating mechanism
- The `effectsGroup` layer in the canvas layer stack

## Decisions

### Three-Layer Architecture

The revised spec separates the animation system into three layers:

1. **Descriptor Layer** (pure functions): `EffectTraceEntry[] -> AnimationDescriptor[]`. No GSAP or PixiJS dependencies. Fully unit-testable.
2. **Timeline Builder** (GSAP + sprites): `AnimationDescriptor[] + PresetRegistry + SpriteRefs -> gsap.core.Timeline`.
3. **Playback Controller** (queue + store): `AnimationQueue + AnimationController -> managed playback`.

This addresses the testability concern and follows the same "pure core, effectful shell" pattern used in the kernel.

### EffectTraceDestroyToken Added to Kernel

Rather than faking the trace in the animation layer, `EffectTraceDestroyToken` was added to the kernel itself:
- New interface in `types-core.ts` with fields: `kind`, `tokenId`, `type`, `zone`, `provenance`
- Added to the `EffectTraceEntry` union type
- Schema added to `schemas-core.ts` (schema artifacts regenerated)
- Trace emission added to `applyDestroyToken()` in `effects-token.ts`
- Unit test added in `effects-lifecycle.test.ts`

This follows the same pattern as `EffectTraceCreateToken` and ensures the animation system receives complete trace data.

### Preset Registry for Game-Agnosticism

Instead of hardcoded card animations, the revised spec uses a preset registry with built-in game-agnostic presets (arc-tween, fade-in-scale, etc.) that can be overridden or extended by Spec 42's visual config. Games define their own presets (card-flip, explosion, etc.) in `visual-config.yaml`.

### Animation Queue

A dedicated `AnimationQueue` manages sequential playback of GSAP timelines, with:
- `enqueue()` / `skipCurrent()` / `skipAll()`
- Speed control via `setSpeed(multiplier)`
- Integration with the store's `animationPlaying` flag
- Overflow protection (auto-skip when >50 timelines queued)

### forEach/reduce Handling

`forEach` and `reduce` trace entries are structural (loop bookkeeping) and have no visual representation. They are mapped to `SkippedDescriptor` and produce no tweens.

### lifecycleEvent Handling

Only `phaseEnter` lifecycle events produce a visual (banner-slide). `phaseExit`, `turnStart`, and `turnEnd` are silently skipped since they have no meaningful visual representation.

## Files Changed

| File | Change |
|---|---|
| `packages/engine/src/kernel/types-core.ts` | Added `EffectTraceDestroyToken` interface, updated `EffectTraceEntry` union |
| `packages/engine/src/kernel/schemas-core.ts` | Added `destroyToken` schema to `EffectTraceEntrySchema` |
| `packages/engine/src/kernel/effects-token.ts` | Added `emitTrace()` call in `applyDestroyToken()` |
| `packages/engine/schemas/Trace.schema.json` | Regenerated (includes `destroyToken`) |
| `packages/engine/schemas/EvalReport.schema.json` | Regenerated |
| `packages/engine/test/unit/effects-lifecycle.test.ts` | Added trace emission test for `destroyToken` |
| `specs/40-animation-system.md` | Complete rewrite |
| `specs/42-visual-config-session-management.md` | Clarified animation boundary in D4 |
