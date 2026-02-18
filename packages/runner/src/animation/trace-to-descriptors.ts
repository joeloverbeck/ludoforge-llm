import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

import type {
  AnimationDescriptor,
  AnimationDetailLevel,
  AnimationMappingOptions,
  AnimationPresetId,
} from './animation-types.js';
import {
  createPresetRegistry,
  resolveDefaultPresetIdForTraceKind,
  type PresetCompatibleDescriptorKind,
  type PresetRegistry,
} from './preset-registry.js';

const BUILTIN_PRESET_REGISTRY = createPresetRegistry();

function isTriggered(entry: EffectTraceEntry): boolean {
  return entry.provenance.eventContext === 'triggerEffect';
}

function resolvePreset(
  traceKind: EffectTraceEntry['kind'],
  descriptorKind: PresetCompatibleDescriptorKind,
  options: AnimationMappingOptions | undefined,
  presetRegistry: PresetRegistry,
): AnimationPresetId {
  const override = options?.presetOverrides?.get(traceKind);
  const presetId = override ?? resolveDefaultPresetIdForTraceKind(traceKind);
  presetRegistry.requireCompatible(presetId, descriptorKind);
  return presetId;
}

function mapEntry(
  entry: EffectTraceEntry,
  options: AnimationMappingOptions | undefined,
  presetRegistry: PresetRegistry,
): AnimationDescriptor | null {
  const triggered = isTriggered(entry);
  switch (entry.kind) {
    case 'moveToken':
      return {
        kind: 'moveToken',
        tokenId: entry.tokenId,
        from: entry.from,
        to: entry.to,
        preset: resolvePreset(entry.kind, 'moveToken', options, presetRegistry),
        isTriggered: triggered,
      };
    case 'createToken':
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
      return {
        kind: 'phaseTransition',
        eventType: entry.eventType,
        ...(entry.phase === undefined ? {} : { phase: entry.phase }),
        preset: resolvePreset(entry.kind, 'phaseTransition', options, presetRegistry),
        isTriggered: triggered,
      };
    case 'forEach':
      return {
        kind: 'skipped',
        traceKind: 'forEach',
      };
    case 'reduce':
      return {
        kind: 'skipped',
        traceKind: 'reduce',
      };
  }
}

function passesDetailFilter(detailLevel: AnimationDetailLevel, descriptor: AnimationDescriptor): boolean {
  if (descriptor.kind === 'skipped') {
    return true;
  }

  if (detailLevel === 'full') {
    return true;
  }

  if (detailLevel === 'standard') {
    if (descriptor.kind === 'phaseTransition') {
      return false;
    }
    if (descriptor.kind === 'varChange' && descriptor.isTriggered) {
      return false;
    }
    return true;
  }

  return descriptor.kind === 'moveToken' || descriptor.kind === 'createToken';
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
