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
});
