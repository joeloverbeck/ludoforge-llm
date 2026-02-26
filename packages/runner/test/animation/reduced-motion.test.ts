import { describe, expect, it, vi } from 'vitest';

import { createReducedMotionObserver } from '../../src/animation/reduced-motion';

interface MediaQueryFixture {
  readonly mediaQueryList: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    addListener: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
  };
  readonly emit: (matches: boolean) => void;
}

function createMediaQueryFixture(initialMatches = false): MediaQueryFixture {
  let changeHandler: ((event: { readonly matches: boolean }) => void) | null = null;
  const mediaQueryList = {
    matches: initialMatches,
    addEventListener: vi.fn((_type: 'change', listener: (event: { readonly matches: boolean }) => void) => {
      changeHandler = listener;
    }),
    removeEventListener: vi.fn((_type: 'change', listener: (event: { readonly matches: boolean }) => void) => {
      if (changeHandler === listener) {
        changeHandler = null;
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };

  return {
    mediaQueryList,
    emit: (matches: boolean) => {
      mediaQueryList.matches = matches;
      changeHandler?.({ matches });
    },
  };
}

describe('createReducedMotionObserver', () => {
  it('returns no-op observer when matchMedia is unavailable', () => {
    const observer = createReducedMotionObserver(undefined);
    const listener = vi.fn();

    const unsubscribe = observer.subscribe(listener);

    expect(observer.reduced).toBe(false);
    unsubscribe();
    observer.destroy();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reads initial matchMedia value and emits dynamic changes', () => {
    const fixture = createMediaQueryFixture(true);
    const win = {
      matchMedia: vi.fn(() => fixture.mediaQueryList),
    };
    const observer = createReducedMotionObserver(win as never);
    const listener = vi.fn();

    const unsubscribe = observer.subscribe(listener);
    fixture.emit(false);
    fixture.emit(true);

    expect(win.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    expect(observer.reduced).toBe(true);
    expect(listener).toHaveBeenNthCalledWith(1, false);
    expect(listener).toHaveBeenNthCalledWith(2, true);

    unsubscribe();
    observer.destroy();
    expect(fixture.mediaQueryList.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('falls back to addListener/removeListener when addEventListener is unavailable', () => {
    const mediaQueryList = {
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    };
    const observer = createReducedMotionObserver({
      matchMedia: vi.fn(() => mediaQueryList),
    });
    const listener = vi.fn();
    observer.subscribe(listener);

    const registeredListener = mediaQueryList.addListener.mock.calls[0]?.[0] as
      | ((event: { readonly matches: boolean }) => void)
      | undefined;
    registeredListener?.({ matches: true });
    observer.destroy();

    expect(listener).toHaveBeenCalledWith(true);
    expect(mediaQueryList.addListener).toHaveBeenCalledTimes(1);
    expect(mediaQueryList.removeListener).toHaveBeenCalledTimes(1);
  });
});
