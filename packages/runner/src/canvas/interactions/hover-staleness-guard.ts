import type { ScreenRect } from '../coordinate-bridge.js';
import type { HoveredCanvasTarget } from '../hover-anchor-contract.js';

interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

interface ScreenBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface HoverStalenessGuardDeps {
  readonly getActiveTargets: () => readonly HoveredCanvasTarget[];
  readonly removeTarget: (target: HoveredCanvasTarget) => void;
  readonly clearAll: () => void;
  readonly getPointerScreenPosition: () => ScreenPoint | null;
  readonly getCanvasBounds: () => ScreenBounds | null;
  readonly resolveTargetScreenBounds: (target: HoveredCanvasTarget) => ScreenRect | null;
  readonly sweepIntervalMs?: number;
}

export interface HoverStalenessGuard {
  onViewportMoving(): void;
  onCanvasPointerLeave(): void;
  onHoverStateChanged(): void;
  destroy(): void;
}

const DEFAULT_SWEEP_INTERVAL_MS = 500;

export function createHoverStalenessGuard(deps: HoverStalenessGuardDeps): HoverStalenessGuard {
  const sweepIntervalMs = deps.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
  let sweepTimer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;

  const stopSweep = (): void => {
    if (sweepTimer === null) {
      return;
    }
    clearInterval(sweepTimer);
    sweepTimer = null;
  };

  const clearStaleTargets = (): void => {
    if (destroyed) {
      return;
    }

    const activeTargets = deps.getActiveTargets();
    if (activeTargets.length === 0) {
      stopSweep();
      return;
    }

    const pointerPosition = deps.getPointerScreenPosition();
    const canvasBounds = deps.getCanvasBounds();
    if (
      pointerPosition === null
      || canvasBounds === null
      || !containsPoint(canvasBounds, pointerPosition)
    ) {
      deps.clearAll();
      return;
    }

    for (const target of activeTargets) {
      const bounds = deps.resolveTargetScreenBounds(target);
      if (bounds === null || !containsPoint(bounds, pointerPosition)) {
        deps.removeTarget(target);
      }
    }
  };

  return {
    onViewportMoving(): void {
      if (destroyed) {
        return;
      }
      deps.clearAll();
    },
    onCanvasPointerLeave(): void {
      if (destroyed) {
        return;
      }
      deps.clearAll();
    },
    onHoverStateChanged(): void {
      if (destroyed) {
        return;
      }

      if (deps.getActiveTargets().length === 0) {
        stopSweep();
        return;
      }

      if (sweepTimer !== null) {
        return;
      }

      sweepTimer = setInterval(clearStaleTargets, sweepIntervalMs);
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      stopSweep();
    },
  };
}

function containsPoint(bounds: ScreenBounds, point: ScreenPoint): boolean {
  return point.x >= bounds.left
    && point.x <= bounds.right
    && point.y >= bounds.top
    && point.y <= bounds.bottom;
}
