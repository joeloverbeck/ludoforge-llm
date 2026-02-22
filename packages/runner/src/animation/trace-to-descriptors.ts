import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

import type {
  AnimationDescriptor,
  AnimationDetailLevel,
  AnimationMappingOptions,
  AnimationPresetId,
} from './animation-types.js';
import {
  createPresetRegistry,
  resolveDefaultPresetIdForDescriptorKind,
  type PresetCompatibleDescriptorKind,
  type PresetRegistry,
} from './preset-registry.js';
import { classifyCardSemantic } from './card-classification.js';
import { isSkippedTraceEntry } from '../model/effect-trace-kind-config.js';
import { isTriggeredEffectTraceEntry } from '../model/trace-projection.js';

const BUILTIN_PRESET_REGISTRY = createPresetRegistry();

function resolvePreset(
  traceKind: EffectTraceEntry['kind'],
  descriptorKind: PresetCompatibleDescriptorKind,
  options: AnimationMappingOptions | undefined,
  presetRegistry: PresetRegistry,
): AnimationPresetId {
  const override = options?.presetOverrides?.get(descriptorKind);
  const presetId = override ?? resolveDefaultPresetIdForDescriptorKind(traceKind, descriptorKind);
  presetRegistry.requireCompatible(presetId, descriptorKind);
  return presetId;
}

function mapEntry(
  entry: EffectTraceEntry,
  options: AnimationMappingOptions | undefined,
  presetRegistry: PresetRegistry,
): AnimationDescriptor | null {
  const triggered = isTriggeredEffectTraceEntry(entry);
  switch (entry.kind) {
    case 'moveToken':
      {
        const semanticKind = classifyCardSemantic(entry, options?.cardContext);
        if (semanticKind === 'cardDeal' || semanticKind === 'cardBurn') {
          const destinationRole =
            semanticKind === 'cardDeal'
              ? options?.cardContext?.zoneRoles.shared.has(entry.to)
                ? ('shared' as const)
                : options?.cardContext?.zoneRoles.hand.has(entry.to)
                  ? ('hand' as const)
                  : undefined
              : undefined;
          return {
            kind: semanticKind,
            tokenId: entry.tokenId,
            from: entry.from,
            to: entry.to,
            preset: resolvePreset(entry.kind, semanticKind, options, presetRegistry),
            isTriggered: triggered,
            ...(destinationRole === undefined ? {} : { destinationRole }),
          };
        }
      }
      return {
        kind: 'moveToken',
        tokenId: entry.tokenId,
        from: entry.from,
        to: entry.to,
        preset: resolvePreset(entry.kind, 'moveToken', options, presetRegistry),
        isTriggered: triggered,
      };
    case 'createToken':
      if (options?.suppressCreateToken) {
        return {
          kind: 'skipped',
          traceKind: 'createToken',
        };
      }
      return {
        kind: 'createToken',
        tokenId: entry.tokenId,
        type: entry.type,
        zone: entry.zone,
        preset: resolvePreset(entry.kind, 'createToken', options, presetRegistry),
        isTriggered: triggered,
      };
    case 'destroyToken':
      return {
        kind: 'destroyToken',
        tokenId: entry.tokenId,
        type: entry.type,
        zone: entry.zone,
        preset: resolvePreset(entry.kind, 'destroyToken', options, presetRegistry),
        isTriggered: triggered,
      };
    case 'setTokenProp':
      {
        const semanticKind = classifyCardSemantic(entry, options?.cardContext);
        if (semanticKind === 'cardFlip') {
          return {
            kind: 'cardFlip',
            tokenId: entry.tokenId,
            prop: entry.prop,
            oldValue: entry.oldValue,
            newValue: entry.newValue,
            preset: resolvePreset(entry.kind, 'cardFlip', options, presetRegistry),
            isTriggered: triggered,
          };
        }
      }
      return {
        kind: 'setTokenProp',
        tokenId: entry.tokenId,
        prop: entry.prop,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        preset: resolvePreset(entry.kind, 'setTokenProp', options, presetRegistry),
        isTriggered: triggered,
      };
    case 'varChange':
      return {
        kind: 'varChange',
        scope: entry.scope,
        varName: entry.varName,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        ...(entry.player === undefined ? {} : { player: entry.player }),
        preset: resolvePreset(entry.kind, 'varChange', options, presetRegistry),
        isTriggered: triggered,
      };
    case 'resourceTransfer':
      return {
        kind: 'resourceTransfer',
        from: entry.from,
        to: entry.to,
        requestedAmount: entry.requestedAmount,
        actualAmount: entry.actualAmount,
        sourceAvailable: entry.sourceAvailable,
        destinationHeadroom: entry.destinationHeadroom,
        ...(entry.minAmount === undefined ? {} : { minAmount: entry.minAmount }),
        ...(entry.maxAmount === undefined ? {} : { maxAmount: entry.maxAmount }),
        preset: resolvePreset(entry.kind, 'resourceTransfer', options, presetRegistry),
        isTriggered: triggered,
      };
    case 'lifecycleEvent':
      if (entry.eventType !== 'phaseEnter') {
        return null;
      }
      if (
        options?.phaseBannerPhases !== undefined &&
        (entry.phase === undefined || !options.phaseBannerPhases.has(entry.phase))
      ) {
        return null;
      }
      return {
        kind: 'phaseTransition',
        eventType: entry.eventType,
        ...(entry.phase === undefined ? {} : { phase: entry.phase }),
        preset: resolvePreset(entry.kind, 'phaseTransition', options, presetRegistry),
        isTriggered: triggered,
      };
  }

  if (isSkippedTraceEntry(entry)) {
    return {
      kind: 'skipped',
      traceKind: entry.kind,
    };
  }

  return assertNever(entry);
}

const assertNever = (_value: never): never => {
  throw new Error('Unhandled effect trace kind.');
};

function passesDetailFilter(detailLevel: AnimationDetailLevel, descriptor: AnimationDescriptor): boolean {
  if (descriptor.kind === 'skipped') {
    return true;
  }

  if (detailLevel === 'full') {
    return true;
  }

  if (descriptor.kind === 'phaseTransition') {
    return true;
  }

  if (detailLevel === 'standard') {
    if (descriptor.kind === 'varChange') {
      return false;
    }
    if (descriptor.kind === 'resourceTransfer') {
      return false;
    }
    return true;
  }

  return (
    descriptor.kind === 'moveToken' ||
    descriptor.kind === 'cardDeal' ||
    descriptor.kind === 'cardBurn' ||
    descriptor.kind === 'createToken'
  );
}

export function traceToDescriptors(
  trace: readonly EffectTraceEntry[],
  options?: AnimationMappingOptions,
  presetRegistry: PresetRegistry = BUILTIN_PRESET_REGISTRY,
): readonly AnimationDescriptor[] {
  const detailLevel = options?.detailLevel ?? 'full';
  const mapped: AnimationDescriptor[] = [];

  for (const entry of trace) {
    const descriptor = mapEntry(entry, options, presetRegistry);
    if (descriptor === null) {
      continue;
    }
    if (passesDetailFilter(detailLevel, descriptor)) {
      mapped.push(descriptor);
    }
  }

  return mapped;
}
