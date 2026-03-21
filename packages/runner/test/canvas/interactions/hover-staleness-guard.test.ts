import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createHoverStalenessGuard } from '../../../src/canvas/interactions/hover-staleness-guard.js';
import type { HoveredCanvasTarget } from '../../../src/canvas/hover-anchor-contract.js';

describe('createHoverStalenessGuard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears all targets immediately when the viewport starts moving', () => {
    const harness = createHarness();

    harness.guard.onViewportMoving();

    expect(harness.clearAll).toHaveBeenCalledTimes(1);
  });

  it('clears all targets immediately when the canvas pointer leaves', () => {
    const harness = createHarness();

    harness.guard.onCanvasPointerLeave();

    expect(harness.clearAll).toHaveBeenCalledTimes(1);
  });

  it('starts a sweep interval when hover state becomes active', () => {
    const harness = createHarness();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    harness.activeTargets = [zoneTarget('a')];

    harness.guard.onHoverStateChanged();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('stops the sweep interval when hover state becomes empty', () => {
    const harness = createHarness();
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    harness.activeTargets = [zoneTarget('a')];
    harness.guard.onHoverStateChanged();

    harness.activeTargets = [];
    harness.guard.onHoverStateChanged();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('removes targets whose bounds do not contain the pointer', () => {
    const harness = createHarness();
    harness.activeTargets = [zoneTarget('a')];
    harness.pointerPosition = { x: 5, y: 5 };
    harness.resolvedBounds.set('zone:a', rect(20, 20, 10, 10));
    harness.guard.onHoverStateChanged();

    vi.advanceTimersByTime(500);

    expect(harness.removeTarget).toHaveBeenCalledWith(zoneTarget('a'));
    expect(harness.clearAll).not.toHaveBeenCalled();
  });

  it('clears all targets when the pointer position is null', () => {
    const harness = createHarness();
    harness.activeTargets = [zoneTarget('a')];
    harness.pointerPosition = null;
    harness.guard.onHoverStateChanged();

    vi.advanceTimersByTime(500);

    expect(harness.clearAll).toHaveBeenCalledTimes(1);
    expect(harness.removeTarget).not.toHaveBeenCalled();
  });

  it('clears all targets when the pointer is outside the canvas bounds', () => {
    const harness = createHarness();
    harness.activeTargets = [zoneTarget('a')];
    harness.pointerPosition = { x: 150, y: 150 };
    harness.guard.onHoverStateChanged();

    vi.advanceTimersByTime(500);

    expect(harness.clearAll).toHaveBeenCalledTimes(1);
    expect(harness.removeTarget).not.toHaveBeenCalled();
  });

  it('keeps targets whose bounds still contain the pointer', () => {
    const harness = createHarness();
    harness.activeTargets = [zoneTarget('a')];
    harness.pointerPosition = { x: 15, y: 15 };
    harness.resolvedBounds.set('zone:a', rect(10, 10, 10, 10));
    harness.guard.onHoverStateChanged();

    vi.advanceTimersByTime(500);

    expect(harness.clearAll).not.toHaveBeenCalled();
    expect(harness.removeTarget).not.toHaveBeenCalled();
  });

  it('removes targets whose bounds cannot be resolved', () => {
    const harness = createHarness();
    harness.activeTargets = [zoneTarget('a')];
    harness.pointerPosition = { x: 15, y: 15 };
    harness.resolvedBounds.set('zone:a', null);
    harness.guard.onHoverStateChanged();

    vi.advanceTimersByTime(500);

    expect(harness.removeTarget).toHaveBeenCalledWith(zoneTarget('a'));
    expect(harness.clearAll).not.toHaveBeenCalled();
  });

  it('does not create duplicate intervals when hover state changes repeatedly while active', () => {
    const harness = createHarness();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    harness.activeTargets = [zoneTarget('a')];

    harness.guard.onHoverStateChanged();
    harness.guard.onHoverStateChanged();
    harness.guard.onHoverStateChanged();

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('clears any running interval on destroy', () => {
    const harness = createHarness();
    harness.activeTargets = [zoneTarget('a')];
    harness.pointerPosition = { x: 15, y: 15 };
    harness.resolvedBounds.set('zone:a', rect(20, 20, 10, 10));
    harness.guard.onHoverStateChanged();

    harness.guard.destroy();
    vi.advanceTimersByTime(500);

    expect(harness.clearAll).not.toHaveBeenCalled();
    expect(harness.removeTarget).not.toHaveBeenCalled();
  });

  it('does not start a sweep when there are no active targets', () => {
    const harness = createHarness();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    harness.guard.onHoverStateChanged();

    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('tolerates repeated viewport-moving clears', () => {
    const harness = createHarness();

    harness.guard.onViewportMoving();
    harness.guard.onViewportMoving();
    harness.guard.onViewportMoving();

    expect(harness.clearAll).toHaveBeenCalledTimes(3);
  });

  it('turns all public methods into no-ops after destroy', () => {
    const harness = createHarness();
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    harness.activeTargets = [zoneTarget('a')];

    harness.guard.destroy();
    harness.guard.onViewportMoving();
    harness.guard.onCanvasPointerLeave();
    harness.guard.onHoverStateChanged();
    vi.advanceTimersByTime(500);

    expect(harness.clearAll).not.toHaveBeenCalled();
    expect(harness.removeTarget).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });
});

function createHarness() {
  const harness: {
    activeTargets: HoveredCanvasTarget[];
    pointerPosition: { readonly x: number; readonly y: number } | null;
    canvasBounds: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } | null;
    resolvedBounds: Map<string, ReturnType<typeof rect> | null>;
    removeTarget: ReturnType<typeof vi.fn<(target: HoveredCanvasTarget) => void>>;
    clearAll: ReturnType<typeof vi.fn<() => void>>;
    guard?: ReturnType<typeof createHoverStalenessGuard>;
  } = {
    activeTargets: [] as HoveredCanvasTarget[],
    pointerPosition: { x: 10, y: 10 } as { readonly x: number; readonly y: number } | null,
    canvasBounds: { left: 0, top: 0, right: 100, bottom: 100 },
    resolvedBounds: new Map<string, ReturnType<typeof rect> | null>(),
    removeTarget: vi.fn<(target: HoveredCanvasTarget) => void>(),
    clearAll: vi.fn<() => void>(),
  };

  harness.guard = createHoverStalenessGuard({
    getActiveTargets: () => harness.activeTargets,
    removeTarget: harness.removeTarget,
    clearAll: harness.clearAll,
    getPointerScreenPosition: () => harness.pointerPosition,
    getCanvasBounds: () => harness.canvasBounds,
    resolveTargetScreenBounds: (target) => harness.resolvedBounds.get(toKey(target)) ?? null,
  });

  return harness as typeof harness & {
    guard: ReturnType<typeof createHoverStalenessGuard>;
  };
}

function zoneTarget(id: string): HoveredCanvasTarget {
  return { kind: 'zone', id };
}

function rect(left: number, top: number, width: number, height: number) {
  return {
    x: left,
    y: top,
    width,
    height,
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

function toKey(target: HoveredCanvasTarget): string {
  return `${target.kind}:${target.id}`;
}
