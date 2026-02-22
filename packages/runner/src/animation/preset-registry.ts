import type { EffectTraceEntry } from '@ludoforge/engine/runtime';
import { TRACE_KIND_DEFAULT_PRESET_IDS } from '../model/effect-trace-kind-config.js';
import type { FaceControllerCallEntry } from './animation-diagnostics.js';

import type { GsapLike, GsapTimelineLike } from './gsap-setup.js';
import {
  ANIMATION_PRESET_IDS,
  type AnimationDescriptor,
  type AnimationPresetId,
  type BuiltinAnimationPresetId,
} from './animation-types.js';

type VisualAnimationDescriptor = Exclude<AnimationDescriptor, { kind: 'skipped' }>;
export type PresetCompatibleDescriptorKind = VisualAnimationDescriptor['kind'];

export interface PresetTweenContext {
  readonly gsap: GsapLike;
  readonly timeline: GsapTimelineLike;
  readonly durationSeconds: number;
  readonly logger?: PresetFaceControllerLogger;
  readonly spriteRefs: {
    readonly tokenContainers: ReadonlyMap<string, unknown>;
    readonly tokenFaceControllers?: ReadonlyMap<string, TokenFaceControllerRef>;
    readonly zoneContainers: ReadonlyMap<string, unknown>;
    readonly zonePositions: {
      readonly positions: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
    };
  };
  readonly phaseBannerCallback?: (phase: string | null) => void;
}

export interface TokenFaceControllerRef {
  setFaceUp(faceUp: boolean): void;
}

export interface PresetFaceControllerLogger {
  logFaceControllerCall(entry: FaceControllerCallEntry): void;
}

export type PresetTweenFactory = (
  descriptor: VisualAnimationDescriptor,
  context: PresetTweenContext,
) => void;

export interface AnimationPresetDefinition {
  readonly id: AnimationPresetId;
  readonly defaultDurationSeconds: number;
  readonly compatibleKinds: readonly PresetCompatibleDescriptorKind[];
  readonly createTween: PresetTweenFactory;
}

interface AnimationPresetMetadata {
  readonly defaultDurationSeconds: number;
  readonly compatibleKinds: readonly PresetCompatibleDescriptorKind[];
  readonly createTween: PresetTweenFactory;
}

export interface PresetRegistry {
  readonly size: number;
  list(): readonly AnimationPresetDefinition[];
  has(id: AnimationPresetId): boolean;
  get(id: AnimationPresetId): AnimationPresetDefinition | undefined;
  require(id: AnimationPresetId): AnimationPresetDefinition;
  requireCompatible(id: AnimationPresetId, descriptorKind: PresetCompatibleDescriptorKind): AnimationPresetDefinition;
  register(definition: AnimationPresetDefinition): PresetRegistry;
  registerMany(definitions: readonly AnimationPresetDefinition[]): PresetRegistry;
}

const DEFAULT_TRACE_KIND_PRESET_IDS: Readonly<Record<EffectTraceEntry['kind'], AnimationPresetId | null>> =
  TRACE_KIND_DEFAULT_PRESET_IDS;

const VISUAL_DESCRIPTOR_KINDS: readonly PresetCompatibleDescriptorKind[] = [
  'moveToken',
  'cardDeal',
  'cardBurn',
  'createToken',
  'destroyToken',
  'setTokenProp',
  'cardFlip',
  'varChange',
  'resourceTransfer',
  'phaseTransition',
  'zoneHighlight',
];

const ARC_TWEEN_EASE = 'power2.inOut';

const BUILTIN_PRESET_METADATA = {
  'arc-tween': {
    defaultDurationSeconds: 0.4,
    compatibleKinds: ['moveToken', 'cardDeal', 'cardBurn'],
    createTween: createArcTween,
  },
  'fade-in-scale': {
    defaultDurationSeconds: 0.3,
    compatibleKinds: ['createToken'],
    createTween: createFadeInScaleTween,
  },
  'fade-out-scale': {
    defaultDurationSeconds: 0.3,
    compatibleKinds: ['destroyToken'],
    createTween: createFadeOutScaleTween,
  },
  'tint-flash': {
    defaultDurationSeconds: 0.4,
    compatibleKinds: ['setTokenProp'],
    createTween: createTintFlashTween,
  },
  'card-flip-3d': {
    defaultDurationSeconds: 0.3,
    compatibleKinds: ['cardFlip'],
    createTween: createCardFlip3dTween,
  },
  'counter-tick': {
    defaultDurationSeconds: 0.4,
    compatibleKinds: ['varChange', 'resourceTransfer'],
    createTween: createCounterTickTween,
  },
  'banner-overlay': {
    defaultDurationSeconds: 3,
    compatibleKinds: ['phaseTransition'],
    createTween: createBannerOverlayTween,
  },
  'zone-pulse': {
    defaultDurationSeconds: 0.5,
    compatibleKinds: ['zoneHighlight'],
    createTween: createZonePulseTween,
  },
  pulse: {
    defaultDurationSeconds: 0.2,
    compatibleKinds: VISUAL_DESCRIPTOR_KINDS,
    createTween: createPulseTween,
  },
} as const satisfies Readonly<Record<BuiltinAnimationPresetId, AnimationPresetMetadata>>;

export const BUILTIN_ANIMATION_PRESET_DEFINITIONS: readonly AnimationPresetDefinition[] = Object.freeze(
  ANIMATION_PRESET_IDS.map((id) => {
    const metadata = BUILTIN_PRESET_METADATA[id];
    const compatibleKinds = Object.freeze([...metadata.compatibleKinds]);
    return Object.freeze({
      id,
      defaultDurationSeconds: metadata.defaultDurationSeconds,
      compatibleKinds,
      createTween: metadata.createTween,
    } satisfies AnimationPresetDefinition);
  }),
);

export function resolveDefaultPresetIdForTraceKind(traceKind: EffectTraceEntry['kind']): AnimationPresetId {
  const presetId = DEFAULT_TRACE_KIND_PRESET_IDS[traceKind];
  if (presetId === null) {
    throw new Error(`Trace kind "${traceKind}" does not map to a visual animation preset.`);
  }
  return presetId;
}

const DESCRIPTOR_KIND_DEFAULT_PRESETS: Readonly<Partial<Record<PresetCompatibleDescriptorKind, AnimationPresetId>>> = {
  cardDeal: 'arc-tween',
  cardBurn: 'arc-tween',
  cardFlip: 'card-flip-3d',
};

export function resolveDefaultPresetIdForDescriptorKind(
  traceKind: EffectTraceEntry['kind'],
  descriptorKind: PresetCompatibleDescriptorKind,
): AnimationPresetId {
  const descriptorDefault = DESCRIPTOR_KIND_DEFAULT_PRESETS[descriptorKind];
  if (descriptorDefault !== undefined) {
    return descriptorDefault;
  }
  return resolveDefaultPresetIdForTraceKind(traceKind);
}

export function createPresetRegistry(
  definitions: readonly AnimationPresetDefinition[] = BUILTIN_ANIMATION_PRESET_DEFINITIONS,
): PresetRegistry {
  const map = createPresetMap(definitions);
  return createRegistryFromMap(map);
}

export function assertPresetDefinition(definition: AnimationPresetDefinition): void {
  if (definition.id.trim().length === 0) {
    throw new Error('Animation preset id must be non-empty.');
  }
  if (!Number.isFinite(definition.defaultDurationSeconds) || definition.defaultDurationSeconds <= 0) {
    throw new Error(`Animation preset "${definition.id}" defaultDurationSeconds must be > 0.`);
  }
  if (definition.compatibleKinds.length === 0) {
    throw new Error(`Animation preset "${definition.id}" must declare at least one compatible descriptor kind.`);
  }
  if (typeof definition.createTween !== 'function') {
    throw new Error(`Animation preset "${definition.id}" createTween must be a function.`);
  }

  const seenKinds = new Set<PresetCompatibleDescriptorKind>();
  for (const kind of definition.compatibleKinds) {
    if (!VISUAL_DESCRIPTOR_KINDS.includes(kind)) {
      throw new Error(`Animation preset "${definition.id}" has unsupported descriptor kind "${kind}".`);
    }
    if (seenKinds.has(kind)) {
      throw new Error(`Animation preset "${definition.id}" repeats descriptor kind "${kind}".`);
    }
    seenKinds.add(kind);
  }
}

function createPresetMap(definitions: readonly AnimationPresetDefinition[]): Map<string, AnimationPresetDefinition> {
  const map = new Map<string, AnimationPresetDefinition>();
  for (const definition of definitions) {
    assertPresetDefinition(definition);
    if (map.has(definition.id)) {
      throw new Error(`Animation preset id must be unique (id=${definition.id}).`);
    }
    map.set(definition.id, freezePresetDefinition(definition));
  }
  return map;
}

function createRegistryFromMap(map: ReadonlyMap<string, AnimationPresetDefinition>): PresetRegistry {
  const presets = Object.freeze([...map.values()]);

  return {
    size: map.size,
    list: () => presets,
    has: (id) => map.has(id),
    get: (id) => map.get(id),
    require: (id) => {
      const definition = map.get(id);
      if (definition === undefined) {
        throw new Error(`Animation preset "${id}" is not registered.`);
      }
      return definition;
    },
    requireCompatible: (id, descriptorKind) => {
      const definition = map.get(id);
      if (definition === undefined) {
        throw new Error(`Animation preset "${id}" is not registered.`);
      }
      if (!definition.compatibleKinds.includes(descriptorKind)) {
        throw new Error(
          `Animation preset "${id}" is not compatible with descriptor kind "${descriptorKind}".`,
        );
      }
      return definition;
    },
    register: (definition) => {
      assertPresetDefinition(definition);
      if (map.has(definition.id)) {
        throw new Error(`Animation preset id must be unique (id=${definition.id}).`);
      }
      const next = new Map(map);
      next.set(definition.id, freezePresetDefinition(definition));
      return createRegistryFromMap(next);
    },
    registerMany: (definitionsToRegister) => {
      const next = new Map(map);
      for (const definition of definitionsToRegister) {
        assertPresetDefinition(definition);
        if (next.has(definition.id)) {
          throw new Error(`Animation preset id must be unique (id=${definition.id}).`);
        }
        next.set(definition.id, freezePresetDefinition(definition));
      }
      return createRegistryFromMap(next);
    },
  };
}

function freezePresetDefinition(definition: AnimationPresetDefinition): AnimationPresetDefinition {
  return Object.freeze({
    id: definition.id,
    defaultDurationSeconds: definition.defaultDurationSeconds,
    compatibleKinds: Object.freeze([...definition.compatibleKinds]),
    createTween: definition.createTween,
  } satisfies AnimationPresetDefinition);
}

interface TweenTarget {
  x?: number;
  y?: number;
  alpha?: number;
  tint?: number;
  scaleX?: number;
  scale?: {
    x?: number;
    y?: number;
    set?: (x: number, y?: number) => void;
  };
}

function createArcTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  if (descriptor.kind !== 'moveToken' && descriptor.kind !== 'cardDeal' && descriptor.kind !== 'cardBurn') {
    return;
  }

  const target = context.spriteRefs.tokenContainers.get(descriptor.tokenId) as TweenTarget | undefined;
  const from = context.spriteRefs.zonePositions.positions.get(descriptor.from);
  const to = context.spriteRefs.zonePositions.positions.get(descriptor.to);
  if (target === undefined || from === undefined || to === undefined) {
    appendDelay(context, context.durationSeconds);
    return;
  }

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const liftHeight = Math.max(20, distance * 0.3);

  const midX = (from.x + to.x) / 2;
  const midY = Math.min(from.y, to.y) - liftHeight;
  const halfDuration = context.durationSeconds / 2;

  const shouldFadeIn = target.alpha === 0;
  target.x = from.x;
  target.y = from.y;
  appendTween(context, target, {
    x: midX,
    y: midY,
    ...(shouldFadeIn ? { alpha: 1 } : {}),
    ease: ARC_TWEEN_EASE,
  }, halfDuration);
  appendTween(context, target, { x: to.x, y: to.y, ease: ARC_TWEEN_EASE }, halfDuration);

  if (descriptor.kind === 'cardDeal' && descriptor.destinationRole === 'shared') {
    const faceController = context.spriteRefs.tokenFaceControllers?.get(descriptor.tokenId);
    const flipHalf = 0.1;
    appendTween(context, target, {
      scaleX: 0,
      ...(faceController === undefined
        ? {}
        : {
            onComplete: () => {
              setFaceUpWithLogging(
                context,
                descriptor.tokenId,
                faceController,
                true,
                'card-deal-to-shared-mid-arc',
              );
            },
          }),
    }, flipHalf);
    appendTween(context, target, { scaleX: 1 }, flipHalf);
  }
}

function createFadeInScaleTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  if (descriptor.kind !== 'createToken') {
    return;
  }

  const target = context.spriteRefs.tokenContainers.get(descriptor.tokenId) as TweenTarget | undefined;
  if (target === undefined) {
    appendDelay(context, context.durationSeconds);
    return;
  }

  target.alpha = 0;
  setScale(target, 0.5);
  appendTween(context, target, { alpha: 1, scale: 1 }, context.durationSeconds);
}

function createFadeOutScaleTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  if (descriptor.kind !== 'destroyToken') {
    return;
  }

  const target = context.spriteRefs.tokenContainers.get(descriptor.tokenId) as TweenTarget | undefined;
  if (target === undefined) {
    appendDelay(context, context.durationSeconds);
    return;
  }

  if (target.alpha === undefined) {
    target.alpha = 1;
  }
  setScale(target, 1);
  appendTween(context, target, { alpha: 0, scale: 0.5 }, context.durationSeconds);
}

function createCardFlip3dTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  if (descriptor.kind !== 'cardFlip') {
    return;
  }

  const target = context.spriteRefs.tokenContainers.get(descriptor.tokenId) as TweenTarget | undefined;
  const faceController = context.spriteRefs.tokenFaceControllers?.get(descriptor.tokenId);
  if (target === undefined) {
    appendDelay(context, context.durationSeconds);
    return;
  }

  const oldFaceUp = typeof descriptor.oldValue === 'boolean' ? descriptor.oldValue : undefined;
  const newFaceUp = typeof descriptor.newValue === 'boolean' ? descriptor.newValue : undefined;
  if (oldFaceUp !== undefined) {
    setFaceUpWithLogging(context, descriptor.tokenId, faceController, oldFaceUp, 'card-flip-3d-initial');
  }

  const halfDuration = context.durationSeconds / 2;
  appendTween(context, target, {
    scaleX: 0,
    ...(newFaceUp === undefined || faceController === undefined
      ? {}
      : {
          onComplete: () => {
            setFaceUpWithLogging(context, descriptor.tokenId, faceController, newFaceUp, 'card-flip-3d-mid');
          },
        }),
  }, halfDuration);
  appendTween(context, target, { scaleX: 1 }, halfDuration);
}

function createTintFlashTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  if (descriptor.kind !== 'setTokenProp') {
    return;
  }

  const target = context.spriteRefs.tokenContainers.get(descriptor.tokenId) as TweenTarget | undefined;
  if (target === undefined) {
    appendDelay(context, context.durationSeconds);
    return;
  }

  const originalTint = target.tint ?? 0xffffff;
  const halfDuration = context.durationSeconds / 2;
  appendTween(context, target, { tint: 0xffd54f }, halfDuration);
  appendTween(context, target, { tint: originalTint }, halfDuration);
}

function createCounterTickTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  if (descriptor.kind !== 'varChange' && descriptor.kind !== 'resourceTransfer') {
    return;
  }

  appendDelay(context, context.durationSeconds);
}

function createBannerOverlayTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  if (descriptor.kind !== 'phaseTransition') {
    return;
  }

  const callback = context.phaseBannerCallback;
  const phase = descriptor.phase ?? null;

  if (callback !== undefined && phase !== null) {
    context.timeline.add(() => callback(phase));
    appendDelay(context, context.durationSeconds);
    context.timeline.add(() => callback(null));
    return;
  }

  appendDelay(context, context.durationSeconds);
}

function createZonePulseTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  if (descriptor.kind !== 'zoneHighlight') {
    return;
  }

  const target = context.spriteRefs.zoneContainers.get(descriptor.zoneId) as TweenTarget | undefined;
  if (target === undefined) {
    appendDelay(context, context.durationSeconds);
    return;
  }

  const originalTint = target.tint ?? 0xffffff;
  const halfDuration = context.durationSeconds / 2;
  appendTween(context, target, { alpha: 0.68, tint: 0xc7f9cc }, halfDuration);
  appendTween(context, target, { alpha: 1, tint: originalTint }, halfDuration);
}

function createPulseTween(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): void {
  const target = resolvePulseTarget(descriptor, context);
  if (target === undefined) {
    appendDelay(context, context.durationSeconds);
    return;
  }

  const halfDuration = context.durationSeconds / 2;
  setScale(target, 1);
  appendTween(context, target, { scale: 1.08 }, halfDuration);
  appendTween(context, target, { scale: 1 }, halfDuration);
}

function resolvePulseTarget(descriptor: VisualAnimationDescriptor, context: PresetTweenContext): TweenTarget | undefined {
  if ('tokenId' in descriptor) {
    return context.spriteRefs.tokenContainers.get(descriptor.tokenId) as TweenTarget | undefined;
  }
  if (descriptor.kind === 'zoneHighlight') {
    return context.spriteRefs.zoneContainers.get(descriptor.zoneId) as TweenTarget | undefined;
  }
  return undefined;
}

function appendDelay(context: PresetTweenContext, durationSeconds: number): void {
  if (typeof context.gsap.to === 'function') {
    context.timeline.add(context.gsap.to({}, { duration: durationSeconds }));
    return;
  }
  context.timeline.add(context.gsap.timeline({ paused: true, duration: durationSeconds }));
}

function appendTween(
  context: PresetTweenContext,
  target: TweenTarget,
  vars: Record<string, unknown>,
  durationSeconds: number,
): void {
  if (typeof context.gsap.to === 'function') {
    context.timeline.add(context.gsap.to(target, { duration: durationSeconds, ...vars }));
    return;
  }

  applyVars(target, vars);
  appendDelay(context, durationSeconds);
}

function applyVars(target: TweenTarget, vars: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (key === 'scale' && typeof value === 'number') {
      setScale(target, value);
      continue;
    }
    if (key === 'x' && typeof value === 'number') {
      target.x = value;
      continue;
    }
    if (key === 'y' && typeof value === 'number') {
      target.y = value;
      continue;
    }
    if (key === 'alpha' && typeof value === 'number') {
      target.alpha = value;
      continue;
    }
    if (key === 'tint' && typeof value === 'number') {
      target.tint = value;
      continue;
    }
    if (key === 'scaleX' && typeof value === 'number') {
      target.scaleX = value;
    }
  }
}

function setScale(target: TweenTarget, value: number): void {
  const scale = target.scale;
  if (scale?.set !== undefined) {
    scale.set(value, value);
    return;
  }

  if (scale !== undefined) {
    scale.x = value;
    scale.y = value;
    return;
  }

  target.scale = { x: value, y: value };
}

function setFaceUpWithLogging(
  context: PresetTweenContext,
  tokenId: string,
  faceController: TokenFaceControllerRef | undefined,
  faceUp: boolean,
  callContext: FaceControllerCallEntry['context'],
): void {
  if (faceController === undefined) {
    return;
  }
  faceController.setFaceUp(faceUp);
  context.logger?.logFaceControllerCall({ tokenId, faceUp, context: callContext });
}
