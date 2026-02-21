import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import type { Container } from 'pixi.js';
import type { StoreApi } from 'zustand';

import type { ZonePositionMap } from '../spatial/position-types.js';
import type { CardAnimationConfig } from '../config/visual-config-types.js';
import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { GameStore } from '../store/game-store.js';
import type {
  AnimationDescriptor,
  AnimationDetailLevel,
  AnimationPresetId,
  AnimationPresetOverrideKey,
  AnimationSequencingPolicy,
  CardAnimationMappingContext,
  VisualAnimationDescriptorKind,
} from './animation-types.js';
import { ANIMATION_PRESET_OVERRIDE_KEYS } from './animation-types.js';
import { createAnimationLogger, type AnimationLogger } from './animation-logger.js';
import { createAnimationQueue, type AnimationQueue } from './animation-queue.js';
import { getGsapRuntime, type GsapLike } from './gsap-setup.js';
import { createPresetRegistry, type PresetRegistry } from './preset-registry.js';
import { createEphemeralContainerFactory, type EphemeralContainerFactoryOptions } from './ephemeral-container-factory.js';
import { buildTimeline } from './timeline-builder.js';
import { traceToDescriptors } from './trace-to-descriptors.js';
import { decorateWithZoneHighlights } from './derive-zone-highlights.js';

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
  forceFlush(): void;
}

export interface AnimationControllerOptions {
  readonly store: StoreApi<GameStore>;
  readonly visualConfigProvider: VisualConfigProvider;
  readonly tokenContainers: () => ReadonlyMap<string, Container>;
  readonly tokenFaceControllers?: () => ReadonlyMap<string, { setFaceUp(faceUp: boolean): void }>;
  readonly zoneContainers: () => ReadonlyMap<string, Container>;
  readonly zonePositions: () => ZonePositionMap;
  readonly ephemeralParent?: () => Container;
}

interface AnimationControllerDeps {
  readonly gsap: GsapLike;
  readonly presetRegistry: PresetRegistry;
  readonly queueFactory: (store: StoreApi<GameStore>) => AnimationQueue;
  readonly traceToDescriptors: typeof traceToDescriptors;
  readonly buildTimeline: typeof buildTimeline;
  readonly onError: (message: string, error: unknown) => void;
  readonly onWarning?: (message: string) => void;
  readonly scheduleFrame?: (callback: () => void) => void;
  readonly logger?: AnimationLogger;
}

export function createAnimationController(
  options: AnimationControllerOptions,
  deps: AnimationControllerDeps = createDefaultDeps(),
): AnimationController {
  const selectorStore = options.store as SelectorSubscribeStore<GameStore>;
  const queue = deps.queueFactory(options.store);
  const presetOverrides = buildPresetOverrides(options.visualConfigProvider, deps.presetRegistry, deps.onWarning);
  const zoneHighlightPresetId = resolveZoneHighlightPresetId(presetOverrides, deps.presetRegistry, deps.onWarning);
  const zoneHighlightPolicy = options.visualConfigProvider.getZoneHighlightPolicy();
  const sequencingPolicies = buildSequencingPolicies(options.visualConfigProvider);
  const timingOverrides = buildTimingOverrides(options.visualConfigProvider);
  const cardDimensions = options.visualConfigProvider.getDefaultCardDimensions();

  let detailLevel: AnimationDetailLevel = 'full';
  let reducedMotion = false;
  let started = false;
  let destroyed = false;
  let unsubscribeEffectTrace: (() => void) | null = null;

  const logger = deps.logger;

  const processTrace = (trace: readonly EffectTraceEntry[], isSetup = false): void => {
    if (destroyed || trace.length === 0) {
      return;
    }

    if (logger?.enabled) {
      logger.logTraceReceived({ traceLength: trace.length, isSetup, entries: trace });
    }

    let descriptors: readonly AnimationDescriptor[];
    try {
      const state = options.store.getState();
      const cardContext = buildCardContext(state, options.visualConfigProvider);
      descriptors = deps.traceToDescriptors(
        trace,
        {
          detailLevel,
          ...(presetOverrides.size === 0 ? {} : { presetOverrides }),
          ...(cardContext === undefined ? {} : { cardContext }),
          ...(isSetup ? { suppressCreateToken: true } : {}),
        },
        deps.presetRegistry,
      );
      if (!isSetup) {
        descriptors = decorateWithZoneHighlights(
          descriptors,
          {
            presetId: zoneHighlightPresetId,
            policy: zoneHighlightPolicy,
          },
        );
      }
    } catch (error) {
      deps.onError('Descriptor mapping failed.', error);
      return;
    }

    if (logger?.enabled) {
      const skippedCount = descriptors.filter((d) => d.kind === 'skipped').length;
      logger.logDescriptorsMapped({
        inputCount: trace.length,
        outputCount: descriptors.length,
        skippedCount,
        descriptors,
      });
    }

    if (!hasVisualDescriptors(descriptors)) {
      return;
    }

    try {
      const ephemeralContainerFactory = options.ephemeralParent !== undefined
        ? createEphemeralContainerFactory(
            options.ephemeralParent(),
            cardDimensions !== null
              ? { cardWidth: cardDimensions.width, cardHeight: cardDimensions.height }
              : undefined,
          )
        : undefined;

      const needsOptions = sequencingPolicies.size > 0 || timingOverrides.size > 0 || isSetup || ephemeralContainerFactory !== undefined;

      const timeline = deps.buildTimeline(
        descriptors,
        deps.presetRegistry,
        {
          tokenContainers: options.tokenContainers(),
          ...(options.tokenFaceControllers === undefined
            ? {}
            : { tokenFaceControllers: options.tokenFaceControllers() }),
          zoneContainers: options.zoneContainers(),
          zonePositions: options.zonePositions(),
        },
        deps.gsap,
        !needsOptions
          ? undefined
          : {
              ...(sequencingPolicies.size === 0 ? {} : { sequencingPolicies }),
              ...(timingOverrides.size === 0 ? {} : { durationSecondsByKind: timingOverrides }),
              ...(isSetup
                ? {
                    spriteValidation: 'permissive' as const,
                    initializeTokenVisibility: true,
                  }
                : {}),
              ...(ephemeralContainerFactory === undefined ? {} : { ephemeralContainerFactory }),
            },
      );

      if (logger?.enabled) {
        const visualCount = descriptors.filter((d) => d.kind !== 'skipped').length;
        logger.logTimelineBuilt({ visualDescriptorCount: visualCount, groupCount: 1 });
      }

      if (reducedMotion) {
        timeline.progress?.(1);
        timeline.kill?.();
        return;
      }

      queue.enqueue(timeline);
    } catch (error) {
      deps.onError('Timeline build failed.', error);
    }
  };

  return {
    start(): void {
      if (started || destroyed) {
        return;
      }
      started = true;

      const currentTrace = selectorStore.getState().effectTrace;

      unsubscribeEffectTrace = selectorStore.subscribe(
        (state) => state.effectTrace,
        (trace) => {
          processTrace(trace);
        },
      );

      if (currentTrace.length > 0) {
        const schedule = deps.scheduleFrame ?? requestAnimationFrame;
        schedule(() => {
          if (!destroyed) {
            processTrace(currentTrace, true);
          }
        });
      }
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

    forceFlush(): void {
      if (destroyed) {
        return;
      }
      queue.forceFlush();
    },
  };
}

function buildPresetOverrides(
  visualConfigProvider: VisualConfigProvider,
  presetRegistry: PresetRegistry,
  onWarning: ((message: string) => void) | undefined,
): ReadonlyMap<AnimationPresetOverrideKey, AnimationPresetId> {
  const overrides = new Map<AnimationPresetOverrideKey, AnimationPresetId>();

  for (const key of ANIMATION_PRESET_OVERRIDE_KEYS) {
    const presetId = visualConfigProvider.getAnimationPreset(key);
    if (presetId === null) {
      continue;
    }
    if (!presetRegistry.has(presetId)) {
      onWarning?.(
        `Ignoring animation preset override "${key}" -> "${presetId}" because the preset is not registered.`,
      );
      continue;
    }
    overrides.set(key, presetId);
  }

  return overrides;
}

function resolveZoneHighlightPresetId(
  presetOverrides: ReadonlyMap<AnimationPresetOverrideKey, AnimationPresetId>,
  presetRegistry: PresetRegistry,
  onWarning: ((message: string) => void) | undefined,
): AnimationPresetId {
  const configured = presetOverrides.get('zoneHighlight');
  if (configured !== undefined) {
    try {
      presetRegistry.requireCompatible(configured, 'zoneHighlight');
      return configured;
    } catch {
      onWarning?.(
        `Ignoring animation preset override "zoneHighlight" -> "${configured}" because it is not compatible with descriptor kind "zoneHighlight".`,
      );
    }
  }
  presetRegistry.requireCompatible('zone-pulse', 'zoneHighlight');
  return 'zone-pulse';
}

function buildCardContext(
  state: GameStore,
  visualConfigProvider: VisualConfigProvider,
): CardAnimationMappingContext | undefined {
  const cardAnimation = visualConfigProvider.getCardAnimation();
  const renderModel = state.renderModel;
  if (cardAnimation === null || renderModel === null) {
    return undefined;
  }

  const tokenTypeIds = state.gameDef?.tokenTypes.map((tokenType) => tokenType.id) ?? [];
  const tokenTypeByTokenId = new Map<string, string>();
  for (const token of renderModel.tokens) {
    tokenTypeByTokenId.set(token.id, token.type);
  }

  return {
    cardTokenTypeIds: resolveCardTokenTypeIds(cardAnimation, tokenTypeIds),
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

function resolveCardTokenTypeIds(
  config: CardAnimationConfig,
  tokenTypeIds: readonly string[],
): ReadonlySet<string> {
  const result = new Set<string>();

  for (const id of config.cardTokenTypes.ids ?? []) {
    result.add(id);
  }

  for (const prefix of config.cardTokenTypes.idPrefixes ?? []) {
    for (const tokenTypeId of tokenTypeIds) {
      if (tokenTypeId.startsWith(prefix)) {
        result.add(tokenTypeId);
      }
    }
  }

  return result;
}

function buildSequencingPolicies(
  visualConfigProvider: VisualConfigProvider,
): ReadonlyMap<VisualAnimationDescriptorKind, AnimationSequencingPolicy> {
  const policies = new Map<VisualAnimationDescriptorKind, AnimationSequencingPolicy>();

  for (const kind of ANIMATION_PRESET_OVERRIDE_KEYS) {
    const policy = visualConfigProvider.getSequencingPolicy(kind);
    if (policy !== null) {
      policies.set(kind, policy);
    }
  }

  return policies;
}

function buildTimingOverrides(
  visualConfigProvider: VisualConfigProvider,
): ReadonlyMap<VisualAnimationDescriptorKind, number> {
  const durations = new Map<VisualAnimationDescriptorKind, number>();

  for (const kind of ANIMATION_PRESET_OVERRIDE_KEYS) {
    const durationSeconds = visualConfigProvider.getTimingConfig(kind);
    if (durationSeconds !== null) {
      durations.set(kind, durationSeconds);
    }
  }

  return durations;
}

function hasVisualDescriptors(descriptors: readonly AnimationDescriptor[]): boolean {
  return descriptors.some((descriptor) => descriptor.kind !== 'skipped');
}

function detectAnimDebugEnabled(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').has('animDebug');
  } catch {
    return false;
  }
}

function createDefaultDeps(): AnimationControllerDeps {
  const logger = createAnimationLogger({ enabled: detectAnimDebugEnabled() });

  if (typeof globalThis !== 'undefined') {
    (globalThis as Record<string, unknown>).__animationLogger = logger;
  }

  return {
    gsap: getGsapRuntime(),
    presetRegistry: createPresetRegistry(),
    queueFactory: (store) => createAnimationQueue({
      setAnimationPlaying: (playing) => {
        store.getState().setAnimationPlaying(playing);
      },
      logger,
    }),
    traceToDescriptors,
    buildTimeline,
    onError: (message, error) => {
      console.warn(message, error);
    },
    onWarning: (message) => {
      console.warn(message);
    },
    logger,
  };
}
