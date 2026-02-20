import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import { describe, expect, it, vi } from 'vitest';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { createAnimationController } from '../../src/animation/animation-controller';
import { ANIMATION_PRESET_OVERRIDE_KEYS } from '../../src/animation/animation-types';
import { createPresetRegistry } from '../../src/animation/preset-registry';
import { traceToDescriptors } from '../../src/animation/trace-to-descriptors';
import { VisualConfigProvider } from '../../src/config/visual-config-provider';
import type { GameStore } from '../../src/store/game-store';

interface ControllerStoreState {
  readonly effectTrace: readonly EffectTraceEntry[];
  readonly animationPlaying: boolean;
  readonly gameDef: {
    readonly tokenTypes?: readonly {
      readonly id: string;
    }[];
  } | null;
  readonly renderModel: {
    readonly tokens: readonly {
      readonly id: string;
      readonly type: string;
    }[];
  } | null;
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

const NULL_VISUAL_CONFIG_PROVIDER = new VisualConfigProvider(null);

function createControllerStore(): StoreApi<ControllerStoreState> {
  let store!: StoreApi<ControllerStoreState>;
  store = createStore<ControllerStoreState>()(
    subscribeWithSelector((): ControllerStoreState => ({
      effectTrace: [] as readonly EffectTraceEntry[],
      animationPlaying: false,
      gameDef: null,
      renderModel: null,
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

function cardTraceEntries(): readonly EffectTraceEntry[] {
  return [
    {
      kind: 'moveToken',
      tokenId: 'tok:card',
      from: 'zone:deck',
      to: 'zone:hand:p1',
      provenance: {
        phase: 'main',
        eventContext: 'actionEffect',
        effectPath: 'effects.0',
      },
    },
    {
      kind: 'setTokenProp',
      tokenId: 'tok:card',
      prop: 'faceUp',
      oldValue: false,
      newValue: true,
      provenance: {
        phase: 'main',
        eventContext: 'actionEffect',
        effectPath: 'effects.1',
      },
    },
    {
      kind: 'moveToken',
      tokenId: 'tok:card',
      from: 'zone:board',
      to: 'zone:burn',
      provenance: {
        phase: 'main',
        eventContext: 'actionEffect',
        effectPath: 'effects.2',
      },
    },
  ] as const;
}

function cardGameDef() {
  return {
    tokenTypes: [
      { id: 'card' },
      { id: 'chip' },
      { id: 'card-special' },
    ],
  } as const;
}

function cardAnimationProvider(): VisualConfigProvider {
  return new VisualConfigProvider({
    version: 1,
    cardAnimation: {
      cardTokenTypes: {
        ids: ['card'],
        idPrefixes: ['card-'],
      },
      zoneRoles: {
        draw: ['zone:deck'],
        hand: ['zone:hand:p1'],
        shared: ['zone:board'],
        burn: ['zone:burn'],
        discard: ['zone:discard'],
      },
    },
  });
}

function animationOverridesProvider(actions: Partial<Record<(typeof ANIMATION_PRESET_OVERRIDE_KEYS)[number], string>>) {
  return new VisualConfigProvider({
    version: 1,
    animations: {
      actions,
    },
  });
}

function cardRenderModel() {
  return {
    tokens: [
      { id: 'tok:card', type: 'card' },
      { id: 'tok:chip', type: 'chip' },
    ],
  } as const;
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
      forceFlush: vi.fn(),
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
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
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
      undefined,
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
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
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

  it('passes configured animation preset overrides to traceToDescriptors', () => {
    const store = createControllerStore();
    const traceToDescriptorsMock = vi.fn(() => []);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: animationOverridesProvider({ moveToken: 'pulse', cardDeal: 'pulse' }),
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: vi.fn(),
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    const mappingOptions = (traceToDescriptorsMock as unknown as {
      readonly mock: {
        readonly calls: readonly (readonly unknown[])[];
      };
    }).mock.calls[0]![1] as {
      readonly presetOverrides?: ReadonlyMap<string, string>;
    };

    expect(mappingOptions.presetOverrides?.get('moveToken')).toBe('pulse');
    expect(mappingOptions.presetOverrides?.get('cardDeal')).toBe('pulse');

    controller.destroy();
  });

  it('warns and skips invalid configured preset overrides', () => {
    const store = createControllerStore();
    const traceToDescriptorsMock = vi.fn(() => []);
    const onWarning = vi.fn();

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: animationOverridesProvider({ moveToken: 'not-a-preset', cardDeal: 'pulse' }),
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: vi.fn(),
        onError: vi.fn(),
        onWarning,
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    const mappingOptions = (traceToDescriptorsMock as unknown as {
      readonly mock: {
        readonly calls: readonly (readonly unknown[])[];
      };
    }).mock.calls[0]![1] as {
      readonly presetOverrides?: ReadonlyMap<string, string>;
    };

    expect(onWarning).toHaveBeenCalledWith(
      'Ignoring animation preset override "moveToken" -> "not-a-preset" because the preset is not registered.',
    );
    expect(mappingOptions.presetOverrides?.has('moveToken')).toBe(false);
    expect(mappingOptions.presetOverrides?.get('cardDeal')).toBe('pulse');

    controller.destroy();
  });

  it('builds animation preset overrides once per controller lifecycle', () => {
    const store = createControllerStore();
    const provider = animationOverridesProvider({ moveToken: 'pulse' });
    const getAnimationPresetSpy = vi.spyOn(provider, 'getAnimationPreset');

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: provider,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: vi.fn(() => []),
        buildTimeline: vi.fn(),
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });
    store.setState({ effectTrace: [traceEntry()] });

    expect(getAnimationPresetSpy).toHaveBeenCalledTimes(ANIMATION_PRESET_OVERRIDE_KEYS.length);

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
      forceFlush: vi.fn(),
      destroy: vi.fn(),
    };
    const buildTimelineMock = vi.fn();

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
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
      forceFlush: vi.fn(),
      destroy: vi.fn(),
    };

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
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
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
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

  it('provides card mapping context from visual config selectors and render tokens', () => {
    const store = createControllerStore();
    const traceToDescriptorsMock = vi.fn(() => []);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: cardAnimationProvider(),
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: vi.fn(),
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({
      gameDef: cardGameDef(),
      renderModel: {
        tokens: [
          { id: 'tok:card', type: 'card' },
          { id: 'tok:card-special', type: 'card-special' },
          { id: 'tok:chip', type: 'chip' },
        ],
      },
      effectTrace: [traceEntry()],
    });

    expect(traceToDescriptorsMock).toHaveBeenCalledWith(
      store.getState().effectTrace,
      expect.objectContaining({
        detailLevel: 'full',
        cardContext: expect.objectContaining({
          cardTokenTypeIds: expect.any(Set),
          tokenTypeByTokenId: expect.any(Map),
          zoneRoles: expect.objectContaining({
            draw: expect.any(Set),
            hand: expect.any(Set),
            shared: expect.any(Set),
            burn: expect.any(Set),
            discard: expect.any(Set),
          }),
        }),
      }),
      expect.any(Object),
    );

    expect(traceToDescriptorsMock).toHaveBeenCalledTimes(1);

    const mappingOptions = (traceToDescriptorsMock as unknown as {
      readonly mock: {
        readonly calls: readonly (readonly unknown[])[];
      };
    }).mock.calls[0]![1] as {
      readonly cardContext: {
        readonly cardTokenTypeIds: ReadonlySet<string>;
        readonly tokenTypeByTokenId: ReadonlyMap<string, string>;
        readonly zoneRoles: {
          readonly draw: ReadonlySet<string>;
          readonly hand: ReadonlySet<string>;
          readonly shared: ReadonlySet<string>;
          readonly burn: ReadonlySet<string>;
          readonly discard: ReadonlySet<string>;
        };
      };
    };
    expect(mappingOptions.cardContext.cardTokenTypeIds.has('card')).toBe(true);
    expect(mappingOptions.cardContext.cardTokenTypeIds.has('card-special')).toBe(true);
    expect(mappingOptions.cardContext.tokenTypeByTokenId.get('tok:card')).toBe('card');
    expect(mappingOptions.cardContext.zoneRoles.burn.has('zone:burn')).toBe(true);

    controller.destroy();
  });

  it('forwards playback controls to queue', () => {
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
      forceFlush: vi.fn(),
      destroy: vi.fn(),
    };
    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => queue,
        traceToDescriptors: vi.fn(() => []),
        buildTimeline: vi.fn(),
        onError: vi.fn(),
      },
    );

    controller.setSpeed(4);
    controller.pause();
    controller.resume();
    controller.skipCurrent();
    controller.skipAll();

    expect(queue.setSpeed).toHaveBeenCalledWith(4);
    expect(queue.pause).toHaveBeenCalledTimes(1);
    expect(queue.resume).toHaveBeenCalledTimes(1);
    expect(queue.skipCurrent).toHaveBeenCalledTimes(1);
    expect(queue.skipAll).toHaveBeenCalledTimes(1);
  });

  it('accepts a combined card deal/flip/burn flow and preserves playback control forwarding', () => {
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
      forceFlush: vi.fn(),
      destroy: vi.fn(),
    };
    const buildTimelineMock = vi.fn(() => timeline.timeline);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: cardAnimationProvider(),
        tokenContainers: () => new Map([['tok:card', {}]]) as never,
        zoneContainers: () => new Map([
          ['zone:deck', {}],
          ['zone:hand:p1', {}],
          ['zone:board', {}],
          ['zone:burn', {}],
        ]) as never,
        zonePositions: () => ({
          positions: new Map([
            ['zone:deck', { x: 0, y: 0 }],
            ['zone:hand:p1', { x: 10, y: 0 }],
            ['zone:board', { x: 5, y: 5 }],
            ['zone:burn', { x: 15, y: 5 }],
          ]),
          bounds: { minX: 0, minY: 0, maxX: 15, maxY: 5 },
        }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => queue,
        traceToDescriptors,
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({
      gameDef: cardGameDef(),
      renderModel: cardRenderModel(),
      effectTrace: cardTraceEntries(),
    });

    expect(buildTimelineMock).toHaveBeenCalledTimes(1);
    const buildTimelineCalls = (buildTimelineMock as unknown as {
      readonly mock: {
        readonly calls: readonly (readonly [readonly { readonly kind: string }[]])[];
      };
    }).mock.calls;
    const descriptors = buildTimelineCalls[0]?.[0] ?? [];
    expect(descriptors.map((descriptor) => descriptor.kind)).toEqual(['cardDeal', 'cardFlip', 'cardBurn']);
    expect(queue.enqueue).toHaveBeenCalledWith(timeline.timeline);

    controller.setSpeed(2);
    controller.pause();
    controller.resume();
    controller.skipCurrent();
    controller.skipAll();

    expect(queue.setSpeed).toHaveBeenCalledWith(2);
    expect(queue.pause).toHaveBeenCalledTimes(1);
    expect(queue.resume).toHaveBeenCalledTimes(1);
    expect(queue.skipCurrent).toHaveBeenCalledTimes(1);
    expect(queue.skipAll).toHaveBeenCalledTimes(1);
  });

  it('fast-forwards combined card deal/flip/burn flow under reduced motion', () => {
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
      forceFlush: vi.fn(),
      destroy: vi.fn(),
    };
    const buildTimelineMock = vi.fn(() => timeline.timeline);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: cardAnimationProvider(),
        tokenContainers: () => new Map([['tok:card', {}]]) as never,
        zoneContainers: () => new Map([
          ['zone:deck', {}],
          ['zone:hand:p1', {}],
          ['zone:board', {}],
          ['zone:burn', {}],
        ]) as never,
        zonePositions: () => ({
          positions: new Map([
            ['zone:deck', { x: 0, y: 0 }],
            ['zone:hand:p1', { x: 10, y: 0 }],
            ['zone:board', { x: 5, y: 5 }],
            ['zone:burn', { x: 15, y: 5 }],
          ]),
          bounds: { minX: 0, minY: 0, maxX: 15, maxY: 5 },
        }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => queue,
        traceToDescriptors,
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
      },
    );

    controller.start();
    controller.setReducedMotion(true);
    store.setState({
      gameDef: cardGameDef(),
      renderModel: cardRenderModel(),
      effectTrace: cardTraceEntries(),
    });

    expect(buildTimelineMock).toHaveBeenCalledTimes(1);
    const buildTimelineCalls = (buildTimelineMock as unknown as {
      readonly mock: {
        readonly calls: readonly (readonly [readonly { readonly kind: string }[]])[];
      };
    }).mock.calls;
    const descriptors = buildTimelineCalls[0]?.[0] ?? [];
    expect(descriptors.map((descriptor) => descriptor.kind)).toEqual(['cardDeal', 'cardFlip', 'cardBurn']);
    expect(queue.skipAll).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(timeline.progress).toHaveBeenCalledWith(1);
    expect(timeline.kill).toHaveBeenCalledTimes(1);
  });

  it('reports descriptor mapping error and still processes future traces', () => {
    const store = createControllerStore();
    const onError = vi.fn();
    const traceToDescriptorsMock = vi.fn()
      .mockImplementationOnce(() => { throw new Error('mapping kaboom'); })
      .mockImplementationOnce(() => []);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), destroy: vi.fn(), forceFlush: vi.fn(),
        }),
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: vi.fn(),
        onError,
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toContain('Descriptor mapping failed');

    store.setState({ effectTrace: [traceEntry()] });
    expect(traceToDescriptorsMock).toHaveBeenCalledTimes(2);

    controller.destroy();
  });

  it('reports timeline build error and still processes future traces', () => {
    const store = createControllerStore();
    const onError = vi.fn();
    const buildTimelineMock = vi.fn()
      .mockImplementationOnce(() => { throw new Error('timeline kaboom'); })
      .mockImplementationOnce(() => ({ add: vi.fn(), progress: vi.fn(), kill: vi.fn() }));
    const queue = {
      enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
      isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), destroy: vi.fn(), forceFlush: vi.fn(),
    };

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
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
          { kind: 'moveToken', tokenId: 'tok:1', from: 'zone:a', to: 'zone:b', preset: 'arc-tween', isTriggered: false } as const,
        ]),
        buildTimeline: buildTimelineMock,
        onError,
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toContain('Timeline build failed');
    expect(queue.enqueue).not.toHaveBeenCalled();

    store.setState({ effectTrace: [traceEntry()] });
    expect(buildTimelineMock).toHaveBeenCalledTimes(2);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('forceFlush delegates to queue and allows future processing', () => {
    const store = createControllerStore();
    const timeline = createTimelineFixture();
    const queue = {
      enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
      isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), destroy: vi.fn(), forceFlush: vi.fn(),
    };

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
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
          { kind: 'moveToken', tokenId: 'tok:1', from: 'zone:a', to: 'zone:b', preset: 'arc-tween', isTriggered: false } as const,
        ]),
        buildTimeline: vi.fn(() => timeline.timeline),
        onError: vi.fn(),
      },
    );

    controller.start();
    controller.forceFlush();

    expect(queue.forceFlush).toHaveBeenCalledTimes(1);

    store.setState({ effectTrace: [traceEntry()] });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('skips processing when isCanvasReady returns false', () => {
    const store = createControllerStore();
    const traceToDescriptorsMock = vi.fn(() => []);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
        isCanvasReady: () => false,
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: vi.fn(),
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(traceToDescriptorsMock).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('processes traces normally when isCanvasReady returns true', () => {
    const store = createControllerStore();
    const traceToDescriptorsMock = vi.fn(() => []);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
        isCanvasReady: () => true,
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: vi.fn(),
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(traceToDescriptorsMock).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('processes traces when isCanvasReady is not provided (backward compatibility)', () => {
    const store = createControllerStore();
    const traceToDescriptorsMock = vi.fn(() => []);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => new Map() as never,
        zoneContainers: () => new Map() as never,
        zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry: createPresetRegistry(),
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: vi.fn(),
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(traceToDescriptorsMock).toHaveBeenCalledTimes(1);

    controller.destroy();
  });
});
