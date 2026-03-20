# Spec 69 — Canvas Crash Prevention & Transparent Recovery

## Status: COMPLETED

## Problem

Spec 68 introduced safe destroy, a two-frame disposal queue, a ticker error fence, and crash recovery via component remount. Despite that, the same `TexturePoolClass.returnTexture` crash still appeared in production gameplay (`logs/fitl-logs.log`), and the canvas could disappear while the React DOM remained alive.

The evidence available on 2026-03-20 established three things:

1. The Pixi render-loop crash still exists in real gameplay.
2. A single contained ticker error did not automatically escalate into recovery.
3. The prior draft theory that detached descendants remained renderable, and therefore required Pixi-private Text detection plus recursive descendant neutralization, was not proven strongly enough by the code or logs.

This spec therefore focuses on robust recovery architecture around the proven gaps, while preserving and strengthening disposal invariants through tests rather than speculative Pixi-internal production logic.

## Reassessed Failure Analysis

### Confirmed

1. `neutralizeDisplayObject()` already detaches the subtree root immediately from the live parent tree.
2. The existing ticker fence in Spec 68 only reacted to consecutive errors.
3. The existing recovery path only triggered when `handleCrash()` was called explicitly.
4. Recovery remounted the canvas, but it discarded viewport state.

### Not Proven

1. That recursive descendant neutralization is required.
2. That eager Text-only removal via Pixi private fields is the right fix.
3. That the production crash follows a confirmed `error-success-error-success` cadence rather than some other degraded state.

## Implemented Architecture

### Pillar 1: Disposal Invariant Coverage

No new production disposal logic was added in Spec 69.

Instead, the implementation locked the current disposal contract with stronger tests:
- neutralization detaches the root container immediately
- neutralization never calls `destroy()`
- descendants remain attached to the detached subtree until deferred flush
- deep subtrees remain detached from the live parent tree while still being owned by the deferred destroy path

This keeps the architecture generic and avoids coupling the runner to Pixi private properties.

### Pillar 2: Sliding-Window Error Detection

The ticker error fence was extended from a pure consecutive-error threshold to a dual-threshold model:

- fast path: `maxConsecutiveErrors`
- slow path: `windowErrors` within `windowMs`

The implementation uses a bounded timestamp ring buffer and an injectable `now()` clock for deterministic testing.

#### Implemented Interface

```typescript
export interface TickerErrorFenceOptions {
  readonly maxConsecutiveErrors?: number;
  readonly windowErrors?: number;
  readonly windowMs?: number;
  readonly onCrash?: (error: unknown) => void;
  readonly logger?: Pick<Console, 'warn'>;
  readonly now?: () => number;
}
```

#### Implemented Behavior

1. Each error records a timestamp into a fixed-size circular buffer.
2. Consecutive successful ticks still reset only the consecutive counter.
3. If either threshold trips, the ticker stops and `onCrash` fires exactly once.
4. Old timestamps age out naturally through ring-buffer overwrite.

This is defensive hardening, not a claim that the window is the sole root-cause fix.

### Pillar 3: Transparent Recovery

#### 3a: Runtime-Owned Health Surface

The recovery module does not inspect raw Pixi internals directly.

Instead, `GameCanvasRuntime` now owns the Pixi-specific health read and exposes:

```typescript
export interface CanvasRuntimeHealthStatus {
  readonly tickerStarted: boolean;
  readonly canvasConnected: boolean;
}
```

`getHealthStatus()` returns the runtime’s current health, or `null` after destruction.

#### 3b: Heartbeat Recovery

`createCanvasCrashRecovery()` now supports proactive polling:

```typescript
export interface CanvasCrashRecoveryOptions {
  readonly store: StoreApi<GameStore>;
  readonly onRecoveryNeeded: () => void;
  readonly logger?: Pick<Console, 'warn'>;
  readonly getHealthStatus?: () => CanvasRuntimeHealthStatus | null;
  readonly heartbeatIntervalMs?: number;
}
```

If the heartbeat sees either:
- `tickerStarted === false`, or
- `canvasConnected === false`

and recovery is not already in flight, it requests recovery through the existing store lifecycle.

This keeps recovery generic and avoids leaking Pixi references into the recovery module.

#### 3c: Viewport Preservation

`GameCanvasRuntime` now exposes:

```typescript
export interface ViewportSnapshot {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}
```

And supports:
- `getViewportSnapshot()`
- optional `initialViewport` on runtime creation

`GameCanvas` captures the viewport snapshot before recovery teardown and passes it into the recreated runtime, so recovery preserves pan/zoom state instead of snapping back to the default view.

## Implemented Files

| File | Change |
|------|--------|
| `packages/runner/src/canvas/ticker-error-fence.ts` | Added sliding-window error budget, option validation, and injectable clock support |
| `packages/runner/src/canvas/canvas-crash-recovery.ts` | Added heartbeat polling based on a runtime health getter |
| `packages/runner/src/canvas/game-canvas-runtime.ts` | Added runtime health getter, viewport snapshot getter, and `initialViewport` restore |
| `packages/runner/src/canvas/GameCanvas.tsx` | Wired heartbeat recovery and viewport capture/restore across remount |
| `packages/runner/test/canvas/ticker-error-fence.test.ts` | Added sliding-window fence coverage |
| `packages/runner/test/canvas/canvas-crash-recovery.test.ts` | Added heartbeat recovery coverage |
| `packages/runner/test/canvas/GameCanvas.test.ts` | Added runtime health and viewport snapshot coverage |
| `packages/runner/test/canvas/GameCanvas.recovery.test.tsx` | Added heartbeat-triggered recovery and viewport-preserving remount coverage |
| `packages/runner/test/canvas/renderers/safe-destroy.test.ts` | Added neutralization invariant coverage |
| `packages/runner/test/canvas/renderers/disposal-queue.test.ts` | Added deep-subtree deferred-disposal coverage |

## Ticket Reconciliation

### Ticket 001

Re-scoped from speculative recursive descendant neutralization to disposal invariant coverage.

### Ticket 002

Implemented as sliding-window error detection.

### Ticket 003

Implemented as heartbeat recovery against a sanitized runtime health surface.

### Ticket 004

Implemented as viewport snapshot and restore across crash recovery.

### Ticket 005

Implemented by extending the existing `GameCanvas.recovery.test.tsx` integration suite rather than creating a new standalone test file.

## Verification

1. `pnpm -F @ludoforge/runner exec vitest run test/canvas/ticker-error-fence.test.ts test/canvas/canvas-crash-recovery.test.ts test/canvas/GameCanvas.test.ts test/canvas/GameCanvas.recovery.test.tsx test/canvas/renderers/safe-destroy.test.ts test/canvas/renderers/disposal-queue.test.ts`
2. `pnpm -F @ludoforge/runner test`
3. `pnpm -F @ludoforge/runner typecheck`
4. `pnpm -F @ludoforge/runner lint`

## Foundations Alignment

| Foundation | Alignment |
|------------|-----------|
| F1 Engine Agnosticism | All changes stay in the runner canvas layer |
| F5 Determinism | Recovery preserves store-owned game state and does not change engine semantics |
| F7 Immutability | Health and viewport snapshots are read-only value objects |
| F9 No Backwards Compat | No shims or aliases were introduced; the runtime surface was extended directly |
| F10 Architectural Completeness | The implemented design fixes proven recovery gaps and avoids speculative Pixi-internal hacks |
| F11 Testing as Proof | Each pillar is covered by automated tests |

## Risks

1. The underlying PixiJS `TexturePoolClass.returnTexture` bug may still exist upstream. Spec 69 hardens containment and recovery around it rather than claiming to eliminate every root cause inside Pixi.
2. Heartbeat recovery is intentionally conservative, but any future runtime pause semantics should still be reviewed against the health criteria.
3. If future evidence proves a remaining disposal-path bug, that should be addressed in a new spec with a reproducible failing test first.
