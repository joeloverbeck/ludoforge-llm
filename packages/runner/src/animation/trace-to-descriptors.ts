import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

import type {
  AnimationDescriptor,
  AnimationDetailLevel,
  AnimationMappingOptions,
  AnimationPresetId,
} from './animation-types.js';

const DEFAULT_PRESETS: Readonly<Record<EffectTraceEntry['kind'], AnimationPresetId | null>> = {
  moveToken: 'arc-tween',
  createToken: 'fade-in-scale',
  destroyToken: 'fade-out-scale',
  setTokenProp: 'tint-flash',
  varChange: 'counter-roll',
  resourceTransfer: 'counter-roll',
  lifecycleEvent: 'banner-slide',
  forEach: null,
  reduce: null,
};

function isTriggered(entry: EffectTraceEntry): boolean {
  return entry.provenance.eventContext === 'triggerEffect';
}

function resolvePreset(
  traceKind: EffectTraceEntry['kind'],
  options: AnimationMappingOptions | undefined,
): AnimationPresetId {
  const override = options?.presetOverrides?.get(traceKind);
  if (override !== undefined) {
    return override;
  }

  const preset = DEFAULT_PRESETS[traceKind];
  if (preset === null) {
    throw new Error(`Trace kind "${traceKind}" does not map to a visual animation preset.`);
  }
  return preset;
}

function mapEntry(entry: EffectTraceEntry, options: AnimationMappingOptions | undefined): AnimationDescriptor | null {
  const triggered = isTriggered(entry);
  switch (entry.kind) {
    case 'moveToken':
      return {
        kind: 'moveToken',
        tokenId: entry.tokenId,
        from: entry.from,
        to: entry.to,
        preset: resolvePreset(entry.kind, options),
        isTriggered: triggered,
      };
    case 'createToken':
      return {
        kind: 'createToken',
        tokenId: entry.tokenId,
        type: entry.type,
        zone: entry.zone,
        preset: resolvePreset(entry.kind, options),
        isTriggered: triggered,
      };
    case 'destroyToken':
      return {
        kind: 'destroyToken',
        tokenId: entry.tokenId,
        type: entry.type,
        zone: entry.zone,
        preset: resolvePreset(entry.kind, options),
        isTriggered: triggered,
      };
    case 'setTokenProp':
      return {
        kind: 'setTokenProp',
        tokenId: entry.tokenId,
        prop: entry.prop,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        preset: resolvePreset(entry.kind, options),
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
        preset: resolvePreset(entry.kind, options),
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
        preset: resolvePreset(entry.kind, options),
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
        preset: resolvePreset(entry.kind, options),
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
): readonly AnimationDescriptor[] {
  const detailLevel = options?.detailLevel ?? 'full';
  const mapped: AnimationDescriptor[] = [];

  for (const entry of trace) {
    const descriptor = mapEntry(entry, options);
    if (descriptor === null) {
      continue;
    }
    if (passesDetailFilter(detailLevel, descriptor)) {
      mapped.push(descriptor);
    }
  }

  return mapped;
}
