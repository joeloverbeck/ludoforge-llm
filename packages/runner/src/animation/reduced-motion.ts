const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type ReducedMotionChangeHandler = (event: { readonly matches: boolean }) => void;

interface ReducedMotionMediaQueryList {
  matches: boolean;
  addEventListener?(type: 'change', listener: ReducedMotionChangeHandler): void;
  removeEventListener?(type: 'change', listener: ReducedMotionChangeHandler): void;
  addListener?(listener: ReducedMotionChangeHandler): void;
  removeListener?(listener: ReducedMotionChangeHandler): void;
}

interface ReducedMotionWindow {
  matchMedia(query: string): ReducedMotionMediaQueryList;
}

export interface ReducedMotionObserver {
  readonly reduced: boolean;
  subscribe(listener: (reduced: boolean) => void): () => void;
  destroy(): void;
}

export function createReducedMotionObserver(win: ReducedMotionWindow | undefined = globalThis.window): ReducedMotionObserver {
  const mediaQuery = win?.matchMedia?.(REDUCED_MOTION_QUERY) as ReducedMotionMediaQueryList | undefined;
  const listeners = new Set<(reduced: boolean) => void>();

  if (mediaQuery === undefined) {
    return {
      reduced: false,
      subscribe: () => () => {
        // No-op.
      },
      destroy: () => {
        // No-op.
      },
    };
  }

  let reduced = mediaQuery.matches;
  const onChange: ReducedMotionChangeHandler = (event) => {
    reduced = event.matches;
    for (const listener of listeners) {
      listener(reduced);
    }
  };

  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', onChange);
  } else {
    mediaQuery.addListener?.(onChange);
  }

  return {
    get reduced() {
      return reduced;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    destroy() {
      listeners.clear();
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', onChange);
      } else {
        mediaQuery.removeListener?.(onChange);
      }
    },
  };
}
