import type { Container } from 'pixi.js';

import type { ZonePositionMap } from '../spatial/position-types.js';
import type {
  AnimationDescriptor,
  AnimationSequencingPolicy,
  VisualAnimationDescriptorKind,
} from './animation-types.js';
import type { GsapLike, GsapTimelineLike } from './gsap-setup.js';
import type { PresetRegistry, PresetTweenContext } from './preset-registry.js';

type VisualAnimationDescriptor = Exclude<AnimationDescriptor, { kind: 'skipped' }>;

export interface TimelineSpriteRefs {
  readonly tokenContainers: ReadonlyMap<string, Container>;
  readonly zoneContainers: ReadonlyMap<string, Container>;
  readonly zonePositions: ZonePositionMap;
}

export interface BuildTimelineOptions {
  readonly sequencingPolicies?: ReadonlyMap<VisualAnimationDescriptorKind, AnimationSequencingPolicy>;
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

  const visual = filterVisualDescriptors(descriptors, spriteRefs);
  const groups = groupConsecutiveSameKind(visual);

  for (const group of groups) {
    const firstDescriptor = group[0];
    if (firstDescriptor === undefined) {
      continue;
    }

    const policy = policies?.get(firstDescriptor.kind);
    const mode = policy?.mode ?? 'sequential';

    if (mode === 'sequential' || group.length <= 1) {
      for (const descriptor of group) {
        processDescriptor(descriptor, presetRegistry, { gsap, timeline, spriteRefs });
      }
      continue;
    }

    for (let i = 0; i < group.length; i++) {
      const descriptor = group[i];
      if (descriptor === undefined) {
        continue;
      }

      const subTimeline = gsap.timeline();
      processDescriptor(descriptor, presetRegistry, { gsap, timeline: subTimeline, spriteRefs });

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

  return timeline;
}

function filterVisualDescriptors(
  descriptors: readonly AnimationDescriptor[],
  spriteRefs: TimelineSpriteRefs,
): readonly VisualAnimationDescriptor[] {
  const result: VisualAnimationDescriptor[] = [];
  for (const descriptor of descriptors) {
    if (descriptor.kind === 'skipped') {
      continue;
    }
    const missingReason = getMissingSpriteReason(descriptor, spriteRefs);
    if (missingReason !== null) {
      console.warn(`Skipping animation descriptor "${descriptor.kind}": ${missingReason}`);
      continue;
    }
    result.push(descriptor);
  }
  return result;
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

function processDescriptor(
  descriptor: VisualAnimationDescriptor,
  presetRegistry: PresetRegistry,
  context: Omit<PresetTweenContext, 'durationSeconds'>,
): void {
  try {
    if (descriptor.isTriggered) {
      const pulsePreset = presetRegistry.get('pulse');
      if (pulsePreset !== undefined && pulsePreset.compatibleKinds.includes(descriptor.kind)) {
        pulsePreset.createTween(descriptor, {
          ...context,
          durationSeconds: pulsePreset.defaultDurationSeconds,
        });
      }
    }

    const preset = presetRegistry.requireCompatible(descriptor.preset, descriptor.kind);
    preset.createTween(descriptor, {
      ...context,
      durationSeconds: preset.defaultDurationSeconds,
    });
  } catch (error) {
    console.warn(`Animation tween generation failed for descriptor "${descriptor.kind}".`, error);
  }
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
  }
}
