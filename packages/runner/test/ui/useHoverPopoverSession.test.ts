// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHoverPopoverSession } from '../../src/ui/useHoverPopoverSession.js';

function createAnchorElement(): HTMLElement {
  return document.createElement('div');
}

describe('useHoverPopoverSession', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invalidates while debounce is pending', () => {
    const loadContent = vi.fn((source: string) => source.toUpperCase());
    const { result } = renderHook(() => useHoverPopoverSession<string, string>({ loadContent }));

    act(() => {
      result.current.startHover('alpha', createAnchorElement());
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.source).toBe('alpha');

    act(() => {
      result.current.invalidate();
      vi.advanceTimersByTime(250);
    });

    expect(loadContent).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');
    expect(result.current.source).toBeNull();
    expect(result.current.anchorElement).toBeNull();
  });

  it('invalidates while async content is in flight', async () => {
    let resolveContent!: (value: string) => void;
    const loadContent = vi.fn(() => new Promise<string>((resolve) => {
      resolveContent = resolve;
    }));
    const { result } = renderHook(() => useHoverPopoverSession<string, string>({ loadContent }));

    act(() => {
      result.current.startHover('alpha', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.loading).toBe(true);

    act(() => {
      result.current.invalidate();
    });

    await act(async () => {
      resolveContent('ALPHA');
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.source).toBeNull();
    expect(result.current.content).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('suppresses stale async completion after source change', async () => {
    let resolveFirst!: (value: string) => void;
    const firstPromise = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    let resolveSecond!: (value: string) => void;
    const secondPromise = new Promise<string>((resolve) => {
      resolveSecond = resolve;
    });

    const loadContent = vi.fn()
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);
    const { result } = renderHook(() => useHoverPopoverSession<string, string>({ loadContent }));

    act(() => {
      result.current.startHover('alpha', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.startHover('beta', createAnchorElement());
    });

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    await act(async () => {
      resolveFirst('ALPHA');
    });

    expect(result.current.source).toBe('beta');
    expect(result.current.content).toBeNull();

    await act(async () => {
      resolveSecond('BETA');
    });

    expect(result.current.source).toBe('beta');
    expect(result.current.content).toBe('BETA');
    expect(result.current.status).toBe('visible');
  });

  it('resolves synchronous content after debounce', () => {
    const loadContent = vi.fn((source: string) => source.toUpperCase());
    const { result } = renderHook(() => useHoverPopoverSession<string, string>({ loadContent }));

    act(() => {
      result.current.startHover('alpha', createAnchorElement());
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(loadContent).toHaveBeenCalledWith('alpha');
    expect(result.current.content).toBe('ALPHA');
    expect(result.current.status).toBe('visible');
    expect(result.current.loading).toBe(false);
  });

  it('dismisses after grace period when popover is not entered', () => {
    const { result } = renderHook(() => useHoverPopoverSession<string, string>({
      loadContent: (source) => source.toUpperCase(),
    }));

    act(() => {
      result.current.startHover('alpha', createAnchorElement());
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.endHover();
    });

    expect(result.current.interactionOwner).toBe('grace');

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.content).toBeNull();
  });

  it('keeps session visible when pointer enters the popover during grace', () => {
    const { result } = renderHook(() => useHoverPopoverSession<string, string>({
      loadContent: (source) => source.toUpperCase(),
    }));

    act(() => {
      result.current.startHover('alpha', createAnchorElement());
      vi.advanceTimersByTime(200);
    });

    act(() => {
      result.current.endHover();
      vi.advanceTimersByTime(50);
      result.current.onPopoverPointerEnter();
      vi.advanceTimersByTime(100);
    });

    expect(result.current.status).toBe('visible');
    expect(result.current.content).toBe('ALPHA');
    expect(result.current.interactionOwner).toBe('popover');
  });

  it('dismiss clears all session state immediately', () => {
    const { result } = renderHook(() => useHoverPopoverSession<string, string>({
      loadContent: (source) => source.toUpperCase(),
    }));

    act(() => {
      result.current.startHover('alpha', createAnchorElement());
      vi.advanceTimersByTime(200);
    });

    const populatedRevision = result.current.revision;

    act(() => {
      result.current.dismiss();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.source).toBeNull();
    expect(result.current.anchorElement).toBeNull();
    expect(result.current.content).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.revision).toBeGreaterThan(populatedRevision);
  });
});
