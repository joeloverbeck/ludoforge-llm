# Spec 71 — Canvas TexturePool Crash Elimination

**Status**: ACTIVE
**Priority**: Critical (crash blocks gameplay, survived two previous fix attempts)
**Depends on**: None (standalone fix; builds on Specs 68 + 69 infrastructure)

---

## 0 — Problem Statement

A recurring PixiJS crash kills the canvas during gameplay:

```
TypeError: Cannot read properties of undefined (reading 'push')
    at TexturePoolClass.returnTexture (TexturePool.mjs:110)
    at CanvasTextSystem.returnTexture
    at CanvasTextSystem.decreaseReferenceCount
    at CanvasTextPipe._updateGpuText
    at Text.collectRenderablesSimple
    ...
    at _tick (RAF loop)
```

**Two previous specs failed to fix this:**

- **Spec 68** (completed 2026-03-20): Removed `_texture = null` from neutralization, added double-RAF disposal, installed ticker error fence, added crash recovery via store lifecycle + component remount.
- **Spec 69** (completed 2026-03-20): Added sliding-window error detection, heartbeat recovery polling, viewport preservation across recovery.

Both specs were constrained by **C-1: "Must not fork or monkey-patch PixiJS internals."** This prevented fixing the root cause. Both relied on reactive containment and recovery — but the crash still happens because:

1. The error occurs once inside PixiJS's render loop.
2. The ticker error fence contains it (logged as `1/3`).
3. The error does NOT reach the consecutive threshold (3), so the ticker is NOT stopped.
4. The heartbeat checks `tickerStarted` and `canvasConnected` — both remain `true`.
5. Recovery never triggers.
6. But the single error permanently corrupts PixiJS's `TexturePool` internal state — all subsequent renders silently produce blank output.
7. The canvas goes blank. Only React DOM widgets remain. Page reload is the only fix.

### Root Cause (PixiJS v8.17.1)

In `TexturePool.mjs:105-111`:

```javascript
returnTexture(renderTexture, resetStyle = false) {
    const key = this._poolKeyHash[renderTexture.uid];
    // key is undefined when:
    //   - texture was never obtained via getOptimalTexture
    //   - pool was cleared while textures were still in use
    //   - GCManagedHash evicted the texture reference
    this._texturePool[key].push(renderTexture);
    // TypeError: Cannot read properties of undefined (reading 'push')
}
```

No guard exists for `key === undefined` or `this._texturePool[key] === undefined`.

### Why Reactive Approaches Are Insufficient

| Approach | What It Does | Why It's Not Enough |
|----------|-------------|---------------------|
| Ticker error fence | Catches render-loop errors | A single contained error corrupts TexturePool permanently; rendering breaks silently without further errors |
| Heartbeat recovery | Polls `tickerStarted` + `canvasConnected` | Both remain `true` after corruption — no signal to trigger recovery |
| Double-RAF disposal | Defers destroy by 2 frames | The crash is in PixiJS's render loop, not in our destroy path |
| Safe destroy try/catch | Wraps `destroy()` calls | The crash occurs during rendering, not during destroy |

---

## 1 — Constraints

- **C-1**: Targeted PixiJS monkey-patches ARE permitted for this spec (lifted from Spec 68's prohibition). Patches must be minimal, documented, and tested.
- **C-2**: Must preserve deterministic game-state flow (kernel purity).
- **C-3**: Destroy operations must eventually free GPU resources — no permanent leaks.
- **C-4**: Must not introduce perceptible visual glitches.
- **C-5**: Must remain compatible with PixiJS v8.17.x and the existing GSAP animation pipeline.
- **C-6**: Recovery must be automatic — no user-initiated reload.
- **C-7**: Each defensive layer must be independently sufficient — any single layer working prevents or recovers from the crash.
- **C-8**: Patches must be removable when PixiJS fixes the upstream bug.

---

## 2 — Solution Architecture: Five Independent Defensive Layers

### 2.1 — Layer 1: Prevention (TexturePool Monkey-Patch)

**Problem**: `TexturePoolClass.returnTexture` has no guard for undefined keys or missing buckets.

**Fix**: Patch `TexturePoolClass.prototype.returnTexture` before any PixiJS `Application` is created. The patch:
1. Checks `_poolKeyHash[texture.uid]` — if `undefined`, silently returns (texture was never pool-tracked; returning it is a no-op).
2. Checks `_texturePool[key]` — if `undefined`, lazily creates `_texturePool[key] = []` before pushing.

This makes the `TypeError` structurally impossible. The original `returnTexture` is preserved for textures that are properly tracked.

**Why independently sufficient**: The crash literally cannot occur if the undefined access is guarded. Even if all other layers are absent, this one prevents the error.

**Files**:
- **CREATE**: `packages/runner/src/canvas/texture-pool-patch.ts`
- **MODIFY**: `packages/runner/src/canvas/create-app.ts` — add `import './texture-pool-patch.js';` as the first import

**Removability**: The patch checks PixiJS version and logs a notice if the version changes, prompting review of whether the upstream bug is fixed.

### 2.2 — Layer 2: Detection (Render Corruption Flag)

**Problem**: After a contained ticker error, the health check sees "healthy" because `tickerStarted` and `canvasConnected` are both `true`. There is no signal that rendering may be corrupted.

**Fix**: Extend the ticker error fence with a `renderCorruptionSuspected` flag:
- Set to `true` after ANY contained error (even a single one).
- Reset to `false` only after N consecutive successful ticks (default: 10) — proving the renderer has recovered.
- Exposed via `isRenderCorruptionSuspected(): boolean` on the `TickerErrorFence` interface.

Extend `CanvasRuntimeHealthStatus` with `renderCorruptionSuspected: boolean`. The heartbeat in `canvas-crash-recovery.ts` triggers recovery when this flag is `true`, even if ticker and canvas appear connected.

**Why independently sufficient**: Even if Layer 1 is absent and the error occurs, a single contained error now marks the renderer as corrupted. The heartbeat detects this within its polling interval (default 5s) and triggers full canvas teardown + rebuild. The gap that let corruption go undetected is closed.

**Files**:
- **MODIFY**: `packages/runner/src/canvas/ticker-error-fence.ts`
- **MODIFY**: `packages/runner/src/canvas/canvas-crash-recovery.ts`
- **MODIFY**: `packages/runner/src/canvas/game-canvas-runtime.ts`

### 2.3 — Layer 3: Clean Recovery (TexturePool Reset on Teardown)

**Problem**: When crash recovery tears down the canvas and rebuilds it, the PixiJS `TexturePool` singleton retains corrupted state from the previous session. The rebuilt `Application` inherits dirty pool data.

**Fix**: In `GameCanvas.destroy()` (in `create-app.ts`), after `app.destroy(true, { children: true, texture: true })`, call `TexturePool.clear()` to flush all pool state. The rebuilt `Application` starts with a clean, empty pool.

**Why independently sufficient**: Even if corruption occurs and detection is slow, when recovery eventually triggers, the full teardown now resets `TexturePool` state. The rebuilt canvas starts clean, eliminating carryover corruption that could cause the crash to recur immediately after recovery.

**Files**:
- **MODIFY**: `packages/runner/src/canvas/create-app.ts`

### 2.4 — Layer 4: Hardening (Pre-Destroy Render Guards)

**Problem**: `safeDestroyDisplayObject` only sets `renderable = false` and `visible = false` in the catch fallback path. During the `destroy()` call itself, PixiJS may internally attempt to render the object (e.g., during `_updateGpuText`).

**Fix**: Set `renderable = false` and `visible = false` on display objects BEFORE calling `destroy()`, not just in the catch fallback. Apply the same pattern in `destroyManagedText`.

This ensures that even if `destroy()` triggers an internal PixiJS render pass, the object will not be collected for rendering, and `_updateGpuText` will not be called on it.

**Why independently sufficient**: By ensuring objects are never renderable at the moment they are being destroyed, the PixiJS render loop never attempts `_updateGpuText` on objects whose texture state is in flux. This eliminates the trigger condition for the bug.

**Files**:
- **MODIFY**: `packages/runner/src/canvas/renderers/safe-destroy.ts`
- **MODIFY**: `packages/runner/src/canvas/text/text-runtime.ts`

### 2.5 — Layer 5: Verification (Active Render Health Probe)

**Problem**: The heartbeat checks structural health (ticker running, canvas connected) but cannot detect silent rendering failure — PixiJS may be ticking without producing any visible output.

**Fix**: Create a render health probe that performs active verification after contained errors:
1. After any contained ticker error, schedule a one-shot verification on the next successful tick.
2. Verification checks that the PixiJS stage has visible, renderable children — a proxy for "rendering is producing output."
3. If verification fails (stage has children but none are renderable, or the renderer's `lastObjectRendered` is stale): trigger `onCorruption` callback, which feeds into the crash recovery path.

The probe is lightweight (runs only after errors, not every tick) and does not interfere with normal rendering.

**Why independently sufficient**: Even if Layers 1-4 all fail, this probe actively detects that rendering has stopped producing output and triggers recovery. Unlike the heartbeat (which checks structural health), this checks functional health.

**Files**:
- **CREATE**: `packages/runner/src/canvas/render-health-probe.ts`
- **MODIFY**: `packages/runner/src/canvas/game-canvas-runtime.ts`

---

## 3 — Affected Files

### New Files

| File | Purpose |
|------|---------|
| `packages/runner/src/canvas/texture-pool-patch.ts` | TexturePool monkey-patch with undefined-key guard and lazy bucket creation |
| `packages/runner/src/canvas/render-health-probe.ts` | Active render verification after contained errors |
| `packages/runner/test/canvas/texture-pool-patch.test.ts` | Patch behavior: untracked texture, cleared bucket, normal operation |
| `packages/runner/test/canvas/render-health-probe.test.ts` | Probe triggers on render failure, no-ops on success |

### Modified Files

| File | Change |
|------|--------|
| `packages/runner/src/canvas/create-app.ts` | Import texture-pool-patch side-effect; add `TexturePool.clear()` in `destroy()` |
| `packages/runner/src/canvas/ticker-error-fence.ts` | Add `renderCorruptionSuspected` flag, `successfulTicksSinceError` counter, `isRenderCorruptionSuspected()` method |
| `packages/runner/src/canvas/canvas-crash-recovery.ts` | Extend `CanvasRuntimeHealthStatus` with `renderCorruptionSuspected`; heartbeat triggers recovery on corruption |
| `packages/runner/src/canvas/game-canvas-runtime.ts` | Wire fence corruption flag into `getHealthStatus()`; integrate render health probe |
| `packages/runner/src/canvas/renderers/safe-destroy.ts` | Set `renderable = false` and `visible = false` BEFORE `destroy()` call |
| `packages/runner/src/canvas/text/text-runtime.ts` | Set `renderable = false` and `visible = false` before `removeFromParent()` in `destroyManagedText()` |

### Modified Test Files

| File | Change |
|------|--------|
| `packages/runner/test/canvas/ticker-error-fence.test.ts` | Test corruption flag lifecycle: set on error, cleared after N successful ticks |
| `packages/runner/test/canvas/canvas-crash-recovery.test.ts` | Test heartbeat triggers recovery on `renderCorruptionSuspected: true` |
| `packages/runner/test/canvas/renderers/safe-destroy.test.ts` | Verify `renderable`/`visible` set to `false` before `destroy()` is called |
| `packages/runner/test/canvas/text/text-runtime.test.ts` | Verify `destroyManagedText` sets `renderable`/`visible` to `false` pre-destroy |

---

## 4 — Implementation Order

### Phase 1: Root Cause Fix

**71CANCRASH-001**: Layer 1 — TexturePool monkey-patch + create-app import.
- Create `texture-pool-patch.ts` with prototype patch.
- Add side-effect import in `create-app.ts`.
- Create `texture-pool-patch.test.ts` with 3 test cases (untracked, cleared bucket, normal).
- Smallest possible change to eliminate the crash at the source.

### Phase 2: Lifecycle Hardening

**71CANCRASH-002**: Layer 4 — Pre-destroy render guards.
- Modify `safe-destroy.ts`: set `renderable = false`, `visible = false` before `destroy()`.
- Modify `text-runtime.ts`: same guards in `destroyManagedText`.
- Extend test files for both.

### Phase 3: Detection & Recovery

**71CANCRASH-003**: Layer 2 — Render corruption detection + heartbeat integration.
- Modify `ticker-error-fence.ts`: add corruption flag + successful-tick counter.
- Modify `canvas-crash-recovery.ts`: extend health status, wire into heartbeat.
- Modify `game-canvas-runtime.ts`: wire fence into health status.
- Extend test files.

**71CANCRASH-004**: Layer 3 — TexturePool reset on teardown.
- Modify `create-app.ts`: add `TexturePool.clear()` in `destroy()`.
- Add test coverage.

### Phase 4: Active Verification

**71CANCRASH-005**: Layer 5 — Active render health probe.
- Create `render-health-probe.ts`.
- Wire into `game-canvas-runtime.ts`.
- Create `render-health-probe.test.ts`.

### Phase 5: Integration Validation

**71CANCRASH-006**: Integration test proving the fix end-to-end.
- Test that forces TexturePool corruption and verifies each layer independently.
- Verify canvas recovery produces a working canvas after forced corruption.

---

## 5 — Risk Analysis

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Monkey-patch breaks on PixiJS upgrade | Low | Medium | Patch checks PixiJS version and warns on mismatch. Patch is isolated in one file and can be removed when upstream fixes the bug. |
| `TexturePool.clear()` on destroy causes brief flash | Very Low | Low | `clear()` runs after `app.destroy()` — the canvas element is already removed from DOM. |
| Render corruption flag triggers false-positive recovery | Low | Low | Flag requires 10 consecutive successful ticks to clear. Recovery is idempotent and preserves game state + viewport. |
| Render health probe has performance overhead | Very Low | Very Low | Probe runs only after contained errors (not every tick). Stage child inspection is O(1). |
| Pre-destroy `renderable = false` changes behavior for destroy callbacks | Very Low | Very Low | PixiJS `destroy()` does not depend on `renderable` state. Setting it before destroy is purely defensive. |

---

## 6 — Success Criteria

- [ ] The `TexturePoolClass.returnTexture` TypeError no longer occurs during gameplay.
- [ ] If the error is somehow triggered despite the patch, the canvas automatically recovers within 5 seconds.
- [ ] After automatic recovery, the game board renders correctly from the current store state with preserved viewport.
- [ ] No GPU resource leaks: `TexturePool` is properly cleared on teardown.
- [ ] All existing runner tests continue to pass.
- [ ] New tests cover: monkey-patch behavior, corruption detection, heartbeat-triggered recovery, pre-destroy guards, render health probe.
- [ ] Each defensive layer is proven independently sufficient by its own test suite.

---

## 7 — Out of Scope

- Upgrading PixiJS to a version that fixes `TexturePoolClass.returnTexture` (no known fix upstream as of v8.17.1).
- Handling WebGL context loss (separate failure mode, separate spec).
- Rewriting the animation system.
- Adding persistent crash telemetry or error reporting infrastructure.

---

## 8 — Foundations Alignment

| Foundation | Alignment |
|------------|-----------|
| F1 Engine Agnosticism | All changes are in the runner canvas layer; no engine or compiler changes |
| F5 Determinism Is Sacred | Recovery preserves store-owned game state; no engine semantics change |
| F7 Immutability | Health status and viewport snapshots remain read-only value objects |
| F9 No Backwards Compat | Extends existing interfaces directly; no shims, aliases, or deprecated paths |
| F10 Architectural Completeness | Addresses root cause (Layer 1) with defense-in-depth (Layers 2-5); no patches or hacks |
| F11 Testing as Proof | Each layer is proven by targeted automated tests; integration test validates the full chain |

---

## 9 — Relationship to Previous Specs

| Spec | What It Did | What It Left Unresolved |
|------|-------------|------------------------|
| **68** | Safe destroy, double-RAF disposal, ticker fence, crash recovery | Root cause unfixed; single contained error leaves canvas permanently blank |
| **69** | Sliding-window detection, heartbeat polling, viewport preservation | Heartbeat only checks structural health (ticker + canvas); doesn't detect silent render corruption |
| **71 (this)** | Root cause fix via monkey-patch + 4 additional defensive layers | — |

Specs 68 and 69's infrastructure (ticker fence, disposal queue, crash recovery, store lifecycle) is preserved and extended — not replaced. Spec 71 adds the prevention and detection layers that make the existing recovery infrastructure actually trigger when needed.
