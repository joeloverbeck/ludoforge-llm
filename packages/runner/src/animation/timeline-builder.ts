import type { Container } from 'pixi.js';

import type { AnimationLogger } from './animation-logger.js';
import type { ZonePositionMap } from '../spatial/position-types.js';
import type {
  AnimationDescriptor,
  AnimationSequencingPolicy,
  CardFlipDescriptor,
  VisualAnimationDescriptorKind,
} from './animation-types.js';
import type { DiagnosticPosition, TweenLogEntry } from './animation-diagnostics.js';
import type { EphemeralContainerFactory } from './ephemeral-container-factory.js';
import type { GsapLike, GsapTimelineLike } from './gsap-setup.js';
import type { PresetRegistry, PresetTweenContext } from './preset-registry.js';

type VisualAnimationDescriptor = Exclude<AnimationDescriptor, { kind: 'skipped' }>;
type TimelineLogger = Pick<
AnimationLogger,
'logSpriteResolution' | 'logEphemeralCreated' | 'logTweenCreated' | 'logTokenVisibilityInit' | 'logFaceControllerCall'
>;

const NOOP_TIMELINE_LOGGER: TimelineLogger = {
  logSpriteResolution() {},
  logEphemeralCreated() {},
  logTweenCreated() {},
  logFaceControllerCall() {},
  logTokenVisibilityInit() {},
};

export interface TimelineSpriteRefs {
  readonly tokenContainers: ReadonlyMap<string, Container>;
  readonly tokenFaceControllers?: ReadonlyMap<string, { setFaceUp(faceUp: boolean): void }>;
  readonly zoneContainers: ReadonlyMap<string, Container>;
  readonly zonePositions: ZonePositionMap;
}

export interface BuildTimelineOptions {
  readonly sequencingPolicies?: ReadonlyMap<VisualAnimationDescriptorKind, AnimationSequencingPolicy>;
  readonly durationSecondsByKind?: ReadonlyMap<VisualAnimationDescriptorKind, number>;
  readonly initializeTokenVisibility?: boolean;
  readonly ephemeralContainerFactory?: EphemeralContainerFactory;
  readonly phaseBannerCallback?: (phase: string | null) => void;
  readonly logger?: TimelineLogger;
}

export function buildTimeline(
  descriptors: readonly AnimationDescriptor[],
  presetRegistry: PresetRegistry,
  spriteRefs: TimelineSpriteRefs,
  gsap: GsapLike,
  options?: BuildTimelineOptions,
): GsapTimelineLike {
  const timeline = gsap.timeline();
  const policies = options?.sequencingPolicies;
  const durationByKind = options?.durationSecondsByKind;
  const factory = options?.ephemeralContainerFactory;
  const logger = options?.logger ?? NOOP_TIMELINE_LOGGER;
  const contextExtras: Pick<PresetTweenContext, 'phaseBannerCallback' | 'logger'> = {
    ...(options?.phaseBannerCallback !== undefined ? { phaseBannerCallback: options.phaseBannerCallback } : {}),
    logger,
  };

  const effectiveRefs = factory !== undefined
    ? provisionEphemeralContainers(descriptors, spriteRefs, factory, logger)
    : spriteRefs;

  const visual = filterVisualDescriptors(descriptors, effectiveRefs, logger);

  const { mainDescriptors, zoneHighlights } = partitionZoneHighlights(visual);

  if (options?.initializeTokenVisibility) {
    prepareTokensForAnimation(mainDescriptors, effectiveRefs, logger);
  }

  const groups = groupConsecutiveSameKind(mainDescriptors);

  for (const group of groups) {
    const firstDescriptor = group[0];
    if (firstDescriptor === undefined) {
      continue;
    }

    const policy = policies?.get(firstDescriptor.kind);
    const mode = policy?.mode ?? 'sequential';
    const durationOverrideSeconds = durationByKind?.get(firstDescriptor.kind);

    if (mode === 'sequential' || group.length <= 1) {
      for (const descriptor of group) {
        processDescriptor(
          descriptor,
          presetRegistry,
          { gsap, timeline, spriteRefs: effectiveRefs, ...contextExtras },
          durationOverrideSeconds,
          logger,
        );
      }
      continue;
    }

    for (let i = 0; i < group.length; i++) {
      const descriptor = group[i];
      if (descriptor === undefined) {
        continue;
      }

      const subTimeline = gsap.timeline();
      processDescriptor(
        descriptor,
        presetRegistry,
        { gsap, timeline: subTimeline, spriteRefs: effectiveRefs, ...contextExtras },
        durationOverrideSeconds,
        logger,
      );

      if (i === 0) {
        timeline.add(subTimeline);
      } else if (mode === 'parallel') {
        timeline.add(subTimeline, '<');
      } else {
        const offset = policy?.staggerOffsetSeconds ?? 0.15;
        timeline.add(subTimeline, `<+=${offset}`);
      }
    }
  }

  if (zoneHighlights.length > 0) {
    const highlightTimeline = gsap.timeline();
    for (const descriptor of zoneHighlights) {
      processDescriptor(
        descriptor,
        presetRegistry,
        { gsap, timeline: highlightTimeline, spriteRefs: effectiveRefs, ...contextExtras },
        durationByKind?.get('zoneHighlight'),
        logger,
      );
    }
    timeline.add(highlightTimeline, 0);
  }

  if (factory !== undefined) {
    timeline.add(() => factory.destroyAll());
  }

  return timeline;
}

function filterVisualDescriptors(
  descriptors: readonly AnimationDescriptor[],
  spriteRefs: TimelineSpriteRefs,
  logger: TimelineLogger,
): readonly VisualAnimationDescriptor[] {
  const result: VisualAnimationDescriptor[] = [];
  let lastSourceSkipped = false;
  for (const descriptor of descriptors) {
    if (descriptor.kind === 'skipped') {
      continue;
    }
    if (descriptor.kind === 'zoneHighlight' && lastSourceSkipped) {
      logger.logSpriteResolution({
        descriptorKind: descriptor.kind,
        zoneId: descriptor.zoneId,
        resolved: false,
        reason: 'zoneHighlight suppressed because its source descriptor was skipped',
      });
      continue;
    }
    lastSourceSkipped = false;
    const missingReason = getMissingSpriteReason(descriptor, spriteRefs);
    if (missingReason !== null) {
      logger.logSpriteResolution(buildSpriteResolutionEntry(descriptor, spriteRefs, false, missingReason));
      lastSourceSkipped = true;
      continue;
    }
    logger.logSpriteResolution(buildSpriteResolutionEntry(descriptor, spriteRefs, true));
    result.push(descriptor);
  }
  return result;
}

function provisionEphemeralContainers(
  descriptors: readonly AnimationDescriptor[],
  spriteRefs: TimelineSpriteRefs,
  factory: EphemeralContainerFactory,
  logger: TimelineLogger,
): TimelineSpriteRefs {
  const ephemeralTokens = new Map<string, Container>();
  const ephemeralFaceControllers = new Map<string, { setFaceUp(faceUp: boolean): void }>();

  for (const descriptor of descriptors) {
    if (descriptor.kind === 'skipped') {
      continue;
    }
    if (
      (descriptor.kind === 'moveToken' ||
        descriptor.kind === 'cardDeal' ||
        descriptor.kind === 'cardBurn') &&
      !spriteRefs.tokenContainers.has(descriptor.tokenId) &&
      !ephemeralTokens.has(descriptor.tokenId)
    ) {
      const container = factory.create(descriptor.tokenId);
      ephemeralTokens.set(descriptor.tokenId, container);
      logger.logEphemeralCreated({
        tokenId: descriptor.tokenId,
        width: container.width,
        height: container.height,
      });
      ephemeralFaceControllers.set(descriptor.tokenId, {
        setFaceUp(faceUp: boolean) {
          const backChild = container.getChildByLabel('back');
          const frontChild = container.getChildByLabel('front');
          if (backChild !== null && frontChild !== null) {
            backChild.visible = !faceUp;
            frontChild.visible = faceUp;
          }
        },
      });
    }
  }

  if (ephemeralTokens.size === 0) {
    return spriteRefs;
  }

  const mergedTokenContainers = new Map(spriteRefs.tokenContainers);
  for (const [id, container] of ephemeralTokens) {
    mergedTokenContainers.set(id, container);
  }

  const mergedFaceControllers = new Map(spriteRefs.tokenFaceControllers ?? []);
  for (const [id, controller] of ephemeralFaceControllers) {
    mergedFaceControllers.set(id, controller);
  }

  return {
    ...spriteRefs,
    tokenContainers: mergedTokenContainers,
    tokenFaceControllers: mergedFaceControllers,
  };
}

function partitionZoneHighlights(
  descriptors: readonly VisualAnimationDescriptor[],
): { readonly mainDescriptors: readonly VisualAnimationDescriptor[]; readonly zoneHighlights: readonly VisualAnimationDescriptor[] } {
  const mainDescriptors: VisualAnimationDescriptor[] = [];
  const zoneHighlights: VisualAnimationDescriptor[] = [];

  for (const descriptor of descriptors) {
    if (descriptor.kind === 'zoneHighlight') {
      zoneHighlights.push(descriptor);
    } else {
      mainDescriptors.push(descriptor);
    }
  }

  return { mainDescriptors, zoneHighlights };
}

function groupConsecutiveSameKind(
  descriptors: readonly VisualAnimationDescriptor[],
): readonly (readonly VisualAnimationDescriptor[])[] {
  if (descriptors.length === 0) {
    return [];
  }

  const first = descriptors[0];
  if (first === undefined) {
    return [];
  }

  const groups: VisualAnimationDescriptor[][] = [];
  let current: VisualAnimationDescriptor[] = [first];

  for (let i = 1; i < descriptors.length; i++) {
    const descriptor = descriptors[i];
    if (descriptor === undefined) {
      continue;
    }
    if (descriptor.kind === current[0]!.kind) {
      current.push(descriptor);
    } else {
      groups.push(current);
      current = [descriptor];
    }
  }
  groups.push(current);

  return groups;
}

function prepareTokensForAnimation(
  descriptors: readonly VisualAnimationDescriptor[],
  spriteRefs: TimelineSpriteRefs,
  logger: TimelineLogger,
): void {
  for (const d of descriptors) {
    if (d.kind === 'cardDeal' || d.kind === 'moveToken' || d.kind === 'cardBurn') {
      const container = spriteRefs.tokenContainers.get(d.tokenId) as
        | { alpha?: number }
        | undefined;
      if (container) {
        container.alpha = 0;
        logger.logTokenVisibilityInit({ tokenId: d.tokenId, alphaSetTo: 0 });
      }
    }
  }
}

function processDescriptor(
  descriptor: VisualAnimationDescriptor,
  presetRegistry: PresetRegistry,
  context: Omit<PresetTweenContext, 'durationSeconds'>,
  durationOverrideSeconds: number | undefined,
  logger: TimelineLogger,
): void {
  try {
    if (descriptor.isTriggered) {
      const pulsePreset = presetRegistry.get('pulse');
      if (pulsePreset !== undefined && pulsePreset.compatibleKinds.includes(descriptor.kind)) {
        const pulseDuration = durationOverrideSeconds ?? pulsePreset.defaultDurationSeconds;
        pulsePreset.createTween(descriptor, {
          ...context,
          durationSeconds: pulseDuration,
        });
        logger.logTweenCreated(buildTweenLogEntry(descriptor, pulsePreset.id, pulseDuration, true, context.spriteRefs));
      }
    }

    const preset = presetRegistry.requireCompatible(descriptor.preset, descriptor.kind);
    const durationSeconds = durationOverrideSeconds ?? preset.defaultDurationSeconds;
    preset.createTween(descriptor, {
      ...context,
      durationSeconds,
    });
    logger.logTweenCreated(buildTweenLogEntry(descriptor, preset.id, durationSeconds, false, context.spriteRefs));
  } catch (error) {
    console.warn(`Animation tween generation failed for descriptor "${descriptor.kind}".`, error);
  }
}

function buildTweenLogEntry(
  descriptor: VisualAnimationDescriptor,
  preset: string,
  durationSeconds: number,
  isTriggeredPulse: boolean,
  spriteRefs: PresetTweenContext['spriteRefs'],
): TweenLogEntry {
  const tokenId = getDescriptorTokenId(descriptor);
  const fromPosition = getDescriptorFromPosition(descriptor, spriteRefs);
  const toPosition = getDescriptorToPosition(descriptor, spriteRefs);

  return {
    descriptorKind: descriptor.kind,
    ...(tokenId === undefined ? {} : { tokenId }),
    preset,
    durationSeconds,
    isTriggeredPulse,
    ...(fromPosition === undefined ? {} : { fromPosition }),
    ...(toPosition === undefined ? {} : { toPosition }),
    ...(descriptor.kind === 'cardFlip' && isBooleanFaceChange(descriptor)
      ? { faceState: { oldValue: descriptor.oldValue, newValue: descriptor.newValue } }
      : {}),
  };
}

function isBooleanFaceChange(descriptor: CardFlipDescriptor): descriptor is CardFlipDescriptor & { oldValue: boolean; newValue: boolean } {
  return typeof descriptor.oldValue === 'boolean' && typeof descriptor.newValue === 'boolean';
}

function getDescriptorTokenId(descriptor: VisualAnimationDescriptor): string | undefined {
  switch (descriptor.kind) {
    case 'moveToken':
    case 'cardDeal':
    case 'cardBurn':
    case 'createToken':
    case 'destroyToken':
    case 'setTokenProp':
    case 'cardFlip':
      return descriptor.tokenId;
    default:
      return undefined;
  }
}

function getDescriptorZoneId(descriptor: VisualAnimationDescriptor): string | undefined {
  switch (descriptor.kind) {
    case 'moveToken':
    case 'cardDeal':
    case 'cardBurn':
      return descriptor.from;
    case 'createToken':
    case 'destroyToken':
      return descriptor.zone;
    case 'zoneHighlight':
      return descriptor.zoneId;
    default:
      return undefined;
  }
}

function getDescriptorPrimaryPosition(
  descriptor: VisualAnimationDescriptor,
  spriteRefs: TimelineSpriteRefs,
): DiagnosticPosition | undefined {
  const zoneId = getDescriptorZoneId(descriptor);
  if (zoneId !== undefined) {
    const position = spriteRefs.zonePositions.positions.get(zoneId);
    if (position !== undefined) {
      return { x: position.x, y: position.y };
    }
  }
  return undefined;
}

function getDescriptorFromPosition(
  descriptor: VisualAnimationDescriptor,
  spriteRefs: Pick<PresetTweenContext['spriteRefs'], 'zonePositions'>,
): DiagnosticPosition | undefined {
  if (descriptor.kind === 'moveToken' || descriptor.kind === 'cardDeal' || descriptor.kind === 'cardBurn') {
    const position = spriteRefs.zonePositions.positions.get(descriptor.from);
    if (position !== undefined) {
      return { x: position.x, y: position.y };
    }
  }
  return undefined;
}

function getDescriptorToPosition(
  descriptor: VisualAnimationDescriptor,
  spriteRefs: Pick<PresetTweenContext['spriteRefs'], 'zonePositions'>,
): DiagnosticPosition | undefined {
  if (descriptor.kind === 'moveToken' || descriptor.kind === 'cardDeal' || descriptor.kind === 'cardBurn') {
    const position = spriteRefs.zonePositions.positions.get(descriptor.to);
    if (position !== undefined) {
      return { x: position.x, y: position.y };
    }
  }
  return undefined;
}

function getDescriptorContainerType(
  descriptor: VisualAnimationDescriptor,
  spriteRefs: TimelineSpriteRefs,
): 'existing' | 'ephemeral' | undefined {
  const tokenId = getDescriptorTokenId(descriptor);
  if (tokenId === undefined) {
    return undefined;
  }

  const container = spriteRefs.tokenContainers.get(tokenId);
  if (container === undefined) {
    return undefined;
  }
  if (typeof container.label === 'string' && container.label.startsWith('ephemeral:')) {
    return 'ephemeral';
  }
  return 'existing';
}

function buildSpriteResolutionEntry(
  descriptor: VisualAnimationDescriptor,
  spriteRefs: TimelineSpriteRefs,
  resolved: boolean,
  reason?: string,
) {
  const tokenId = getDescriptorTokenId(descriptor);
  const zoneId = getDescriptorZoneId(descriptor);
  const containerType = getDescriptorContainerType(descriptor, spriteRefs);
  const position = resolved ? getDescriptorPrimaryPosition(descriptor, spriteRefs) : undefined;

  return {
    descriptorKind: descriptor.kind,
    resolved,
    ...(tokenId === undefined ? {} : { tokenId }),
    ...(zoneId === undefined ? {} : { zoneId }),
    ...(containerType === undefined ? {} : { containerType }),
    ...(position === undefined ? {} : { position }),
    ...(reason === undefined ? {} : { reason }),
  };
}

function getMissingSpriteReason(
  descriptor: VisualAnimationDescriptor,
  spriteRefs: TimelineSpriteRefs,
): string | null {
  switch (descriptor.kind) {
    case 'moveToken':
    case 'cardDeal':
    case 'cardBurn':
      if (!spriteRefs.tokenContainers.has(descriptor.tokenId)) {
        return `token container not found (tokenId=${descriptor.tokenId})`;
      }
      if (!spriteRefs.zonePositions.positions.has(descriptor.from)) {
        return `source zone position not found (zoneId=${descriptor.from})`;
      }
      if (!spriteRefs.zonePositions.positions.has(descriptor.to)) {
        return `target zone position not found (zoneId=${descriptor.to})`;
      }
      return null;
    case 'createToken':
    case 'destroyToken':
      if (!spriteRefs.tokenContainers.has(descriptor.tokenId)) {
        return `token container not found (tokenId=${descriptor.tokenId})`;
      }
      if (!spriteRefs.zonePositions.positions.has(descriptor.zone)) {
        return `zone position not found (zoneId=${descriptor.zone})`;
      }
      return null;
    case 'setTokenProp':
    case 'cardFlip':
      if (!spriteRefs.tokenContainers.has(descriptor.tokenId)) {
        return `token container not found (tokenId=${descriptor.tokenId})`;
      }
      return null;
    case 'varChange':
    case 'resourceTransfer':
    case 'phaseTransition':
      return null;
    case 'zoneHighlight':
      if (!spriteRefs.zoneContainers.has(descriptor.zoneId)) {
        return `zone container not found (zoneId=${descriptor.zoneId})`;
      }
      return null;
  }
}
