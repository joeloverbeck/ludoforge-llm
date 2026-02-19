# Spec 40: Animation System

**Status**: ✅ COMPLETED
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 38 (PixiJS Canvas Foundation), Spec 39 (React DOM UI Layer)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 5-6

---

## Objective

Implement the animation system that transforms the kernel's `EffectTraceEntry[]` into GSAP timeline sequences, animating token movements, state changes, variable updates, and phase transitions on the PixiJS canvas.

**Success criteria**: After each move, the effect trace drives a sequential GSAP animation timeline that visually shows what happened. Speed control, pause, and skip-to-end work correctly. AI turns play back with configurable detail level. The system degrades gracefully when sprites are missing or errors occur. `prefers-reduced-motion` is respected.

---

## Constraints

- Animations are purely visual -- they do NOT affect game state. The GameState has already been updated when animations play.
- The animation system reads the effect trace and sprite references to compute animation parameters.
- GSAP PixiPlugin handles PixiJS-specific property animation (position, scale, alpha, tint, rotation).
- Animation playback must not block user interaction for the next move (but the UI indicates animation is playing via the store's `animationPlaying` flag).
- All animations must be skippable.
- The animation system is fully game-agnostic. No game-specific identifiers, card types, or action names appear in the animation code. Game-specific animation presets are configured via Spec 42's visual config.

---

## Architecture

The animation system uses a three-layer architecture that separates concerns cleanly and makes the core mapping logic pure and testable.

```
Layer 1: Descriptor Layer (pure functions, no GSAP/PixiJS)
  EffectTraceEntry[] --> AnimationDescriptor[]

Layer 2: Timeline Builder (GSAP + sprite references)
  AnimationDescriptor[] + PresetRegistry + SpriteRefs --> gsap.core.Timeline

Layer 3: Playback Controller (queue + store integration)
  AnimationQueue + AnimationController --> managed playback
```

### Integration Points

- **Sprite references**: `TokenRenderer.getContainerMap()` and `ZoneRenderer.getContainerMap()` provide `ReadonlyMap<string, Container>` for token and zone PixiJS containers.
- **Zone positions**: `PositionStore.getSnapshot()` provides zone world positions for movement tweens.
- **Store flag**: `animationPlaying` in the Zustand game store gates canvas-updater updates. The animation queue sets it to `true` on first enqueue and `false` when all animations complete.
- **Effects layer**: Animations render in the existing `effectsGroup` layer from `canvas/layers.ts`.
- **Canvas instantiation**: `AnimationController` is instantiated in `GameCanvas.tsx` alongside the canvas-updater.

---

## Deliverables

### D1: GSAP + PixiPlugin Setup

`packages/runner/src/animation/gsap-setup.ts`

- Register GSAP PixiPlugin.
- Configure global GSAP defaults (ease, overwrite mode).
- Export GSAP instance for use throughout the animation system.

### D2: Animation Descriptor Layer

`packages/runner/src/animation/animation-types.ts`
`packages/runner/src/animation/trace-to-descriptors.ts`

Pure functions that convert `EffectTraceEntry[]` into `AnimationDescriptor[]` with no GSAP or PixiJS dependencies. This layer is fully unit-testable.

```typescript
function traceToDescriptors(
  trace: readonly EffectTraceEntry[],
  options?: {
    presetOverrides?: ReadonlyMap<string, string>;  // traceKind -> preset name
    detailLevel?: 'full' | 'standard' | 'minimal';
  }
): readonly AnimationDescriptor[];
```

**AnimationDescriptor types**:

| Descriptor | Fields |
|---|---|
| `MoveTokenDescriptor` | `tokenId`, `fromZoneId`, `toZoneId`, `preset`, `isTriggered` |
| `CreateTokenDescriptor` | `tokenId`, `zoneId`, `tokenType`, `preset`, `isTriggered` |
| `DestroyTokenDescriptor` | `tokenId`, `zoneId`, `tokenType`, `preset`, `isTriggered` |
| `SetTokenPropDescriptor` | `tokenId`, `prop`, `oldValue`, `newValue`, `preset`, `isTriggered` |
| `VarChangeDescriptor` | `scope`, `varName`, `oldValue`, `newValue`, `playerId?`, `preset`, `isTriggered` |
| `ResourceTransferDescriptor` | `from`, `to`, `actualAmount`, `preset`, `isTriggered` |
| `PhaseTransitionDescriptor` | `eventType`, `phase?`, `preset`, `isTriggered` |
| `SkippedDescriptor` | `traceKind` (`forEach` or `reduce`) |

All descriptors include `isTriggered: boolean` derived from `provenance.eventContext === 'triggerEffect'`.

**Effect-to-animation mapping**:

| EffectTraceEntry kind | Descriptor kind | Default preset | Duration |
|---|---|---|---|
| `moveToken` | `MoveTokenDescriptor` | `arc-tween` | 0.4s |
| `createToken` | `CreateTokenDescriptor` | `fade-in-scale` | 0.3s |
| `destroyToken` | `DestroyTokenDescriptor` | `fade-out-scale` | 0.3s |
| `setTokenProp` | `SetTokenPropDescriptor` | `tint-flash` | 0.4s |
| `varChange` | `VarChangeDescriptor` | `counter-roll` | 0.3s |
| `resourceTransfer` | `ResourceTransferDescriptor` | `counter-roll` | 0.3s |
| `lifecycleEvent` (phaseEnter) | `PhaseTransitionDescriptor` | `banner-slide` | 1.5s |
| `lifecycleEvent` (other) | skipped | -- | -- |
| `forEach` | `SkippedDescriptor` | -- | -- |
| `reduce` | `SkippedDescriptor` | -- | -- |

### D3: Animation Preset Registry

`packages/runner/src/animation/preset-registry.ts`

A registry of named animation presets. Each preset defines how a GSAP tween is constructed for a given descriptor kind. The registry is extensible -- Spec 42's visual config can register custom presets for game-specific animations.

**Built-in presets** (all game-agnostic):

| Preset ID | Description | Default Duration |
|---|---|---|
| `arc-tween` | Position tween with slight arc curve (bezier midpoint) | 0.4s |
| `fade-in-scale` | Alpha 0->1 + scale 0.5->1 | 0.3s |
| `fade-out-scale` | Alpha 1->0 + scale 1->0.5 | 0.3s |
| `tint-flash` | Brief tint color flash and restore | 0.4s |
| `counter-roll` | Numeric count-up/count-down with scale pulse | 0.3s |
| `banner-slide` | Full-width banner slides in from top, auto-dismiss | 1.5s |
| `pulse` | Subtle scale pulse overlay for triggered effects | 0.2s |

When `isTriggered` is `true`, the timeline builder prepends a `pulse` tween to the primary animation to visually distinguish triggered effects from direct effects.

### D4: Timeline Builder

`packages/runner/src/animation/timeline-builder.ts`

Converts `AnimationDescriptor[]` into a GSAP timeline using sprite references and the preset registry:

```typescript
function buildTimeline(
  descriptors: readonly AnimationDescriptor[],
  presetRegistry: PresetRegistry,
  spriteRefs: {
    tokenContainers: ReadonlyMap<string, Container>;
    zoneContainers: ReadonlyMap<string, Container>;
    zonePositions: ZonePositionMap;
  }
): gsap.core.Timeline;
```

- Each descriptor produces one or more tweens appended sequentially to the timeline.
- `SkippedDescriptor` entries are ignored (no tweens produced).
- Missing token/zone containers: skip the descriptor with `console.warn`, do not throw.
- GSAP failures are caught per-descriptor -- a failed tween does not block subsequent animations.

### D5: Animation Queue

`packages/runner/src/animation/animation-queue.ts`

Manages sequential playback of GSAP timelines:

```typescript
interface AnimationQueue {
  enqueue(timeline: gsap.core.Timeline): void;
  skipCurrent(): void;
  skipAll(): void;
  pause(): void;
  resume(): void;
  setSpeed(multiplier: number): void;  // 1x, 2x, 4x
  readonly isPlaying: boolean;
  readonly queueLength: number;
  onAllComplete(callback: () => void): void;
  destroy(): void;
}
```

- Sets `animationPlaying = true` (via store) on first `enqueue()` call when queue was empty.
- Sets `animationPlaying = false` when all queued timelines complete.
- `skipCurrent()` calls `timeline.progress(1)` on the active timeline and advances to the next.
- `skipAll()` instantly completes all queued timelines.
- `setSpeed(multiplier)` applies `timeline.timeScale(multiplier)` to the active timeline.
- `destroy()` kills all timelines and clears the queue.

### D6: Animation Controller

`packages/runner/src/animation/animation-controller.ts`

Orchestrates the full pipeline by subscribing to the store's `effectTrace`:

```typescript
interface AnimationController {
  start(): void;
  destroy(): void;
  setDetailLevel(level: 'full' | 'standard' | 'minimal'): void;
  setReducedMotion(reduced: boolean): void;
}
```

When a new `effectTrace` appears in the store:
1. Convert trace to descriptors via `traceToDescriptors()` (Layer 1).
2. Build a GSAP timeline via `buildTimeline()` (Layer 2).
3. Enqueue the timeline in the `AnimationQueue` (Layer 3).

When `reducedMotion` is `true`, all timelines are instantly completed (`progress(1)`) rather than played. Phase banners still briefly display (0.5s) for screen reader announcements.

Instantiated in `GameCanvas.tsx` alongside the canvas-updater.

### D7: AI Agent Playback

`packages/runner/src/animation/ai-playback.ts`

When an AI agent makes a move, the animation system plays back the effect trace with configurable detail level. Detail levels filter at the descriptor layer:

| Detail Level | Behavior |
|---|---|
| **Full** | All descriptors, same as human moves |
| **Standard** | Skip triggered `VarChangeDescriptor` and `PhaseTransitionDescriptor` |
| **Minimal** | Only `MoveTokenDescriptor` and `CreateTokenDescriptor` |

- Per-step delay between AI sub-actions (configurable, default 0.5s).
- "Skip AI turn" button instantly completes the current AI animation.
- "Skip all AI turns" toggle auto-skips to next human decision point.

### D8: Animation Speed Controls (DOM)

`packages/runner/src/ui/AnimationControls.tsx`

React DOM controls for animation playback:
- Speed buttons: 1x, 2x, 4x
- Pause/play toggle
- Skip button (skip current animation)
- AI detail level selector (full/standard/minimal)
- AI auto-skip toggle

### D9: Accessibility

`packages/runner/src/animation/reduced-motion.ts`

- Detect `prefers-reduced-motion: reduce` via `window.matchMedia('(prefers-reduced-motion: reduce)')`.
- When active, `AnimationController.setReducedMotion(true)` is called, causing all timelines to instantly complete.
- Phase banners still briefly display (0.5s) for screen reader consumption.
- ARIA live region announces phase transitions (e.g., "Phase: Coup Round").
- Listen for `matchMedia` changes and update dynamically.

### D10: Error Handling

Cross-cutting in D4 and D6.

- **Missing token/zone container**: skip the descriptor with `console.warn`. Do not throw. The animation for that entry is simply not played.
- **GSAP failure**: catch per-tween errors. Skip the failed tween. Do not block state updates or subsequent animations.
- **Animation system failure**: if the animation controller fails to initialize or encounters a fatal error, the game remains fully playable. The `animationPlaying` flag is never set to `true` if the animation system is not functional, so the canvas-updater continues to flush normally.
- **Queue overflow**: if more than 50 timelines are queued (e.g., rapid AI play), auto-skip older timelines to prevent memory buildup.

---

## Verification

- [ ] Token movement animates after `moveToken` trace entry
- [ ] Token creation fades in after `createToken` trace entry
- [ ] Token destruction fades out after `destroyToken` trace entry
- [ ] Variable change shows counter animation after `varChange` trace entry
- [ ] Resource transfer shows counter animation after `resourceTransfer` trace entry
- [ ] Phase transition banner from `lifecycleEvent` (phaseEnter) trace entry
- [ ] `lifecycleEvent` (turnStart/turnEnd/phaseExit) silently skipped
- [ ] `forEach` and `reduce` trace entries silently skipped
- [ ] Triggered effects show visual distinction via `pulse` prepend (from provenance)
- [ ] Speed control changes animation pace (1x, 2x, 4x)
- [ ] Pause freezes animation mid-timeline
- [ ] Skip-to-end instantly completes current animation
- [ ] Skip-all instantly completes all queued animations
- [ ] Queue handles rapid move sequences correctly
- [ ] Queue completion triggers `animationPlaying = false` in store
- [ ] Canvas-updater correctly defers/flushes around `animationPlaying` flag
- [ ] AI turn plays back with configurable detail level
- [ ] "Skip AI turn" button works during AI playback
- [ ] AI detail levels filter correctly (full/standard/minimal)
- [ ] `prefers-reduced-motion` is respected (timelines instantly complete)
- [ ] ARIA live region announces phase transitions
- [ ] Missing sprite degrades gracefully (skipped with warning)
- [ ] GSAP tween failure does not block subsequent animations
- [ ] Game remains playable with animation system disabled/broken
- [ ] `traceToDescriptors()` unit-tested for all trace entry kinds
- [ ] Preset registry supports custom overrides from Spec 42 visual config

---

## Out of Scope

- Particle effects (future enhancement via visual config presets)
- Sound effects
- Game-specific animation presets (card-deal, card-flip, explosion, etc.) -- these are configured in Spec 42's visual config and registered in the preset registry at runtime
- Drag-and-drop animation feedback
- Combat-specific or action-specific animations (per-game visual config, Spec 42)

---

## Outcome

- **Completion date**: 2026-02-19
- **What changed**:
  - Implemented animation module architecture end-to-end in runner:
    - descriptor mapping (`trace-to-descriptors`);
    - preset registry contracts;
    - timeline builder with graceful degradation;
    - queue/controller orchestration and `animationPlaying` integration;
    - DOM playback controls and AI playback policy integration;
    - reduced-motion + ARIA phase announcement accessibility wiring.
  - Integrated runtime wiring through `GameCanvas` with deterministic teardown and failure isolation.
  - Added comprehensive runner animation/canvas/ui/store tests covering queue, controller, mapping, timeline, UI controls, AI playback, and reduced-motion accessibility behavior.
- **Deviations from original plan**:
  - Built-in preset tween factories were initially placeholder/no-op during earlier animation tickets; they were subsequently upgraded to concrete generic tween factories while preserving game-agnostic contracts.
  - Accessibility implementation emphasizes deterministic reduced-motion forwarding and textual phase announcements; explicit phase-banner timing policy remains deferred until concrete banner tween behavior is implemented.
- **Verification results**:
  - `pnpm turbo test` ✅
  - `pnpm turbo lint` ✅
  - `pnpm turbo typecheck` ✅
