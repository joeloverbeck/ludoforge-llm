export interface AnimationQueueTimeline {
  eventCallback?(event: 'onComplete', callback: (() => void) | null): AnimationQueueTimeline;
  progress?(value: number): AnimationQueueTimeline;
  pause?(): AnimationQueueTimeline;
  resume?(): AnimationQueueTimeline;
  play?(): AnimationQueueTimeline;
  timeScale?(value: number): AnimationQueueTimeline;
  kill?(): AnimationQueueTimeline;
}

export interface AnimationQueue {
  enqueue(timeline: AnimationQueueTimeline): void;
  skipCurrent(): void;
  skipAll(): void;
  pause(): void;
  resume(): void;
  setSpeed(multiplier: number): void;
  readonly isPlaying: boolean;
  readonly queueLength: number;
  onAllComplete(callback: () => void): void;
  forceFlush(): void;
  destroy(): void;
}

export interface AnimationQueueOptions {
  readonly setAnimationPlaying: (playing: boolean) => void;
  readonly maxQueuedTimelines?: number;
}

const DEFAULT_MAX_QUEUED_TIMELINES = 50;

export function createAnimationQueue(options: AnimationQueueOptions): AnimationQueue {
  const maxQueuedTimelines = options.maxQueuedTimelines ?? DEFAULT_MAX_QUEUED_TIMELINES;
  if (!Number.isInteger(maxQueuedTimelines) || maxQueuedTimelines < 1) {
    throw new Error('Animation queue maxQueuedTimelines must be an integer >= 1.');
  }

  const callbacks = new Set<() => void>();
  const queue: AnimationQueueTimeline[] = [];

  let active: AnimationQueueTimeline | null = null;
  let speedMultiplier = 1;
  let paused = false;
  let destroyed = false;
  let storeFlag = false;

  const setStoreFlag = (playing: boolean): void => {
    if (storeFlag === playing) {
      return;
    }
    storeFlag = playing;
    options.setAnimationPlaying(playing);
  };

  const clearOnComplete = (timeline: AnimationQueueTimeline): void => {
    timeline.eventCallback?.('onComplete', null);
  };

  const completeTimeline = (timeline: AnimationQueueTimeline): void => {
    timeline.progress?.(1);
    timeline.kill?.();
  };

  const killTimeline = (timeline: AnimationQueueTimeline): void => {
    timeline.kill?.();
  };

  const applySpeed = (timeline: AnimationQueueTimeline): void => {
    timeline.timeScale?.(speedMultiplier);
  };

  const applyPauseState = (timeline: AnimationQueueTimeline): void => {
    if (paused) {
      timeline.pause?.();
      return;
    }
    timeline.resume?.();
    timeline.play?.();
  };

  const notifyAllComplete = (): void => {
    for (const callback of callbacks) {
      callback();
    }
  };

  const startNext = (): void => {
    if (destroyed || active !== null) {
      return;
    }

    const next = queue.shift();
    if (next === undefined) {
      setStoreFlag(false);
      notifyAllComplete();
      return;
    }

    active = next;
    setStoreFlag(true);
    applySpeed(next);
    applyPauseState(next);
    next.eventCallback?.('onComplete', () => {
      if (active !== next) {
        return;
      }
      clearOnComplete(next);
      active = null;
      startNext();
    });
  };

  return {
    enqueue(timeline): void {
      if (destroyed) {
        return;
      }

      if (queue.length >= maxQueuedTimelines) {
        const dropped = queue.shift();
        if (dropped !== undefined) {
          clearOnComplete(dropped);
          completeTimeline(dropped);
        }
      }

      queue.push(timeline);
      startNext();
    },

    skipCurrent(): void {
      if (destroyed || active === null) {
        return;
      }

      const current = active;
      clearOnComplete(current);
      active = null;
      completeTimeline(current);
      startNext();
    },

    skipAll(): void {
      if (destroyed) {
        return;
      }

      const current = active;
      if (current !== null) {
        clearOnComplete(current);
      }
      active = null;

      const pending = queue.splice(0, queue.length);
      if (current !== null) {
        completeTimeline(current);
      }
      for (const timeline of pending) {
        clearOnComplete(timeline);
        completeTimeline(timeline);
      }

      setStoreFlag(false);
      notifyAllComplete();
    },

    pause(): void {
      if (destroyed) {
        return;
      }
      paused = true;
      active?.pause?.();
    },

    resume(): void {
      if (destroyed) {
        return;
      }
      paused = false;
      active?.resume?.();
      active?.play?.();
    },

    setSpeed(multiplier): void {
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        throw new Error('Animation speed multiplier must be a finite number > 0.');
      }
      if (destroyed) {
        return;
      }
      speedMultiplier = multiplier;
      active?.timeScale?.(multiplier);
    },

    get isPlaying(): boolean {
      return active !== null;
    },

    get queueLength(): number {
      return queue.length + (active === null ? 0 : 1);
    },

    onAllComplete(callback): void {
      if (destroyed) {
        return;
      }
      callbacks.add(callback);
    },

    forceFlush(): void {
      if (destroyed) {
        return;
      }

      if (active !== null) {
        clearOnComplete(active);
        killTimeline(active);
      }
      active = null;

      while (queue.length > 0) {
        const timeline = queue.shift();
        if (timeline !== undefined) {
          clearOnComplete(timeline);
          killTimeline(timeline);
        }
      }

      setStoreFlag(false);
      notifyAllComplete();
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;

      if (active !== null) {
        clearOnComplete(active);
        killTimeline(active);
      }
      active = null;

      while (queue.length > 0) {
        const timeline = queue.shift();
        if (timeline !== undefined) {
          clearOnComplete(timeline);
          killTimeline(timeline);
        }
      }

      callbacks.clear();
      paused = false;
      setStoreFlag(false);
    },
  };
}
