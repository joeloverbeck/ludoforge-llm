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

    // Advance past the grace period (100ms)
    await act(async () => {
      vi.advanceTimersByTime(200);
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

  it('normalizes empty description to null', async () => {
    const emptyDescription = { sections: [], limitUsage: [] };
    const describeAction = vi.fn(async () => emptyDescription);
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

  it('keeps tooltip visible during grace period when pointer enters tooltip', async () => {
    const describeAction = vi.fn(async () => ({
      sections: [{ kind: 'group' as const, label: 'Test', children: [{ kind: 'keyword' as const, text: 'x' }] }],
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

    // Leave button — starts grace period
    act(() => {
      result.current.onActionHoverEnd();
    });

    // Enter tooltip during grace period — pins tooltip
    act(() => {
      result.current.onTooltipPointerEnter();
    });

    // Advance past grace period
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Tooltip should still be visible
    expect(result.current.tooltipState.description).not.toBeNull();
    expect(result.current.tooltipState.actionId).toBe('action-1');
  });

  it('dismisses tooltip after pointer leaves tooltip', async () => {
    const describeAction = vi.fn(async () => ({
      sections: [{ kind: 'group' as const, label: 'Test', children: [{ kind: 'keyword' as const, text: 'x' }] }],
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

    // Leave button, enter tooltip
    act(() => {
      result.current.onActionHoverEnd();
    });
    act(() => {
      result.current.onTooltipPointerEnter();
    });

    // Leave tooltip
    act(() => {
      result.current.onTooltipPointerLeave();
    });

    // Advance past grace period
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltipState.actionId).toBeNull();
    expect(result.current.tooltipState.description).toBeNull();
  });

  it('does not dismiss during grace period if button is re-entered', async () => {
    const describeAction = vi.fn(async () => ({
      sections: [{ kind: 'group' as const, label: 'Test', children: [{ kind: 'keyword' as const, text: 'x' }] }],
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

    // Leave button (starts grace)
    act(() => {
      result.current.onActionHoverEnd();
    });

    // Re-enter same button during grace
    act(() => {
      result.current.onActionHoverStart('action-1', createAnchorElement());
    });

    // Grace period expires — should NOT dismiss because we re-entered
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltipState.actionId).toBe('action-1');
  });

  it('dismisses via grace period after moving from hovered tooltip to a different action button', async () => {
    const describeAction = vi.fn(async () => ({
      sections: [{ kind: 'group' as const, label: 'Test', children: [{ kind: 'keyword' as const, text: 'x' }] }],
      limitUsage: [],
    }));
    const bridge = createMockBridge(describeAction);
    const { result } = renderHook(() => useActionTooltip(bridge));

    act(() => {
      result.current.onActionHoverStart('action-A', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.onActionHoverEnd();
      result.current.onTooltipPointerEnter();
      result.current.onActionHoverStart('action-B', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltipState.actionId).toBe('action-B');

    act(() => {
      result.current.onActionHoverEnd();
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltipState.actionId).toBeNull();
    expect(result.current.tooltipState.description).toBeNull();
  });

  it('keeps tooltip visible when action hover end fires after tooltip pointer enter', async () => {
    const describeAction = vi.fn(async () => ({
      sections: [{ kind: 'group' as const, label: 'Test', children: [{ kind: 'keyword' as const, text: 'x' }] }],
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
      result.current.onTooltipPointerEnter();
      result.current.onActionHoverEnd();
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.tooltipState.actionId).toBe('action-1');
    expect(result.current.tooltipState.description).not.toBeNull();
  });

  it('exposes onTooltipPointerEnter and onTooltipPointerLeave callbacks', () => {
    const bridge = createMockBridge();
    const { result } = renderHook(() => useActionTooltip(bridge));

    expect(typeof result.current.onTooltipPointerEnter).toBe('function');
    expect(typeof result.current.onTooltipPointerLeave).toBe('function');
  });
});
