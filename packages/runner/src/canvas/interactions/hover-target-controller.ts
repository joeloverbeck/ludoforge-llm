import type { HoveredCanvasTarget } from '../hover-anchor-contract.js';

interface HoverTargetControllerOptions {
  readonly onTargetChange: (target: HoveredCanvasTarget | null) => void;
  readonly schedule?: (task: () => void) => void;
}

export interface HoverTargetController {
  getCurrentTarget(): HoveredCanvasTarget | null;
  onHoverEnter(target: HoveredCanvasTarget): void;
  onHoverLeave(target: HoveredCanvasTarget): void;
  destroy(): void;
}

export function createHoverTargetController(options: HoverTargetControllerOptions): HoverTargetController {
  const scheduleTask = options.schedule ?? queueMicrotask;
  const activeTargets = new Map<string, HoveredCanvasTarget>();
  let currentTarget: HoveredCanvasTarget | null = null;
  let publishQueued = false;
  let destroyed = false;

  const schedulePublish = (): void => {
    if (publishQueued || destroyed) {
      return;
    }
    publishQueued = true;
    scheduleTask(() => {
      publishQueued = false;
      if (destroyed) {
        return;
      }

      const nextTarget = pickHighestPriorityTarget(activeTargets);
      if (isSameTarget(nextTarget, currentTarget)) {
        return;
      }
      currentTarget = nextTarget;
      options.onTargetChange(currentTarget);
    });
  };

  return {
    getCurrentTarget(): HoveredCanvasTarget | null {
      return currentTarget;
    },
    onHoverEnter(target: HoveredCanvasTarget): void {
      if (destroyed) {
        return;
      }
      activeTargets.set(toTargetKey(target), target);
      schedulePublish();
    },
    onHoverLeave(target: HoveredCanvasTarget): void {
      if (destroyed) {
        return;
      }
      activeTargets.delete(toTargetKey(target));
      schedulePublish();
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      publishQueued = false;
      activeTargets.clear();
      currentTarget = null;
    },
  };
}

function pickHighestPriorityTarget(
  targets: ReadonlyMap<string, HoveredCanvasTarget>,
): HoveredCanvasTarget | null {
  let candidate: HoveredCanvasTarget | null = null;
  for (const target of targets.values()) {
    if (candidate === null || compareTargetPriority(target, candidate) > 0) {
      candidate = target;
    }
  }
  return candidate;
}

function compareTargetPriority(a: HoveredCanvasTarget, b: HoveredCanvasTarget): number {
  if (a.kind !== b.kind) {
    return a.kind === 'token' ? 1 : -1;
  }
  return 0;
}

function isSameTarget(
  a: HoveredCanvasTarget | null,
  b: HoveredCanvasTarget | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.kind === b.kind && a.id === b.id;
}

function toTargetKey(target: HoveredCanvasTarget): string {
  return `${target.kind}:${target.id}`;
}
