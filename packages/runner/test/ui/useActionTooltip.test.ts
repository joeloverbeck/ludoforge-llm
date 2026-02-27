// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GameBridge } from '../../src/bridge/game-bridge.js';
import { useActionTooltip } from '../../src/ui/useActionTooltip.js';

function createMockBridge(describeActionImpl?: (...args: unknown[]) => unknown): GameBridge {
  return {
    describeAction: describeActionImpl ?? vi.fn(async () => null),
  } as unknown as GameBridge;
}

function createAnchorElement(): HTMLElement {
  return document.createElement('button');
}

describe('useActionTooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not call describeAction when hover ends before debounce fires', async () => {
    const describeAction = vi.fn(async () => null);
    const bridge = createMockBridge(describeAction);

    const { result } = renderHook(() => useActionTooltip(bridge));

    act(() => {
      result.current.onActionHoverStart('action-1', createAnchorElement());
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    act(() => {
      result.current.onActionHoverEnd();
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(describeAction).not.toHaveBeenCalled();
  });

  it('calls describeAction exactly once after debounce expires', async () => {
    const describeAction = vi.fn(async () => null);
    const bridge = createMockBridge(describeAction);

    const { result } = renderHook(() => useActionTooltip(bridge));

    act(() => {
      result.current.onActionHoverStart('action-1', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(describeAction).toHaveBeenCalledTimes(1);
    expect(describeAction).toHaveBeenCalledWith('action-1');
  });

  it('discards stale response when hovering a new action before previous resolves', async () => {
    let resolveFirst!: (value: null) => void;
    const firstPromise = new Promise<null>((resolve) => {
      resolveFirst = resolve;
    });

    const secondResult = {
      sections: [{ kind: 'group' as const, label: 'Test', children: [{ kind: 'keyword' as const, text: 'Second' }] }],
      limitUsage: [],
    };
    let resolveSecond!: (value: typeof secondResult) => void;
    const secondPromise = new Promise<typeof secondResult>((resolve) => {
      resolveSecond = resolve;
    });

    const describeAction = vi.fn()
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);
    const bridge = createMockBridge(describeAction);

    const { result } = renderHook(() => useActionTooltip(bridge));

    // Hover action A
    act(() => {
      result.current.onActionHoverStart('action-A', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Hover action B before A resolves
    act(() => {
      result.current.onActionHoverStart('action-B', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Resolve first (stale) — should be discarded
    await act(async () => {
      resolveFirst(null);
    });

    expect(result.current.tooltipState.actionId).toBe('action-B');
    expect(result.current.tooltipState.description).toBeNull();

    // Resolve second — should update
    await act(async () => {
      resolveSecond(secondResult);
    });

    expect(result.current.tooltipState.actionId).toBe('action-B');
    expect(result.current.tooltipState.description).toEqual(secondResult);
    expect(result.current.tooltipState.loading).toBe(false);
  });

  it('resets all state fields on hover end', async () => {
    const describeAction = vi.fn(async () => ({
      sections: [{ kind: 'group' as const, label: 'Test', children: [{ kind: 'keyword' as const, text: 'Description' }] }],
      limitUsage: [],
    }));
    const bridge = createMockBridge(describeAction);

    const { result } = renderHook(() => useActionTooltip(bridge));

    act(() => {
      result.current.onActionHoverStart('action-1', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.onActionHoverEnd();
    });

    expect(result.current.tooltipState.actionId).toBeNull();
    expect(result.current.tooltipState.description).toBeNull();
    expect(result.current.tooltipState.loading).toBe(false);
    expect(result.current.tooltipState.anchorElement).toBeNull();
  });

  it('sets loading to true between debounce expiry and response arrival', async () => {
    let resolveDescribe!: (value: null) => void;
    const pendingPromise = new Promise<null>((resolve) => {
      resolveDescribe = resolve;
    });

    const describeAction = vi.fn(() => pendingPromise);
    const bridge = createMockBridge(describeAction);

    const { result } = renderHook(() => useActionTooltip(bridge));

    act(() => {
      result.current.onActionHoverStart('action-1', createAnchorElement());
    });

    expect(result.current.tooltipState.loading).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltipState.loading).toBe(true);

    await act(async () => {
      resolveDescribe(null);
    });

    expect(result.current.tooltipState.loading).toBe(false);
  });

  it('handles null response from describeAction gracefully', async () => {
    const describeAction = vi.fn(async () => null);
    const bridge = createMockBridge(describeAction);

    const { result } = renderHook(() => useActionTooltip(bridge));

    act(() => {
      result.current.onActionHoverStart('action-1', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltipState.description).toBeNull();
    expect(result.current.tooltipState.loading).toBe(false);
    expect(result.current.tooltipState.actionId).toBe('action-1');
  });

  it('handles describeAction rejection without crashing', async () => {
    const describeAction = vi.fn(async () => {
      throw new Error('Worker error');
    });
    const bridge = createMockBridge(describeAction);

    const { result } = renderHook(() => useActionTooltip(bridge));

    act(() => {
      result.current.onActionHoverStart('action-1', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltipState.loading).toBe(false);
    expect(result.current.tooltipState.actionId).toBe('action-1');
  });
});
