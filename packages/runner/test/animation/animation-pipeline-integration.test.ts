import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { createAnimationController } from '../../src/animation/animation-controller';
import { createPresetRegistry } from '../../src/animation/preset-registry';
import { buildTimeline } from '../../src/animation/timeline-builder';
import { traceToDescriptors } from '../../src/animation/trace-to-descriptors';
import type { GsapTimelineLike } from '../../src/animation/gsap-setup';
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
  readonly gameState: {
    readonly zones: Readonly<Record<string, readonly { readonly id: string | number; readonly type: string; readonly props: Readonly<Record<string, unknown>> }[]>>;
  } | null;
  readonly renderModel: {
    readonly tokens: readonly {
      readonly id: string;
      readonly type: string;
    }[];
  } | null;
  setAnimationPlaying(playing: boolean): void;
}

interface GsapFixture {
  readonly gsap: {
    readonly registerPlugin: ReturnType<typeof vi.fn>;
    readonly defaults: ReturnType<typeof vi.fn>;
    readonly timeline: ReturnType<typeof vi.fn>;
  };
  readonly createdTimelines: GsapTimelineLike[];
}

const NULL_VISUAL_CONFIG_PROVIDER = new VisualConfigProvider(null);

function createControllerStore(): StoreApi<ControllerStoreState> {
  let store!: StoreApi<ControllerStoreState>;
  store = createStore<ControllerStoreState>()(
    subscribeWithSelector((): ControllerStoreState => ({
      effectTrace: [] as readonly EffectTraceEntry[],
      animationPlaying: false,
      gameDef: null,
      gameState: null,
      renderModel: null,
      setAnimationPlaying: (playing: boolean) => {
        store.setState({ animationPlaying: playing });
      },
    })),
  );
  return store;
}

function createGsapFixture(): GsapFixture {
  const createdTimelines: GsapTimelineLike[] = [];
  const timeline = vi.fn(() => {
    const instance: GsapTimelineLike = {
      add: vi.fn().mockReturnThis(),
      eventCallback: vi.fn().mockReturnThis(),
      progress: vi.fn().mockReturnThis(),
      pause: vi.fn().mockReturnThis(),
      resume: vi.fn().mockReturnThis(),
      play: vi.fn().mockReturnThis(),
      timeScale: vi.fn().mockReturnThis(),
      kill: vi.fn().mockReturnThis(),
    };
    createdTimelines.push(instance);
    return instance;
  });

  return {
    gsap: {
      registerPlugin: vi.fn(),
      defaults: vi.fn(),
      timeline,
    },
    createdTimelines,
  };
}

function moveTraceEntry(tokenId = 'tok:1'): EffectTraceEntry {
  return {
    kind: 'moveToken',
    tokenId,
    from: 'zone:deck',
    to: 'zone:hand:p1',
    provenance: {
      phase: 'main',
      eventContext: 'actionEffect',
      effectPath: 'effects.0',
    },
  };
}

function cardFlowTraceEntries(): readonly EffectTraceEntry[] {
  return [
    moveTraceEntry('tok:card'),
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
  ];
}

function cardAnimationProviderWithSequencingAndTiming(): VisualConfigProvider {
  return new VisualConfigProvider({
    version: 1,
    cardAnimation: {
      cardTokenTypes: {
        ids: ['card'],
      },
      zoneRoles: {
        draw: ['zone:deck'],
        hand: ['zone:hand:p1'],
        shared: ['zone:board'],
        burn: ['zone:burn'],
        discard: ['zone:muck'],
      },
    },
    animations: {
      sequencing: {
        cardDeal: { mode: 'stagger', staggerOffset: 0.15 },
      },
      timing: {
        cardDeal: { duration: 0.3 },
        cardFlip: { duration: 0.3 },
      },
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('animation pipeline integration', () => {
  it('processes effectTrace through real mapping + timeline build and enqueues the timeline', () => {
    const gsapFixture = createGsapFixture();
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
        tokenContainers: () => new Map([
          ['tok:1', { x: 0, y: 0, scale: { x: 1, y: 1 } }],
        ]) as never,
        zoneContainers: () => new Map([
          ['zone:deck', { alpha: 1 }],
          ['zone:hand:p1', { alpha: 1 }],
        ]) as never,
        zonePositions: () => ({
          positions: new Map([
            ['zone:deck', { x: 0, y: 0 }],
            ['zone:hand:p1', { x: 100, y: 20 }],
          ]),
          bounds: { minX: 0, minY: 0, maxX: 100, maxY: 20 },
        }),
      },
      {
        gsap: gsapFixture.gsap,
        presetRegistry: createPresetRegistry(),
        queueFactory: () => queue,
        traceToDescriptors,
        buildTimeline,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({ effectTrace: [moveTraceEntry()] });

    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(gsapFixture.gsap.timeline).toHaveBeenCalled();
    expect(queue.enqueue).toHaveBeenCalledWith(gsapFixture.createdTimelines[0]);

    controller.destroy();
  });

  it('recovers after one failed timeline build and processes later traces', () => {
    const gsapFixture = createGsapFixture();
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
    const onError = vi.fn();
    const buildTimelineWithOneFailure: typeof buildTimeline = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('simulated timeline failure');
      })
      .mockImplementation((descriptors, presetRegistry, spriteRefs, gsap, options) =>
        buildTimeline(descriptors, presetRegistry, spriteRefs, gsap, options),
      );

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: NULL_VISUAL_CONFIG_PROVIDER,
        tokenContainers: () => new Map([
          ['tok:1', { x: 0, y: 0, scale: { x: 1, y: 1 } }],
        ]) as never,
        zoneContainers: () => new Map([
          ['zone:deck', { alpha: 1 }],
          ['zone:hand:p1', { alpha: 1 }],
        ]) as never,
        zonePositions: () => ({
          positions: new Map([
            ['zone:deck', { x: 0, y: 0 }],
            ['zone:hand:p1', { x: 100, y: 20 }],
          ]),
          bounds: { minX: 0, minY: 0, maxX: 100, maxY: 20 },
        }),
      },
      {
        gsap: gsapFixture.gsap,
        presetRegistry: createPresetRegistry(),
        queueFactory: () => queue,
        traceToDescriptors,
        buildTimeline: buildTimelineWithOneFailure,
        onError,
      },
    );

    controller.start();
    store.setState({ effectTrace: [moveTraceEntry()] });
    store.setState({ effectTrace: [moveTraceEntry()] });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);

    controller.destroy();
  });

  it('forwards sequencing + timing policies from provider into timeline build options', () => {
    const gsapFixture = createGsapFixture();
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
    const buildTimelineSpy: typeof buildTimeline = vi.fn(
      (descriptors, presetRegistry, spriteRefs, gsap, options) =>
        buildTimeline(descriptors, presetRegistry, spriteRefs, gsap, options),
    );

    const controller = createAnimationController(
      {
        store: store as unknown as StoreApi<GameStore>,
        visualConfigProvider: cardAnimationProviderWithSequencingAndTiming(),
        tokenContainers: () => new Map([
          ['tok:card', { x: 0, y: 0, scale: { x: 1, y: 1 } }],
        ]) as never,
        tokenFaceControllers: () => new Map([
          ['tok:card', { setFaceUp: vi.fn() }],
        ]),
        zoneContainers: () => new Map([
          ['zone:deck', { alpha: 1 }],
          ['zone:hand:p1', { alpha: 1 }],
        ]) as never,
        zonePositions: () => ({
          positions: new Map([
            ['zone:deck', { x: 0, y: 0 }],
            ['zone:hand:p1', { x: 100, y: 20 }],
          ]),
          bounds: { minX: 0, minY: 0, maxX: 100, maxY: 20 },
        }),
      },
      {
        gsap: gsapFixture.gsap,
        presetRegistry: createPresetRegistry(),
        queueFactory: () => queue,
        traceToDescriptors,
        buildTimeline: buildTimelineSpy,
        onError: vi.fn(),
      },
    );

    controller.start();
    store.setState({
      gameDef: {
        tokenTypes: [{ id: 'card' }],
      },
      gameState: {
        zones: {
          'zone:deck': [{ id: 'tok:card', type: 'card', props: {} }],
          'zone:hand:p1': [],
        },
      },
      renderModel: {
        tokens: [{ id: 'tok:card', type: 'card' }],
      },
      effectTrace: cardFlowTraceEntries(),
    });

    const options = (buildTimelineSpy as unknown as {
      readonly mock: {
        readonly calls: readonly (readonly unknown[])[];
      };
    }).mock.calls[0]?.[4] as {
      readonly sequencingPolicies?: ReadonlyMap<string, { readonly mode: string; readonly staggerOffsetSeconds?: number }>;
      readonly durationSecondsByKind?: ReadonlyMap<string, number>;
    } | undefined;

    expect(options).toBeDefined();
    expect(options?.sequencingPolicies?.get('cardDeal')).toEqual({
      mode: 'stagger',
      staggerOffsetSeconds: 0.15,
    });
    expect(options?.durationSecondsByKind?.get('cardDeal')).toBe(0.3);
    expect(options?.durationSecondsByKind?.get('cardFlip')).toBe(0.3);
    expect(queue.enqueue).toHaveBeenCalledTimes(1);

    controller.destroy();
  });
});
