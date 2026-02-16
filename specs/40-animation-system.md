# Spec 40: Animation System

**Status**: ACTIVE
**Priority**: P1
**Complexity**: L
**Dependencies**: Spec 38 (PixiJS Canvas Foundation)
**Roadmap**: [35-00-frontend-implementation-roadmap.md](./35-00-frontend-implementation-roadmap.md)
**Design doc**: [brainstorming/browser-based-game-runner.md](../brainstorming/browser-based-game-runner.md), Sections 5–6

---

## Objective

Implement the animation system that transforms the kernel's `EffectTraceEntry[]` into GSAP timeline sequences, animating token movements, state changes, variable updates, and trigger firings on the PixiJS canvas.

**Success criteria**: After each move, the effect trace drives a sequential GSAP animation timeline that visually shows what happened. Speed control, pause, and skip-to-end work correctly. AI turns play back with configurable detail level.

---

## Constraints

- Animations are purely visual — they do NOT affect game state. The GameState has already been updated when animations play.
- The animation system reads the effect trace and the before/after RenderModel to compute animation parameters.
- GSAP PixiPlugin handles PixiJS-specific property animation (position, scale, alpha, tint, rotation).
- Animation playback must not block user interaction for the next move (but the UI should indicate animation is playing).
- All animations must be skippable.

---

## Architecture

```
EffectTraceEntry[]
    |
    v
traceToTimeline(trace, spriteMap, zonePositions)
    |
    v
GSAP Timeline
    |
    ├── moveToken: position tween from source zone to dest zone
    ├── createToken: fade-in at destination + optional deal animation
    ├── destroyToken: fade-out at source zone
    ├── setTokenProp: property change animation (flip, state change)
    ├── varChange: counter animation (numeric text change)
    └── triggerFiring: indicator pulse + cascading delay
    |
    v
AnimationController
    ├── play()
    ├── pause()
    ├── resume()
    ├── skipToEnd()
    ├── setSpeed(multiplier)
    └── onComplete(callback)
```

---

## Deliverables

### D1: GSAP + PixiPlugin Setup

`packages/runner/src/animation/gsap-setup.ts`

- Register GSAP PixiPlugin.
- Configure global GSAP defaults (ease, overwrite mode).
- Export GSAP instance for use throughout animation system.

### D2: Effect Trace to Timeline Mapper

`packages/runner/src/animation/trace-to-timeline.ts`

Core mapping function that converts `EffectTraceEntry[]` into a GSAP timeline:

```typescript
function traceToTimeline(
  trace: readonly EffectTraceEntry[],
  spriteMap: ReadonlyMap<string, Container>,   // token/zone ID → PixiJS container
  zonePositions: ReadonlyMap<string, Point>,    // zone ID → world position
  options: AnimationOptions
): gsap.core.Timeline;
```

**Effect-to-animation mapping**:

| EffectTraceEntry type | Animation | Duration | Easing |
|----------------------|-----------|----------|--------|
| `moveToken` | Position tween from source zone center to dest zone center. Arc path (slight upward curve) for visual appeal. | 0.4s | power2.inOut |
| `createToken` | Fade-in (alpha 0→1) + scale (0.5→1) at destination zone. For cards: slide from deck zone position. | 0.3s | power2.out |
| `destroyToken` | Fade-out (alpha 1→0) + scale (1→0.5). | 0.3s | power2.in |
| `setTokenProp` | Depends on property. Card flip: scaleX 1→0→1 (with texture swap at midpoint). State change: brief tint flash. | 0.4s | power2.inOut |
| `varChange` | Counter text animates from old value to new value (countUp/countDown). Brief scale pulse on the variable display. | 0.3s | none (linear count) |
| `conditional` | (Optional) Brief highlight on evaluated condition. Skippable. | 0.2s | — |

### D3: Trigger Firing Animations

`packages/runner/src/animation/trigger-animations.ts`

When the trace includes trigger firings (cascading effects):
- Show a subtle "trigger" indicator (pulse/icon) on the source zone/token.
- Add cascading delay between trigger effects (each nested trigger group delayed by 0.2s * depth).
- Visual distinction between direct effects (solid) and triggered effects (pulsing/outlined).

### D4: Phase Transition Banner

`packages/runner/src/animation/phase-banner.ts`

- Full-width banner animates in from top on phase change.
- Displays phase name in large text.
- Auto-dismisses after 1.5s with fade-out.
- Can be skipped with any click/key.

### D5: Card-Specific Animations

`packages/runner/src/animation/card-animations.ts`

Specialized animations for card operations:

| Animation | Description | Duration |
|-----------|-------------|----------|
| Shuffle | Brief riffle animation on deck zone (texture swap rapid cycle). | 0.6s |
| Deal | Card slides from deck zone to target zone in an arc. | 0.3s per card |
| Flip | ScaleX 1→0 (show edge), swap texture, scaleX 0→1 (show new face). | 0.4s |
| Burn | Card slides from deck to burn pile, face-down. | 0.3s |

Card animations are triggered by specific effect trace patterns:
- `moveToken` from a stack zone to a player zone → deal animation
- `setTokenProp` changing face-up state → flip animation
- `moveToken` to a discard/burn zone → burn animation

### D6: Animation Controller

`packages/runner/src/animation/animation-controller.ts`

Controls playback of the GSAP timeline:

```typescript
interface AnimationController {
  play(timeline: gsap.core.Timeline): void;
  pause(): void;
  resume(): void;
  skipToEnd(): void;
  setSpeed(multiplier: number): void;  // 1x, 2x, 4x
  readonly isPlaying: boolean;
  readonly progress: number;  // 0-1
  onComplete(callback: () => void): void;
}
```

- Speed multiplier affects `timeline.timeScale()`.
- Pause/resume use `timeline.pause()` / `timeline.resume()`.
- Skip-to-end uses `timeline.progress(1)` and triggers onComplete.
- Integrates with Zustand store: sets `animationPlaying` flag.

### D7: AI Agent Playback

`packages/runner/src/animation/ai-playback.ts`

When an AI agent makes a move, the animation system plays back the effect trace with configurable detail:

| Detail Level | Behavior |
|-------------|----------|
| **Full** | Zone highlighting for choice context, choice indicators, trigger animations, token movements. Same as human moves. |
| **Standard** | Token movements and key effects. Skip choice indicators and minor triggers. |
| **Minimal** | Instant state update with brief flash. Skip all intermediate animations. |

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

---

## Verification

- [ ] Token movement animates smoothly between zones after `moveToken` trace entry
- [ ] Token creation fades in after `createToken` trace entry
- [ ] Token destruction fades out when removed from state
- [ ] Card flip animation plays when `setTokenProp` changes face-up state
- [ ] Variable change shows counting animation
- [ ] Phase transition banner appears and auto-dismisses
- [ ] Trigger firings show cascading delay and indicator
- [ ] Speed control changes animation pace (1x, 2x, 4x)
- [ ] Pause freezes animation mid-timeline
- [ ] Skip-to-end instantly completes all pending animations
- [ ] AI turn plays back with configurable detail level
- [ ] "Skip AI turn" button works during AI playback
- [ ] Animation completion triggers store update (animationPlaying = false)
- [ ] Rapid move sequence (multiple moves in quick succession) queues animations correctly

---

## Out of Scope

- Particle effects (explosions, etc.) — future enhancement via visual config
- Sound effects
- Combat-specific animations (per-game visual config, Spec 42)
- Drag-and-drop animation feedback
