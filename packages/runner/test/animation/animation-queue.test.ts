import { describe, expect, it, vi } from 'vitest';

import { createAnimationQueue, type AnimationQueueTimeline } from '../../src/animation/animation-queue';

interface TimelineFixture {
  readonly timeline: AnimationQueueTimeline;
  readonly progress: ReturnType<typeof vi.fn>;
  readonly pause: ReturnType<typeof vi.fn>;
  readonly resume: ReturnType<typeof vi.fn>;
  readonly play: ReturnType<typeof vi.fn>;
  readonly timeScale: ReturnType<typeof vi.fn>;
  readonly kill: ReturnType<typeof vi.fn>;
  complete(): void;
}

function createTimelineFixture(): TimelineFixture {
  let completeCallback: (() => void) | null = null;

  const progress = vi.fn(() => timeline);
  const pause = vi.fn(() => timeline);
  const resume = vi.fn(() => timeline);
  const play = vi.fn(() => timeline);
  const timeScale = vi.fn(() => timeline);
  const kill = vi.fn(() => timeline);

  const timeline: AnimationQueueTimeline = {
    eventCallback: vi.fn((_event, callback) => {
      completeCallback = callback;
      return timeline;
    }),
    progress,
    pause,
    resume,
    play,
    timeScale,
    kill,
  };

  return {
    timeline,
    progress,
    pause,
    resume,
    play,
    timeScale,
    kill,
    complete: () => {
      completeCallback?.();
    },
  };
}

describe('createAnimationQueue', () => {
  it('toggles animationPlaying on first start and final drain', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });
    const first = createTimelineFixture();
    const second = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.enqueue(second.timeline);

    expect(queue.isPlaying).toBe(true);
    expect(queue.queueLength).toBe(2);
    expect(setAnimationPlaying).toHaveBeenCalledTimes(1);
    expect(setAnimationPlaying).toHaveBeenLastCalledWith(true);

    first.complete();
    expect(queue.isPlaying).toBe(true);
    expect(queue.queueLength).toBe(1);
    expect(setAnimationPlaying).toHaveBeenCalledTimes(1);

    second.complete();
    expect(queue.isPlaying).toBe(false);
    expect(queue.queueLength).toBe(0);
    expect(setAnimationPlaying).toHaveBeenCalledTimes(2);
    expect(setAnimationPlaying).toHaveBeenLastCalledWith(false);
  });

  it('skipCurrent completes active timeline and advances', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });
    const first = createTimelineFixture();
    const second = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.enqueue(second.timeline);

    queue.skipCurrent();

    expect(first.progress).toHaveBeenCalledWith(1);
    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(queue.isPlaying).toBe(true);
    expect(queue.queueLength).toBe(1);

    second.complete();
    expect(queue.isPlaying).toBe(false);
    expect(setAnimationPlaying).toHaveBeenLastCalledWith(false);
  });

  it('skipAll completes active and queued timelines and clears playing state', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });
    const first = createTimelineFixture();
    const second = createTimelineFixture();
    const third = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.enqueue(second.timeline);
    queue.enqueue(third.timeline);

    queue.skipAll();

    expect(first.progress).toHaveBeenCalledWith(1);
    expect(second.progress).toHaveBeenCalledWith(1);
    expect(third.progress).toHaveBeenCalledWith(1);
    expect(queue.isPlaying).toBe(false);
    expect(queue.queueLength).toBe(0);
    expect(setAnimationPlaying).toHaveBeenLastCalledWith(false);
  });

  it('setSpeed applies to active timeline and future started timelines', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });
    const first = createTimelineFixture();
    const second = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.setSpeed(2);
    expect(first.timeScale).toHaveBeenCalledWith(2);

    queue.enqueue(second.timeline);
    first.complete();

    expect(second.timeScale).toHaveBeenCalledWith(2);
  });

  it('pause/resume control active timeline and carry paused state to next timeline', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });
    const first = createTimelineFixture();
    const second = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.pause();
    expect(first.pause).toHaveBeenCalledTimes(1);

    queue.enqueue(second.timeline);
    first.complete();
    expect(second.pause).toHaveBeenCalledTimes(1);

    queue.resume();
    expect(second.resume).toHaveBeenCalledTimes(1);
    expect(second.play).toHaveBeenCalledTimes(1);
  });

  it('drops oldest queued timeline when backlog exceeds maxQueuedTimelines', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying, maxQueuedTimelines: 2 });
    const first = createTimelineFixture();
    const second = createTimelineFixture();
    const third = createTimelineFixture();
    const fourth = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.enqueue(second.timeline);
    queue.enqueue(third.timeline);
    queue.enqueue(fourth.timeline);

    expect(second.progress).toHaveBeenCalledWith(1);
    expect(second.kill).toHaveBeenCalledTimes(1);
    expect(queue.queueLength).toBe(3);

    first.complete();
    third.complete();
    fourth.complete();
    expect(queue.queueLength).toBe(0);
  });

  it('destroy kills active and queued timelines, clears flag, and remains idempotent', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });
    const first = createTimelineFixture();
    const second = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.enqueue(second.timeline);
    queue.destroy();
    queue.destroy();

    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(second.kill).toHaveBeenCalledTimes(1);
    expect(queue.isPlaying).toBe(false);
    expect(queue.queueLength).toBe(0);
    expect(setAnimationPlaying).toHaveBeenLastCalledWith(false);
  });

  it('operations are safe no-ops when queue is empty', () => {
    const queue = createAnimationQueue({ setAnimationPlaying: vi.fn() });

    expect(() => queue.skipCurrent()).not.toThrow();
    expect(() => queue.skipAll()).not.toThrow();
    expect(() => queue.pause()).not.toThrow();
    expect(() => queue.resume()).not.toThrow();
    expect(() => queue.destroy()).not.toThrow();
  });

  it('invokes onAllComplete callbacks when queue drains', () => {
    const queue = createAnimationQueue({ setAnimationPlaying: vi.fn() });
    const timeline = createTimelineFixture();
    const onAllComplete = vi.fn();
    queue.onAllComplete(onAllComplete);

    queue.enqueue(timeline.timeline);
    timeline.complete();

    expect(onAllComplete).toHaveBeenCalledTimes(1);
  });

  it('forceFlush kills active and queued timelines and resets playing state', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });
    const first = createTimelineFixture();
    const second = createTimelineFixture();
    const third = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.enqueue(second.timeline);
    queue.enqueue(third.timeline);

    expect(queue.isPlaying).toBe(true);
    expect(queue.queueLength).toBe(3);

    queue.forceFlush();

    expect(first.kill).toHaveBeenCalledTimes(1);
    expect(second.kill).toHaveBeenCalledTimes(1);
    expect(third.kill).toHaveBeenCalledTimes(1);
    expect(queue.isPlaying).toBe(false);
    expect(queue.queueLength).toBe(0);
    expect(setAnimationPlaying).toHaveBeenLastCalledWith(false);
  });

  it('forceFlush allows new timelines to be enqueued afterwards', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });
    const first = createTimelineFixture();
    const second = createTimelineFixture();

    queue.enqueue(first.timeline);
    queue.forceFlush();

    expect(queue.isPlaying).toBe(false);

    queue.enqueue(second.timeline);
    expect(queue.isPlaying).toBe(true);
    expect(queue.queueLength).toBe(1);
    expect(setAnimationPlaying).toHaveBeenLastCalledWith(true);

    second.complete();
    expect(queue.isPlaying).toBe(false);
  });

  it('forceFlush notifies onAllComplete callbacks', () => {
    const queue = createAnimationQueue({ setAnimationPlaying: vi.fn() });
    const timeline = createTimelineFixture();
    const onAllComplete = vi.fn();
    queue.onAllComplete(onAllComplete);

    queue.enqueue(timeline.timeline);
    queue.forceFlush();

    expect(onAllComplete).toHaveBeenCalledTimes(1);
  });

  it('handles timeline that completes synchronously during play', () => {
    const setAnimationPlaying = vi.fn();
    const queue = createAnimationQueue({ setAnimationPlaying });

    // Create a timeline whose play() fires onComplete synchronously
    let onCompleteCallback: (() => void) | null = null;
    const timeline: AnimationQueueTimeline = {
      eventCallback: vi.fn((_event, callback) => {
        onCompleteCallback = callback;
        return timeline;
      }),
      progress: vi.fn(() => timeline),
      pause: vi.fn(() => timeline),
      resume: vi.fn(() => timeline),
      play: vi.fn(() => {
        // Simulate zero-duration: fire onComplete synchronously during play()
        onCompleteCallback?.();
        return timeline;
      }),
      timeScale: vi.fn(() => timeline),
      kill: vi.fn(() => timeline),
    };

    queue.enqueue(timeline);

    expect(queue.isPlaying).toBe(false);
    expect(queue.queueLength).toBe(0);
    expect(setAnimationPlaying).toHaveBeenCalledWith(true);
    expect(setAnimationPlaying).toHaveBeenCalledWith(false);
  });

  it('rejects invalid speed and queue limit values', () => {
    expect(() => createAnimationQueue({ setAnimationPlaying: vi.fn(), maxQueuedTimelines: 0 })).toThrowError(
      'Animation queue maxQueuedTimelines must be an integer >= 1.',
    );

    const queue = createAnimationQueue({ setAnimationPlaying: vi.fn() });
    expect(() => queue.setSpeed(0)).toThrowError('Animation speed multiplier must be a finite number > 0.');
  });
});
