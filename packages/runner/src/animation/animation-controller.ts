import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';
import type { StoreApi } from 'zustand';

import type { ZonePositionMap } from '../canvas/position-store.js';
import type { GameStore } from '../store/game-store.js';
import type {
  AnimationDescriptor,
  AnimationDetailLevel,
  CardAnimationMappingContext,
} from './animation-types.js';
import { createAnimationQueue, type AnimationQueue } from './animation-queue.js';
import { getGsapRuntime, type GsapLike } from './gsap-setup.js';
import { createPresetRegistry, type PresetRegistry } from './preset-registry.js';
import { buildTimeline } from './timeline-builder.js';
import { traceToDescriptors } from './trace-to-descriptors.js';

interface SelectorSubscribeStore<TState> extends StoreApi<TState> {
  subscribe: {
    (listener: (state: TState, previousState: TState) => void): () => void;
    <TSelected>(
      selector: (state: TState) => TSelected,
      listener: (selectedState: TSelected, previousSelectedState: TSelected) => void,
      options?: {
        readonly equalityFn?: (a: TSelected, b: TSelected) => boolean;
        readonly fireImmediately?: boolean;
      },
    ): () => void;
  };
}

export interface AnimationController {
  start(): void;
  destroy(): void;
  setDetailLevel(level: AnimationDetailLevel): void;
  setReducedMotion(reduced: boolean): void;
  setSpeed(multiplier: number): void;
  pause(): void;
  resume(): void;
  skipCurrent(): void;
  skipAll(): void;
}

export interface AnimationControllerOptions {
  readonly store: StoreApi<GameStore>;
  readonly tokenContainers: () => ReadonlyMap<string, Container>;
  readonly zoneContainers: () => ReadonlyMap<string, Container>;
  readonly zonePositions: () => ZonePositionMap;
}

interface AnimationControllerDeps {
  readonly gsap: GsapLike;
  readonly presetRegistry: PresetRegistry;
  readonly queueFactory: (store: StoreApi<GameStore>) => AnimationQueue;
  readonly traceToDescriptors: typeof traceToDescriptors;
  readonly buildTimeline: typeof buildTimeline;
  readonly onError: (message: string, error: unknown) => void;
}

export function createAnimationController(
  options: AnimationControllerOptions,
  deps: AnimationControllerDeps = createDefaultDeps(),
): AnimationController {
  const selectorStore = options.store as SelectorSubscribeStore<GameStore>;
  const queue = deps.queueFactory(options.store);

  let detailLevel: AnimationDetailLevel = 'full';
  let reducedMotion = false;
  let started = false;
  let destroyed = false;
  let unsubscribeEffectTrace: (() => void) | null = null;

  const processTrace = (trace: readonly EffectTraceEntry[]): void => {
    if (destroyed || trace.length === 0) {
      return;
    }

    try {
      const state = options.store.getState();
      const cardContext = buildCardContext(state);
      const descriptors = deps.traceToDescriptors(
        trace,
        {
          detailLevel,
          ...(cardContext === undefined ? {} : { cardContext }),
        },
        deps.presetRegistry,
      );
      if (!hasVisualDescriptors(descriptors)) {
        return;
      }

      const timeline = deps.buildTimeline(
        descriptors,
        deps.presetRegistry,
        {
          tokenContainers: options.tokenContainers(),
          zoneContainers: options.zoneContainers(),
          zonePositions: options.zonePositions(),
        },
        deps.gsap,
      );

      if (reducedMotion) {
        timeline.progress?.(1);
        timeline.kill?.();
        return;
      }

      queue.enqueue(timeline);
    } catch (error) {
      deps.onError('Animation controller failed while processing effectTrace.', error);
    }
  };

  return {
    start(): void {
      if (started || destroyed) {
        return;
      }
      started = true;

      unsubscribeEffectTrace = selectorStore.subscribe((state) => state.effectTrace, (trace, previousTrace) => {
        if (trace === previousTrace) {
          return;
        }
        processTrace(trace);
      });
    },

    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      started = false;

      unsubscribeEffectTrace?.();
      unsubscribeEffectTrace = null;
      queue.destroy();
    },

    setDetailLevel(level): void {
      if (destroyed) {
        return;
      }
      detailLevel = level;
    },

    setReducedMotion(reduced): void {
      if (destroyed || reducedMotion === reduced) {
        return;
      }
      reducedMotion = reduced;
      if (reducedMotion) {
        queue.skipAll();
      }
    },

    setSpeed(multiplier): void {
      if (destroyed) {
        return;
      }
      queue.setSpeed(multiplier);
    },

    pause(): void {
      if (destroyed) {
        return;
      }
      queue.pause();
    },

    resume(): void {
      if (destroyed) {
        return;
      }
      queue.resume();
    },

    skipCurrent(): void {
      if (destroyed) {
        return;
      }
      queue.skipCurrent();
    },

    skipAll(): void {
      if (destroyed) {
        return;
      }
      queue.skipAll();
    },
  };
}

function buildCardContext(state: GameStore): CardAnimationMappingContext | undefined {
  const cardAnimation = state.gameDef?.cardAnimation;
  const renderModel = state.renderModel;
  if (cardAnimation === undefined || renderModel === null) {
    return undefined;
  }

  const tokenTypeByTokenId = new Map<string, string>();
  for (const token of renderModel.tokens) {
    tokenTypeByTokenId.set(token.id, token.type);
  }

  return {
    cardTokenTypeIds: new Set(cardAnimation.cardTokenTypeIds),
    tokenTypeByTokenId,
    zoneRoles: {
      draw: new Set(cardAnimation.zoneRoles.draw),
      hand: new Set(cardAnimation.zoneRoles.hand),
      shared: new Set(cardAnimation.zoneRoles.shared),
      burn: new Set(cardAnimation.zoneRoles.burn),
      discard: new Set(cardAnimation.zoneRoles.discard),
    },
  };
}

function hasVisualDescriptors(descriptors: readonly AnimationDescriptor[]): boolean {
  return descriptors.some((descriptor) => descriptor.kind !== 'skipped');
}

function createDefaultDeps(): AnimationControllerDeps {
  return {
    gsap: getGsapRuntime(),
    presetRegistry: createPresetRegistry(),
    queueFactory: (store) => createAnimationQueue({
      setAnimationPlaying: (playing) => {
        store.getState().setAnimationPlaying(playing);
      },
    }),
    traceToDescriptors,
    buildTimeline,
    onError: (message, error) => {
      console.warn(message, error);
    },
  };
}
