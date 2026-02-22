import type { Container } from 'pixi.js';

import { neutralizeDisplayObject, safeDestroyDisplayObject } from './safe-destroy.js';

export interface DisposalQueue {
  enqueue(container: Container): void;
  flush(): void;
  destroy(): void;
}

export interface DisposalQueueOptions {
  readonly scheduleFlush?: (callback: () => void) => void;
}

export function createDisposalQueue(options?: DisposalQueueOptions): DisposalQueue {
  const pending = new Set<Container>();
  const schedule = options?.scheduleFlush ?? ((fn: () => void) => requestAnimationFrame(fn));
  let flushScheduled = false;
  let destroyed = false;

  const flush = (): void => {
    flushScheduled = false;
    for (const container of pending) {
      safeDestroyDisplayObject(container, { children: true });
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
