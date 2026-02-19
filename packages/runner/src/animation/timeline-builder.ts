import type { Container } from 'pixi.js';

import type { ZonePositionMap } from '../canvas/position-store.js';
import type { AnimationDescriptor } from './animation-types.js';
import type { GsapLike, GsapTimelineLike } from './gsap-setup.js';
import type { PresetRegistry } from './preset-registry.js';

type VisualAnimationDescriptor = Exclude<AnimationDescriptor, { kind: 'skipped' }>;

export interface TimelineSpriteRefs {
  readonly tokenContainers: ReadonlyMap<string, Container>;
  readonly zoneContainers: ReadonlyMap<string, Container>;
  readonly zonePositions: ZonePositionMap;
}

export function buildTimeline(
  descriptors: readonly AnimationDescriptor[],
  presetRegistry: PresetRegistry,
  spriteRefs: TimelineSpriteRefs,
  gsap: GsapLike,
): GsapTimelineLike {
  const timeline = gsap.timeline();

  for (const descriptor of descriptors) {
    if (descriptor.kind === 'skipped') {
      continue;
    }

    const missingReason = getMissingSpriteReason(descriptor, spriteRefs);
    if (missingReason !== null) {
      console.warn(`Skipping animation descriptor "${descriptor.kind}": ${missingReason}`);
      continue;
    }

    try {
      if (descriptor.isTriggered) {
        const pulsePreset = presetRegistry.get('pulse');
        if (pulsePreset !== undefined && pulsePreset.compatibleKinds.includes(descriptor.kind)) {
          pulsePreset.createTween(descriptor, {
            gsap,
            timeline,
            spriteRefs,
          });
        }
      }

      const preset = presetRegistry.requireCompatible(descriptor.preset, descriptor.kind);
      preset.createTween(descriptor, {
        gsap,
        timeline,
        spriteRefs,
      });
    } catch (error) {
      console.warn(`Animation tween generation failed for descriptor "${descriptor.kind}".`, error);
    }
  }

  return timeline;
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
      if (!spriteRefs.zoneContainers.has(descriptor.from)) {
        return `source zone container not found (zoneId=${descriptor.from})`;
      }
      if (!spriteRefs.zoneContainers.has(descriptor.to)) {
        return `target zone container not found (zoneId=${descriptor.to})`;
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
      if (!spriteRefs.zoneContainers.has(descriptor.zone)) {
        return `zone container not found (zoneId=${descriptor.zone})`;
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
