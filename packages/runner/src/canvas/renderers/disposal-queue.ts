import type { Container } from 'pixi.js';

import {
  getDestroyFallbackCount,
  neutralizeDisplayObject,
  safeDestroyDisplayObject,
} from './safe-destroy.js';

export interface DisposalQueue {
  enqueue(container: Container): void;
  flush(): void;
  destroy(): void;
}

const DEFAULT_MAX_FLUSH_ERRORS = 5;

export interface DisposalQueueOptions {
  readonly scheduleFlush?: (callback: () => void) => void;
  /** After this many destroy failures in a single flush, remaining items are
   *  neutralized instead of destroyed. Prevents 40+ warning cascades. */
  readonly maxFlushErrors?: number;
}

function scheduleAfterTwoAnimationFrames(callback: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

export function createDisposalQueue(options?: DisposalQueueOptions): DisposalQueue {
  const pending = new Set<Container>();
  const schedule = options?.scheduleFlush ?? scheduleAfterTwoAnimationFrames;
  let flushScheduled = false;
  let destroyed = false;

  const maxFlushErrors = options?.maxFlushErrors ?? DEFAULT_MAX_FLUSH_ERRORS;

  const flush = (): void => {
    flushScheduled = false;
    const baselineErrors = getDestroyFallbackCount();
    for (const container of pending) {
      const errorsSoFar = getDestroyFallbackCount() - baselineErrors;
      if (errorsSoFar >= maxFlushErrors) {
        neutralizeDisplayObject(container);
      } else {
        safeDestroyDisplayObject(container, { children: true });
      }
    }
    pending.clear();
  };

  const scheduleCoalescedFlush = (): void => {
    if (flushScheduled || destroyed) {
      return;
    }
    flushScheduled = true;
    schedule(() => {
      if (!destroyed) {
        flush();
      }
    });
  };

  return {
    enqueue(container: Container): void {
      if (destroyed || pending.has(container)) {
        return;
      }
      neutralizeDisplayObject(container);
      pending.add(container);
      scheduleCoalescedFlush();
    },

    flush,

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      flush();
    },
  };
}
