import { describe, expect, it, vi } from 'vitest';

import { createHoverTargetController } from '../../../src/canvas/interactions/hover-target-controller';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve();
}

describe('createHoverTargetController', () => {
  it('ignores stale leave from previous target after transition', async () => {
    const onTargetChange = vi.fn();
    const controller = createHoverTargetController({ onTargetChange });

    controller.onHoverEnter({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();
    controller.onHoverEnter({ kind: 'token', id: 'token:1' });
    controller.onHoverLeave({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();

    expect(onTargetChange).toHaveBeenNthCalledWith(1, { kind: 'zone', id: 'zone:a' });
    expect(onTargetChange).toHaveBeenNthCalledWith(2, { kind: 'token', id: 'token:1' });
    expect(onTargetChange).toHaveBeenCalledTimes(2);
    expect(controller.getCurrentTarget()).toEqual({ kind: 'token', id: 'token:1' });
  });

  it('applies deterministic overlap precedence with token above zone', async () => {
    const onTargetChange = vi.fn();
    const controller = createHoverTargetController({ onTargetChange });

    controller.onHoverEnter({ kind: 'zone', id: 'zone:a' });
    controller.onHoverEnter({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();

    expect(onTargetChange).toHaveBeenCalledTimes(1);
    expect(onTargetChange).toHaveBeenCalledWith({ kind: 'token', id: 'token:1' });
    expect(controller.getCurrentTarget()).toEqual({ kind: 'token', id: 'token:1' });
  });

  it('falls back to remaining hovered target when top-priority target leaves', async () => {
    const onTargetChange = vi.fn();
    const controller = createHoverTargetController({ onTargetChange });

    controller.onHoverEnter({ kind: 'zone', id: 'zone:a' });
    controller.onHoverEnter({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();
    controller.onHoverLeave({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();

    expect(onTargetChange).toHaveBeenNthCalledWith(1, { kind: 'token', id: 'token:1' });
    expect(onTargetChange).toHaveBeenNthCalledWith(2, { kind: 'zone', id: 'zone:a' });
    expect(controller.getCurrentTarget()).toEqual({ kind: 'zone', id: 'zone:a' });
  });

  it('clears all active targets and publishes null', async () => {
    const onTargetChange = vi.fn();
    const controller = createHoverTargetController({ onTargetChange });

    controller.onHoverEnter({ kind: 'zone', id: 'zone:a' });
    controller.onHoverEnter({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();

    expect(controller.getCurrentTarget()).toEqual({ kind: 'token', id: 'token:1' });

    controller.clearAll();
    expect(onTargetChange).toHaveBeenCalledTimes(1);

    await flushMicrotasks();

    expect(onTargetChange).toHaveBeenNthCalledWith(2, null);
    expect(controller.getCurrentTarget()).toBeNull();
    expect(controller.getActiveTargets()).toEqual([]);
  });

  it('returns a detached snapshot of active targets', async () => {
    const controller = createHoverTargetController({ onTargetChange: vi.fn() });

    controller.onHoverEnter({ kind: 'zone', id: 'zone:a' });
    controller.onHoverEnter({ kind: 'token', id: 'token:1' });
    controller.onHoverLeave({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();

    const snapshot = [...controller.getActiveTargets()];

    expect(snapshot).toEqual([{ kind: 'token', id: 'token:1' }]);

    snapshot.pop();

    expect(controller.getActiveTargets()).toEqual([{ kind: 'token', id: 'token:1' }]);
  });

  it('removes a specific target and republishes the highest-priority remaining target', async () => {
    const onTargetChange = vi.fn();
    const controller = createHoverTargetController({ onTargetChange });

    controller.onHoverEnter({ kind: 'zone', id: 'zone:a' });
    controller.onHoverEnter({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();

    controller.removeTarget({ kind: 'token', id: 'token:1' });
    await flushMicrotasks();

    expect(onTargetChange).toHaveBeenNthCalledWith(1, { kind: 'token', id: 'token:1' });
    expect(onTargetChange).toHaveBeenNthCalledWith(2, { kind: 'zone', id: 'zone:a' });
    expect(controller.getCurrentTarget()).toEqual({ kind: 'zone', id: 'zone:a' });
    expect(controller.getActiveTargets()).toEqual([{ kind: 'zone', id: 'zone:a' }]);
  });

  it('treats removing an absent target as a no-op', async () => {
    const onTargetChange = vi.fn();
    const controller = createHoverTargetController({ onTargetChange });

    controller.onHoverEnter({ kind: 'zone', id: 'zone:a' });
    await flushMicrotasks();

    controller.removeTarget({ kind: 'token', id: 'token:missing' });
    controller.clearAll();
    controller.clearAll();
    await flushMicrotasks();

    expect(onTargetChange).toHaveBeenNthCalledWith(1, { kind: 'zone', id: 'zone:a' });
    expect(onTargetChange).toHaveBeenNthCalledWith(2, null);
    expect(onTargetChange).toHaveBeenCalledTimes(2);
  });

  it('treats new guard-facing methods as no-ops after destroy', async () => {
    const onTargetChange = vi.fn();
    const controller = createHoverTargetController({ onTargetChange });

    controller.onHoverEnter({ kind: 'zone', id: 'zone:a' });
    controller.destroy();

    controller.clearAll();
    controller.removeTarget({ kind: 'zone', id: 'zone:a' });

    await flushMicrotasks();

    expect(onTargetChange).not.toHaveBeenCalled();
    expect(controller.getCurrentTarget()).toBeNull();
    expect(controller.getActiveTargets()).toEqual([]);
  });
});
