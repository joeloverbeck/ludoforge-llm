import type { AnimationDescriptor, AnimationPresetId, ZoneHighlightDescriptor } from './animation-types.js';
import type { ResolvedZoneHighlightPolicy } from '../config/visual-config-provider.js';

interface ZoneHighlightDecoratorOptions {
  readonly presetId: AnimationPresetId;
  readonly policy: ResolvedZoneHighlightPolicy;
}

type ZoneHighlightSourceDescriptor = Extract<
  AnimationDescriptor,
  { kind: 'moveToken' | 'cardDeal' | 'cardBurn' | 'createToken' | 'destroyToken' }
>;

export function decorateWithZoneHighlights(
  descriptors: readonly AnimationDescriptor[],
  options: ZoneHighlightDecoratorOptions,
): readonly AnimationDescriptor[] {
  if (!options.policy.enabled || descriptors.length === 0) {
    return descriptors;
  }

  const allowedKinds = new Set(options.policy.includeKinds);
  const decorated: AnimationDescriptor[] = [];

  for (const descriptor of descriptors) {
    decorated.push(descriptor);

    if (!isZoneHighlightSourceDescriptor(descriptor)) {
      continue;
    }
    if (!allowedKinds.has(descriptor.kind)) {
      continue;
    }

    const zoneIds = resolveHighlightedZones(descriptor, options.policy.moveEndpoints);
    const emitted = new Set<string>();
    for (const zoneId of zoneIds) {
      if (emitted.has(zoneId)) {
        continue;
      }
      emitted.add(zoneId);
      decorated.push({
        kind: 'zoneHighlight',
        zoneId,
        sourceKind: descriptor.kind,
        preset: options.presetId,
        isTriggered: descriptor.isTriggered,
      } satisfies ZoneHighlightDescriptor);
    }
  }

  return decorated;
}

function resolveHighlightedZones(
  descriptor: ZoneHighlightSourceDescriptor,
  moveEndpoints: ResolvedZoneHighlightPolicy['moveEndpoints'],
): readonly string[] {
  switch (descriptor.kind) {
    case 'moveToken':
    case 'cardDeal':
    case 'cardBurn':
      if (moveEndpoints === 'from') {
        return [descriptor.from];
      }
      if (moveEndpoints === 'to') {
        return [descriptor.to];
      }
      return [descriptor.from, descriptor.to];
    case 'createToken':
    case 'destroyToken':
      return [descriptor.zone];
  }
}

function isZoneHighlightSourceDescriptor(descriptor: AnimationDescriptor): descriptor is ZoneHighlightSourceDescriptor {
  return descriptor.kind === 'moveToken'
    || descriptor.kind === 'cardDeal'
    || descriptor.kind === 'cardBurn'
    || descriptor.kind === 'createToken'
    || descriptor.kind === 'destroyToken';
}
