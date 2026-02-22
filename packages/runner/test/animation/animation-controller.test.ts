import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import { Container as PixiContainer, Graphics } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { createAnimationController } from '../../src/animation/animation-controller';
import type { DiagnosticBuffer } from '../../src/animation/diagnostic-buffer';
import { createDiagnosticBuffer } from '../../src/animation/diagnostic-buffer';
import type { AnimationLogger } from '../../src/animation/animation-logger';
import { ANIMATION_PRESET_OVERRIDE_KEYS } from '../../src/animation/animation-types';
import { createNoopGsapRuntime, initializeAnimationRuntime } from '../../src/animation/bootstrap-runtime';
import { createPresetRegistry } from '../../src/animation/preset-registry';
import type { BuildTimelineOptions } from '../../src/animation/timeline-builder';
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

function createMockLogger(enabledInitial = false): AnimationLogger {
  let enabled = enabledInitial;
  return {
    get enabled(): boolean {
      return enabled;
    },
    setEnabled: vi.fn((value: boolean) => {
      enabled = value;
    }),
    beginBatch: vi.fn(),
    endBatch: vi.fn(),
    logTraceReceived: vi.fn(),
    logDescriptorsMapped: vi.fn(),
    logTimelineBuilt: vi.fn(),
    logQueueEvent: vi.fn(),
    logSpriteResolution: vi.fn(),
    logEphemeralCreated: vi.fn(),
    logTweenCreated: vi.fn(),
    logFaceControllerCall: vi.fn(),
    logTokenVisibilityInit: vi.fn(),
    logWarning: vi.fn(),
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

function sequencingProvider() {
  return new VisualConfigProvider({
    version: 1,
    animations: {
      sequencing: {
        cardDeal: { mode: 'parallel' },
        moveToken: { mode: 'stagger', staggerOffset: 0.2 },
      },
    },
  });
}

function timingProvider() {
  return new VisualConfigProvider({
    version: 1,
    animations: {
      timing: {
        moveToken: { duration: 0.75 },
        zoneHighlight: { duration: 0.25 },
      },
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

  it('passes token face controllers to timeline builder when provided', () => {
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
    const tokenFaceControllers = new Map([['tok:1', { setFaceUp: vi.fn() }]]);
    const zoneContainers = new Map([['zone:a', {}], ['zone:b', {}]]);
    const zonePositions = {
      positions: new Map([['zone:a', { x: 0, y: 0 }], ['zone:b', { x: 10, y: 20 }]]),
      bounds: { minX: 0, minY: 0, maxX: 10, maxY: 20 },
    };
    const presetRegistry = createPresetRegistry();

    const buildTimelineMock = vi.fn(() => timeline.timeline);

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => tokenContainers as never,
        tokenFaceControllers: () => tokenFaceControllers,
        zoneContainers: () => zoneContainers as never,
        zonePositions: () => zonePositions,
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry,
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
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(buildTimelineMock).toHaveBeenCalledWith(
      expect.any(Array),
      presetRegistry,
      expect.objectContaining({
        tokenContainers,
        tokenFaceControllers,
      }),
      expect.any(Object),
      undefined,
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
    expect(descriptors.map((descriptor) => descriptor.kind)).toEqual([
      'cardDeal',
      'zoneHighlight',
      'zoneHighlight',
      'cardFlip',
      'cardBurn',
      'zoneHighlight',
      'zoneHighlight',
    ]);
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
    expect(descriptors.map((descriptor) => descriptor.kind)).toEqual([
      'cardDeal',
      'zoneHighlight',
      'zoneHighlight',
      'cardFlip',
      'cardBurn',
      'zoneHighlight',
      'zoneHighlight',
    ]);
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

  it('passes configured sequencing policies to buildTimeline options', () => {
    const store = createControllerStore();
    const buildTimelineMock = vi.fn(() => ({ add: vi.fn(), progress: vi.fn(), kill: vi.fn() }));
    const queue = {
      enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
      isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), destroy: vi.fn(), forceFlush: vi.fn(),
    };

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: sequencingProvider(),
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
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(buildTimelineMock).toHaveBeenCalledTimes(1);
    const options = (buildTimelineMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]?.[4] as BuildTimelineOptions | undefined;
    expect(options).toBeDefined();
    expect(options?.sequencingPolicies?.get('cardDeal')).toEqual({ mode: 'parallel' });
    expect(options?.sequencingPolicies?.get('moveToken')).toEqual({ mode: 'stagger', staggerOffsetSeconds: 0.2 });
    expect(options?.sequencingPolicies?.has('phaseTransition')).toBe(false);

    controller.destroy();
  });

  it('passes configured timing overrides to buildTimeline options', () => {
    const store = createControllerStore();
    const buildTimelineMock = vi.fn(() => ({ add: vi.fn(), progress: vi.fn(), kill: vi.fn() }));
    const queue = {
      enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
      isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), destroy: vi.fn(), forceFlush: vi.fn(),
    };

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: timingProvider(),
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
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(buildTimelineMock).toHaveBeenCalledTimes(1);
    const options = (buildTimelineMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]?.[4] as BuildTimelineOptions | undefined;
    expect(options).toBeDefined();
    expect(options?.durationSecondsByKind?.get('moveToken')).toBe(0.75);
    expect(options?.durationSecondsByKind?.get('zoneHighlight')).toBe(0.25);

    controller.destroy();
  });

  it('falls back to zone-pulse when zoneHighlight preset override is incompatible', () => {
    const store = createControllerStore();
    const onWarning = vi.fn();
    const buildTimelineMock = vi.fn(() => ({ add: vi.fn(), progress: vi.fn(), kill: vi.fn() }));
    const queue = {
      enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
      isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), destroy: vi.fn(), forceFlush: vi.fn(),
    };

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: animationOverridesProvider({ zoneHighlight: 'arc-tween' }),
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
        onError: vi.fn(),
        onWarning,
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(onWarning).toHaveBeenCalledWith(
      'Ignoring animation preset override "zoneHighlight" -> "arc-tween" because it is not compatible with descriptor kind "zoneHighlight".',
    );

    const descriptors = (buildTimelineMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]?.[0] as readonly { readonly kind: string; readonly preset?: string }[] | undefined;
    const zoneHighlight = descriptors?.find((descriptor) => descriptor.kind === 'zoneHighlight');
    expect(zoneHighlight?.preset).toBe('zone-pulse');

    controller.destroy();
  });

  it('defers pre-existing effectTrace processing to next frame via scheduleFrame', () => {
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

    // Capture the callback passed to scheduleFrame
    let scheduledCallback: (() => void) | null = null;
    const scheduleFrame = vi.fn((cb: () => void) => { scheduledCallback = cb; });

    // Set effectTrace BEFORE calling start()
    store.setState({ effectTrace: [traceEntry()] });

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
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
        scheduleFrame,
      },
    );

    // start() should NOT process the trace synchronously
    controller.start();
    expect(traceToDescriptorsMock).not.toHaveBeenCalled();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);

    // Simulate next animation frame — NOW it should process
    scheduledCallback!();
    expect(traceToDescriptorsMock).toHaveBeenCalledWith(
      store.getState().effectTrace,
      { detailLevel: 'full', suppressCreateToken: true },
      expect.any(Object),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(timeline.timeline);

    controller.destroy();
  });

  it('processes initial trace with suppressCreateToken and no zone highlights', () => {
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

    let scheduledCallback: (() => void) | null = null;
    const scheduleFrame = vi.fn((cb: () => void) => { scheduledCallback = cb; });

    // Set effectTrace BEFORE calling start()
    store.setState({ effectTrace: [traceEntry()] });

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
        traceToDescriptors: traceToDescriptorsMock,
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
        scheduleFrame,
      },
    );

    controller.start();
    scheduledCallback!();

    // Should have passed suppressCreateToken: true
    const mappingOptions = (traceToDescriptorsMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]![1] as { readonly suppressCreateToken?: boolean };
    expect(mappingOptions.suppressCreateToken).toBe(true);

    // Should have passed setup-specific timeline policies
    const buildOptions = (buildTimelineMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]?.[4] as { readonly initializeTokenVisibility?: boolean } | undefined;
    expect(buildOptions?.initializeTokenVisibility).toBe(true);

    controller.destroy();
  });

  it('does not pass suppressCreateToken for subscription-driven traces', () => {
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

    const mappingOptions = (traceToDescriptorsMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]![1] as { readonly suppressCreateToken?: boolean };
    expect(mappingOptions.suppressCreateToken).toBeUndefined();

    controller.destroy();
  });

  it('does not schedule frame when effectTrace is empty at start', () => {
    const store = createControllerStore();
    const scheduleFrame = vi.fn();
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
        scheduleFrame,
      },
    );

    controller.start();
    expect(scheduleFrame).not.toHaveBeenCalled();
    expect(traceToDescriptorsMock).not.toHaveBeenCalled();

    controller.destroy();
  });

  it('cancels scheduled frame on destroy before it fires', () => {
    const store = createControllerStore();
    const traceToDescriptorsMock = vi.fn(() => []);

    let scheduledCallback: (() => void) | null = null;
    const scheduleFrame = vi.fn((cb: () => void) => { scheduledCallback = cb; });

    store.setState({ effectTrace: [traceEntry()] });

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
        scheduleFrame,
      },
    );

    controller.start();
    expect(scheduleFrame).toHaveBeenCalledTimes(1);

    // Destroy before the scheduled frame fires
    controller.destroy();

    // The scheduled callback should be a no-op after destroy
    scheduledCallback!();
    expect(traceToDescriptorsMock).not.toHaveBeenCalled();
  });

  it('passes ephemeral container factory to buildTimeline when ephemeralParent is provided', () => {
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
    const buildTimelineMock = vi.fn(() => timeline.timeline);

    const ephemeralParent = {};

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => tokenContainers as never,
        zoneContainers: () => zoneContainers as never,
        zonePositions: () => zonePositions,
        ephemeralParent: () => ephemeralParent as never,
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry,
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
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    const options = (buildTimelineMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]?.[4] as BuildTimelineOptions | undefined;
    expect(options).toBeDefined();
    expect(options?.ephemeralContainerFactory).toBeDefined();

    controller.destroy();
  });

  it('omits ephemeral container factory when ephemeralParent is absent', () => {
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
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(buildTimelineMock).toHaveBeenCalledWith(
      expect.any(Array),
      presetRegistry,
      expect.any(Object),
      expect.any(Object),
      undefined,
    );

    controller.destroy();
  });

  it('passes card dimensions from visual config to ephemeral factory', () => {
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
    const buildTimelineMock = vi.fn(() => timeline.timeline);

    // Create a visual config with card templates defining 48×68 dimensions
    const visualConfigWithCards = new VisualConfigProvider({
      version: 1,
      cards: {
        templates: {
          'poker-card': { width: 48, height: 68 },
        },
      },
    });

    const ephemeralParent = new PixiContainer();

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: visualConfigWithCards,
        tokenContainers: () => tokenContainers as never,
        zoneContainers: () => zoneContainers as never,
        zonePositions: () => zonePositions,
        ephemeralParent: () => ephemeralParent,
      },
      {
        gsap: { registerPlugin: vi.fn(), defaults: vi.fn(), timeline: vi.fn() },
        presetRegistry,
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
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    // Verify buildTimeline was called with an ephemeralContainerFactory in its options
    const options = (buildTimelineMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]?.[4] as BuildTimelineOptions | undefined;
    expect(options).toBeDefined();
    expect(options?.ephemeralContainerFactory).toBeDefined();

    // Create a container via the factory and verify it uses the configured dimensions
    const ephemeral = options!.ephemeralContainerFactory!.create('tok:test');
    const gfx = ephemeral.children.find((c: unknown) => c instanceof Graphics);
    expect(gfx).toBeDefined();
    const bounds = gfx!.getLocalBounds();
    // 48×68 + stroke (~1.5) — should be ~49.5×69.5
    expect(bounds.width).toBeGreaterThan(47);
    expect(bounds.width).toBeLessThan(51);
    expect(bounds.height).toBeGreaterThan(67);
    expect(bounds.height).toBeLessThan(71);

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

  it('exposes injected diagnostic buffer via getDiagnosticBuffer', () => {
    const store = createControllerStore();
    const diagnosticBuffer = createDiagnosticBuffer();

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
        traceToDescriptors: vi.fn(() => []),
        buildTimeline: vi.fn(),
        onError: vi.fn(),
        logger: createMockLogger(false),
        diagnosticBuffer,
      },
    );

    expect(controller.getDiagnosticBuffer()).toBe(diagnosticBuffer);
  });

  it('wraps processing in logger batch lifecycle and threads logger to timeline options even when disabled', () => {
    const store = createControllerStore();
    const logger = createMockLogger(false);
    const buildTimelineMock = vi.fn(() => ({ add: vi.fn(), progress: vi.fn(), kill: vi.fn() }));

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
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: vi.fn(() => [
          { kind: 'moveToken', tokenId: 'tok:1', from: 'zone:a', to: 'zone:b', preset: 'arc-tween', isTriggered: false } as const,
        ]),
        buildTimeline: buildTimelineMock,
        onError: vi.fn(),
        logger,
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(logger.beginBatch).toHaveBeenCalledWith(false);
    expect(logger.endBatch).toHaveBeenCalledTimes(1);
    expect(logger.logTraceReceived).toHaveBeenCalledTimes(1);
    expect(logger.logDescriptorsMapped).toHaveBeenCalledTimes(1);
    expect(logger.logTimelineBuilt).toHaveBeenCalledTimes(1);

    const options = (buildTimelineMock as unknown as {
      readonly mock: { readonly calls: readonly (readonly unknown[])[] };
    }).mock.calls[0]?.[4] as BuildTimelineOptions | undefined;
    expect(options?.logger).toBe(logger);

    controller.destroy();
  });

  it('calls logger.endBatch when descriptor mapping fails', () => {
    const store = createControllerStore();
    const logger = createMockLogger(false);

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
        onError: vi.fn(),
        logger,
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(logger.beginBatch).toHaveBeenCalledWith(false);
    expect(logger.endBatch).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('calls logger.endBatch when timeline building fails', () => {
    const store = createControllerStore();
    const logger = createMockLogger(false);

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
        queueFactory: () => ({
          enqueue: vi.fn(), skipCurrent: vi.fn(), skipAll: vi.fn(), pause: vi.fn(), resume: vi.fn(), setSpeed: vi.fn(),
          isPlaying: false, queueLength: 0, onAllComplete: vi.fn(), forceFlush: vi.fn(), destroy: vi.fn(),
        }),
        traceToDescriptors: vi.fn(() => [
          { kind: 'moveToken', tokenId: 'tok:1', from: 'zone:a', to: 'zone:b', preset: 'arc-tween', isTriggered: false } as const,
        ]),
        buildTimeline: vi.fn(() => {
          throw new Error('timeline failed');
        }),
        onError: vi.fn(),
        logger,
      },
    );

    controller.start();
    store.setState({ effectTrace: [traceEntry()] });

    expect(logger.beginBatch).toHaveBeenCalledWith(false);
    expect(logger.endBatch).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('creates a default diagnostic buffer and exposes it on the controller API', () => {
    const store = createControllerStore();
    initializeAnimationRuntime({ runtime: createNoopGsapRuntime() });

    const controller = createAnimationController({
      store: store as unknown as StoreApi<GameStore>,
      visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
      tokenContainers: () => new Map() as never,
      zoneContainers: () => new Map() as never,
      zonePositions: () => ({ positions: new Map(), bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } }),
    });

    const buffer = controller.getDiagnosticBuffer() as DiagnosticBuffer | undefined;
    expect(buffer).toBeDefined();
    expect(typeof buffer?.beginBatch).toBe('function');
    expect(typeof buffer?.downloadAsJson).toBe('function');
  });

});
