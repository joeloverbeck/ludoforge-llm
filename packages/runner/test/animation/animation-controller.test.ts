import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import { describe, expect, it, vi } from 'vitest';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { createAnimationController } from '../../src/animation/animation-controller';
import { createPresetRegistry } from '../../src/animation/preset-registry';
import type { GameStore } from '../../src/store/game-store';

interface ControllerStoreState {
  readonly effectTrace: readonly EffectTraceEntry[];
  readonly animationPlaying: boolean;
  setAnimationPlaying(playing: boolean): void;
}

interface TimelineFixture {
  readonly timeline: {
    readonly add: ReturnType<typeof vi.fn>;
    readonly progress: ReturnType<typeof vi.fn>;
    readonly kill: ReturnType<typeof vi.fn>;
  };
  readonly progress: ReturnType<typeof vi.fn>;
  readonly kill: ReturnType<typeof vi.fn>;
}

function createControllerStore(): StoreApi<ControllerStoreState> {
  let store!: StoreApi<ControllerStoreState>;
  store = createStore<ControllerStoreState>()(
    subscribeWithSelector((): ControllerStoreState => ({
      effectTrace: [] as readonly EffectTraceEntry[],
      animationPlaying: false,
      setAnimationPlaying: (playing: boolean) => {
        store.setState({ animationPlaying: playing });
      },
    })),
  );
  return store;
}

function createTimelineFixture(): TimelineFixture {
  const progress = vi.fn();
  const kill = vi.fn();
  return {
    timeline: {
      add: vi.fn(),
      progress,
      kill,
    },
    progress,
    kill,
  };
}

function traceEntry(): EffectTraceEntry {
  return {
    kind: 'moveToken',
    tokenId: 'tok:1',
    from: 'zone:a',
    to: 'zone:b',
    provenance: {
      phase: 'main',
      eventContext: 'actionEffect',
      effectPath: 'effects.0',
    },
  };
}

describe('createAnimationController', () => {
  it('subscribes to effectTrace changes and enqueues built timelines', () => {
    const store = createControllerStore();
    const timeline = createTimelineFixture();
    const queue = {
      enqueue: vi.fn(),
      skipCurrent: vi.fn(),
      skipAll: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      setSpeed: vi.fn(),
      isPlaying: false,
      queueLength: 0,
      onAllComplete: vi.fn(),
      destroy: vi.fn(),
    };
    const tokenContainers = new Map([['tok:1', {}]]);
    const zoneContainers = new Map([['zone:a', {}], ['zone:b', {}]]);
    const zonePositions = {
      positions: new Map([['zone:a', { x: 0, y: 0 }], ['zone:b', { x: 10, y: 20 }]]),
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 20 },
    };
    const presetRegistry = createPresetRegistry();

    const traceToDescriptorsMock = vi.fn(() => [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      } as const,
    ]);
    const buildTimelineMock = vi.fn(() => timeline.timeline);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        tokenContainers: () => tokenContainers as never,
        zoneContainers: () => zoneContainers as never,
        zonePositions: () => zonePositions,
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry,
        queueFactory: () => queue,
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(traceToDescriptorsMock).toHaveBeenCalledWith(
      store.getState().effectTrace,
      { detailLevel: 'full' },
      presetRegistry,
    );
    expect(buildTimelineMock).toHaveBeenCalledWith(
      expect.any(Array),
      presetRegistry,
      {
        tokenContainers,
        zoneContainers,
        zonePositions,
      },
      expect.any(Object),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(timeline.timeline);

    controller.destroy();
    expect(queue.destroy).toHaveBeenCalledTimes(1);
  });

  it('uses updated detail level when mapping descriptors', () => {
    const store = createControllerStore();
    const traceToDescriptorsMock = vi.fn(() => []);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: vi.fn(),
        onError: vi.fn(),
      },
    );

    controller.start();
    controller.setDetailLevel('minimal');
    store.setState({ effectTrace: [traceEntry()] });

    expect(traceToDescriptorsMock).toHaveBeenCalledWith(
      store.getState().effectTrace,
      { detailLevel: 'minimal' },
      expect.any(Object),
    );

    controller.destroy();
  });

  it('skips queueing when descriptors contain no visual entries', () => {
    const store = createControllerStore();
    const queue = {
      enqueue: vi.fn(),
      skipCurrent: vi.fn(),
      skipAll: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      setSpeed: vi.fn(),
      isPlaying: false,
      queueLength: 0,
      onAllComplete: vi.fn(),
      destroy: vi.fn(),
    };
    const buildTimelineMock = vi.fn();

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => queue,
        traceToDescriptors: vi.fn(() => [{ kind: 'skipped', traceKind: 'forEach' } as const]),
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(buildTimelineMock).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('applies reduced motion by skipping queue and fast-forwarding timeline', () => {
    const store = createControllerStore();
    const timeline = createTimelineFixture();
    const queue = {
      enqueue: vi.fn(),
      skipCurrent: vi.fn(),
      skipAll: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      setSpeed: vi.fn(),
      isPlaying: false,
      queueLength: 0,
      onAllComplete: vi.fn(),
      destroy: vi.fn(),
    };

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        tokenContainers: () => new Map([['tok:1', {}]]) as never,
        zoneContainers: () => new Map([['zone:a', {}], ['zone:b', {}]]) as never,
        zonePositions: () => ({
          positions: new Map([['zone:a', { x: 0, y: 0 }], ['zone:b', { x: 10, y: 20 }]]),
          bounds: { minX: 0, minY: 0, maxX: 10, maxY: 20 },
        }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => queue,
        traceToDescriptors: vi.fn(() => [
          {
            kind: 'moveToken',
            tokenId: 'tok:1',
            from: 'zone:a',
            to: 'zone:b',
            preset: 'arc-tween',
            isTriggered: false,
          } as const,
        ]),
        buildTimeline: vi.fn(() => timeline.timeline),
        onError: vi.fn(),
      },
    );

    controller.start();
    controller.setReducedMotion(true);
    store.setState({ effectTrace: [traceEntry()] });

    expect(queue.skipAll).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(timeline.progress).toHaveBeenCalledWith(1);
    expect(timeline.kill).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('reports processing errors and keeps controller alive', () => {
    const store = createControllerStore();
    const onError = vi.fn();

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: vi.fn(() => {
          throw new Error('mapping failed');
        }),
        buildTimeline: vi.fn(),
        onError,
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(onError).toHaveBeenCalledTimes(1);

    store.setState({ effectTrace: [traceEntry()] });
    expect(onError).toHaveBeenCalledTimes(2);

    controller.destroy();
  });
});
