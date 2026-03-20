# Spec 68 — Canvas Display Object Lifecycle & Crash Resilience

**Status**: Draft
**Priority**: High (crash blocks gameplay)
**Depends on**: None (standalone fix)

---

## 0 — Problem Statement

A recurring PixiJS crash kills the canvas during FITL gameplay:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'push')
    at TexturePoolClass.returnTexture
    at CanvasTextSystem.returnTexture
    at CanvasTextSystem.decreaseReferenceCount
    at CanvasTextPipe._updateGpuText
    at Text.collectRenderablesSimple
    ...
    at _tick (RAF loop)
```

The crash originates inside PixiJS v8.17.1's internal render loop (`app.ticker._tick → render → collectRenderables → CanvasTextPipe._updateGpuText`). It is **uncaught** — it propagates from the RAF ticker and destroys the entire canvas. Once triggered, the ticker enters an infinite crash loop (each `_tick` re-throws), producing the cascading `requestAnimationFrame` stack visible in `logs/fitl-logs.log`.

### Root Cause

A **temporal race condition** between disposal and rendering. The sequence:

1. A game-state update removes tokens/zones from the render model.
2. `canvasUpdater.applySnapshot()` synchronously calls `tokenRenderer.update()`, which enqueues removed containers via `disposalQueue.enqueue()`.
3. `disposalQueue.enqueue()` calls `neutralizeDisplayObject()` immediately (synchronously), which sets `displayObject._texture = null` on any `Text` children.
4. The disposal queue schedules actual `destroy()` via a single `requestAnimationFrame`.
5. **However**, PixiJS's `CanvasTextSystem` retains an internal GPU text reference from the *previous* render pass. On the *next* render frame — which fires **before or concurrently with** the disposal RAF — it calls `_updateGpuText` on the neutralized Text object.
6. `_updateGpuText` calls `decreaseReferenceCount` → `returnTexture`, which tries to push the nulled texture back to the pool → `undefined.push()` → crash.

The existing mitigations (`safeDestroyDisplayObject`, `neutralizeDisplayObject`, `disposalQueue`) don't help because:
- `safeDestroyDisplayObject` wraps `destroy()` in try/catch, but the crash is in PixiJS's render loop, not our destroy call.
- `neutralizeDisplayObject` is the **cause** — nulling `_texture` creates the dangling reference.
- `disposalQueue` defers destroy by one RAF, but the PixiJS render pass runs in that same or preceding RAF tick.
- `ErrorBoundary` is React-only; it cannot catch errors thrown inside the PixiJS ticker (which runs outside React).

### Why Existing Code Fails

| Layer | File | What It Does | Why It Doesn't Help |
|-------|------|-------------|---------------------|
| `neutralizeDisplayObject` | `safe-destroy.ts:36-38` | Sets `_texture = null` | Creates the dangling reference that PixiJS's text system chokes on |
| `disposalQueue` | `disposal-queue.ts:34-38` | Defers `safeDestroyDisplayObject` by 1 RAF | PixiJS render pass runs in the same or prior RAF tick |
| `safeDestroyDisplayObject` | `safe-destroy.ts:50-77` | try/catch around `destroy()` | Crash is in PixiJS render, not our destroy |
| `ErrorBoundary` | `ErrorBoundary.tsx` | React error boundary | Cannot catch non-React errors (RAF ticker) |
| `canvasUpdater` | `canvas-updater.ts:96-111` | Synchronous post-animation reconciliation | Triggers disposal mid-frame, before PixiJS finishes its render pass |

---

## 1 — Constraints

- **C-1**: Must not fork or monkey-patch PixiJS internals.
- **C-2**: Must preserve deterministic game-state flow (kernel purity).
- **C-3**: Destroy operations must eventually free GPU resources — no permanent leaks.
- **C-4**: Must not introduce perceptible visual glitches (no flash-of-stale-content).
- **C-5**: Must remain compatible with PixiJS v8.17.x and the existing GSAP animation pipeline.
- **C-6**: Recovery must be automatic — no user-initiated reload required for transient crashes.

---

## 2 — Solution Architecture

### 2.1 — Deferred Neutralization (Fix the Race)

**Problem**: `neutralizeDisplayObject` nulls `_texture` synchronously, but PixiJS still holds a GPU reference.

**Fix**: Replace the aggressive `_texture = null` with a **safe visibility tombstone** pattern:

```
neutralizeDisplayObject(container):
  1. container.removeFromParent()        // Remove from scene graph
  2. container.visible = false            // Hide from render
  3. container.renderable = false          // Skip in collectRenderables
  4. container.eventMode = 'none'          // Disable interaction
  5. // DO NOT null _texture               // Let PixiJS manage texture lifecycle
```

The key insight: once `renderable = false`, PixiJS's `collectRenderables` skips the container entirely. The `_texture` null was unnecessary defense-in-depth that actually caused the crash.

**File**: `packages/runner/src/canvas/renderers/safe-destroy.ts`

### 2.2 — Two-Phase Disposal Queue

**Problem**: Single-RAF defer isn't enough — PixiJS may still reference the object in the same RAF tick.

**Fix**: Implement a **two-phase** disposal strategy:

- **Phase 1 (immediate)**: Neutralize (removeFromParent + visible=false + renderable=false). No texture nulling.
- **Phase 2 (deferred by 2+ frames)**: Call `destroy({ children: true })` wrapped in try/catch. This guarantees PixiJS has completed at least one full render cycle without the object in the scene graph before we destroy it.

```
enqueue(container):
  1. neutralize(container)                // Phase 1: safe removal
  2. Add to pending set
  3. Schedule flush after TWO animation frames (double-RAF)

flush():
  1. For each pending container:
     a. safeDestroyDisplayObject(container, { children: true })
  2. Clear pending set
```

The double-RAF ensures:
- Frame N: Object neutralized, removed from scene graph
- Frame N+1: PixiJS renders without the object (clears internal references)
- Frame N+2: Safe to destroy (no dangling GPU references)

**File**: `packages/runner/src/canvas/renderers/disposal-queue.ts`

### 2.3 — Ticker Error Fence

**Problem**: An uncaught error in PixiJS's ticker enters an infinite crash loop — every subsequent `_tick` re-throws.

**Fix**: Install a **ticker error fence** that wraps the PixiJS application ticker to catch and contain render-loop errors:

```
installTickerErrorFence(app):
  1. Store reference to original ticker._tick
  2. Replace with wrapped version:
     try {
       original._tick(deltaTime)
     } catch (error) {
       consecutiveErrors++
       if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS):
         app.ticker.stop()
         emit 'canvas-crash' event
       else:
         console.warn('Ticker error contained:', error)
     }
  3. On successful tick: consecutiveErrors = 0
```

The fence:
- Contains single transient errors without killing the canvas
- Stops the ticker after N consecutive errors (default: 3) to prevent infinite crash loops
- Emits a recoverable event that the canvas layer can respond to

**File**: `packages/runner/src/canvas/ticker-error-fence.ts` (new)

### 2.4 — Canvas Crash Recovery

**Problem**: Once the canvas crashes, the entire game session is dead. The React `ErrorBoundary` cannot catch ticker errors.

**Fix**: Add a **canvas crash observer** that listens for the ticker error fence's crash event and attempts automatic recovery:

```
Canvas crash recovery flow:
  1. Ticker error fence emits 'canvas-crash'
  2. Canvas crash observer receives event
  3. Observer calls destroyCanvasPipeline() safely
  4. Observer triggers canvas re-initialization via store action
  5. Store transitions lifecycle: crashed → reinitializing → running
  6. GameCanvas component re-mounts with fresh PixiJS Application
  7. Game state is preserved (Zustand store is unaffected)
```

The recovery is invisible to the user because:
- Game state lives in Zustand, not in PixiJS
- The canvas re-renders from the current store snapshot
- Animations in progress are lost (acceptable — they were crashing anyway)

**File**: `packages/runner/src/canvas/canvas-crash-observer.ts` (new)

### 2.5 — Store Lifecycle Extension

**Problem**: The game store's lifecycle state machine has no concept of canvas crash/recovery.

**Fix**: Extend the lifecycle with crash-related states:

```
Existing states: idle → loading → ready → running → terminal
New states:      running → canvasCrashed → reinitializing → running
```

New store actions:
- `reportCanvasCrash()`: Transitions to `canvasCrashed`, preserves game state
- `beginCanvasRecovery()`: Transitions to `reinitializing`
- `canvasRecovered()`: Transitions back to `running`

The GameCanvas component observes these transitions to tear down and re-create the PixiJS application.

**File**: `packages/runner/src/store/game-store.ts` (extend existing)

---

## 3 — Affected Files

### Modified Files

| File | Change |
|------|--------|
| `packages/runner/src/canvas/renderers/safe-destroy.ts` | Remove `_texture = null` from `neutralizeDisplayObject`. Keep all other neutralization steps. Remove `_texture = null` from `safeDestroyDisplayObject` fallback path. |
| `packages/runner/src/canvas/renderers/disposal-queue.ts` | Implement double-RAF defer strategy. Replace single `requestAnimationFrame` with nested double-RAF. |
| `packages/runner/src/canvas/GameCanvas.tsx` | Integrate ticker error fence on app creation. Wire canvas crash observer. Handle lifecycle re-mount on crash recovery. |
| `packages/runner/src/store/game-store.ts` | Add `canvasCrashed` / `reinitializing` lifecycle states. Add `reportCanvasCrash()`, `beginCanvasRecovery()`, `canvasRecovered()` actions. |

### New Files

| File | Purpose |
|------|---------|
| `packages/runner/src/canvas/ticker-error-fence.ts` | Ticker wrapper that catches and contains render-loop errors, stops ticker after N consecutive failures, emits crash event. |
| `packages/runner/src/canvas/canvas-crash-observer.ts` | Listens for crash events, orchestrates safe teardown + re-initialization, transitions store lifecycle. |

### Test Files

| File | Purpose |
|------|---------|
| `packages/runner/test/canvas/renderers/safe-destroy.test.ts` | Verify `neutralizeDisplayObject` no longer nulls `_texture`. Verify `safeDestroyDisplayObject` fallback doesn't null `_texture`. |
| `packages/runner/test/canvas/renderers/disposal-queue.test.ts` | Verify double-RAF timing. Verify containers survive 1 RAF without destroy. Verify destroy happens after 2 RAFs. |
| `packages/runner/test/canvas/ticker-error-fence.test.ts` | Verify single error is contained. Verify consecutive error threshold stops ticker. Verify crash event is emitted. Verify successful tick resets counter. |
| `packages/runner/test/canvas/canvas-crash-observer.test.ts` | Verify crash event triggers teardown. Verify store lifecycle transitions. Verify re-initialization on recovery. |
| `packages/runner/test/store/game-store-crash-lifecycle.test.ts` | Verify crash lifecycle state transitions. Verify game state is preserved through crash/recovery. |

---

## 4 — Implementation Order

### Phase 1: Stop the Crash (Tickets 1-3)

1. **68-CANVASLIFE-001**: Remove `_texture = null` from `neutralizeDisplayObject` and `safeDestroyDisplayObject` fallback.
   - Smallest possible change to stop the immediate crash.
   - Add regression test: mock Text with `_texture`, verify it's not nulled after neutralization.

2. **68-CANVASLIFE-002**: Implement double-RAF disposal queue.
   - Replace single-RAF `schedule` with nested double-RAF.
   - Add timing tests verifying containers are not destroyed until 2+ frames after enqueue.

3. **68-CANVASLIFE-003**: Add ticker error fence.
   - New file `ticker-error-fence.ts`.
   - Unit tests for containment, threshold, and crash event emission.

### Phase 2: Crash Recovery (Tickets 4-5)

4. **68-CANVASLIFE-004**: Extend store lifecycle with crash states.
   - Add `canvasCrashed` / `reinitializing` states and actions.
   - Unit tests for state transitions and game-state preservation.

5. **68-CANVASLIFE-005**: Add canvas crash observer and wire recovery flow.
   - New file `canvas-crash-observer.ts`.
   - Integrate into `GameCanvas.tsx`.
   - Integration test: simulate crash event → verify lifecycle transitions → verify canvas re-mount.

### Phase 3: Hardening (Ticket 6)

6. **68-CANVASLIFE-006**: End-to-end crash resilience validation.
   - Manual + automated test: force a texture pool crash, verify canvas recovers without page reload.
   - Verify GSAP animations resume correctly after recovery.
   - Verify no GPU resource leaks after multiple crash/recovery cycles.

---

## 5 — Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Removing `_texture = null` causes a *different* leak | Low | Medium | `renderable = false` + `removeFromParent()` prevent PixiJS from rendering the object. `destroy()` in Phase 2 of disposal frees the texture. |
| Double-RAF delay causes visible stale objects | Low | Low | Objects are `visible = false` + `renderable = false` immediately. Delay only affects GPU resource release timing. |
| Ticker error fence masks real bugs | Medium | Medium | Only contains errors, doesn't suppress them. Logs all contained errors. Stops ticker after 3 consecutive errors rather than silently continuing. |
| Canvas recovery loses in-progress animations | Certain | Low | Animations were crashing anyway. Store state is preserved. Game can continue from current position. |
| React StrictMode double-mount triggers race | Low | Low | The double-RAF strategy is resilient to double-mount — neutralized objects won't crash even if the component remounts before Phase 2 completes. |

---

## 6 — Success Criteria

- [ ] The `TexturePoolClass.returnTexture` crash no longer occurs during normal FITL gameplay.
- [ ] Canvas survives transient PixiJS errors without page reload.
- [ ] After automatic recovery, the game board renders correctly from the current store state.
- [ ] No GPU resource leaks: memory usage stabilizes after repeated reconciliation cycles.
- [ ] All existing runner tests continue to pass.
- [ ] New tests cover: neutralization behavior, disposal timing, error containment, lifecycle transitions, recovery flow.

---

## 7 — Out of Scope

- Upgrading PixiJS to a version that fixes `TexturePoolClass.returnTexture` (no known fix upstream as of v8.17.1).
- Rewriting the animation system to avoid container sharing between GSAP and the reconciler.
- Adding persistent crash telemetry or error reporting infrastructure.
- Handling WebGL context loss (separate failure mode, separate spec).
