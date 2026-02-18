import { asPlayerId, type EffectTraceEntry } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { traceToDescriptors } from '../../src/animation/trace-to-descriptors';

function traceEntryProvenance(eventContext: EffectTraceEntry['provenance']['eventContext']) {
  return {
    phase: 'main',
    eventContext,
    effectPath: 'effects.0',
  } as const;
}

describe('traceToDescriptors', () => {
  it('maps all supported effect trace kinds with canonical fields', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'createToken',
        tokenId: 'tok:2',
        type: 'cube',
        zone: 'zone:b',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'destroyToken',
        tokenId: 'tok:2',
        type: 'cube',
        zone: 'zone:b',
        provenance: traceEntryProvenance('triggerEffect'),
      },
      {
        kind: 'setTokenProp',
        tokenId: 'tok:1',
        prop: 'selected',
        oldValue: false,
        newValue: true,
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'varChange',
        scope: 'perPlayer',
        varName: 'coins',
        oldValue: 1,
        newValue: 2,
        player: asPlayerId(1),
        provenance: traceEntryProvenance('triggerEffect'),
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'bank' },
        to: { scope: 'perPlayer', varName: 'coins', player: asPlayerId(1) },
        requestedAmount: 3,
        actualAmount: 2,
        sourceAvailable: 2,
        destinationHeadroom: 8,
        minAmount: 1,
        maxAmount: 3,
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'cleanup',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
      {
        kind: 'lifecycleEvent',
        eventType: 'turnStart',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
      {
        kind: 'forEach',
        bind: '$token',
        matchCount: 5,
        iteratedCount: 3,
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'reduce',
        itemBind: '$item',
        accBind: '$acc',
        resultBind: '$result',
        matchCount: 3,
        iteratedCount: 3,
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(traceToDescriptors(trace)).toEqual([
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'createToken',
        tokenId: 'tok:2',
        type: 'cube',
        zone: 'zone:b',
        preset: 'fade-in-scale',
        isTriggered: false,
      },
      {
        kind: 'destroyToken',
        tokenId: 'tok:2',
        type: 'cube',
        zone: 'zone:b',
        preset: 'fade-out-scale',
        isTriggered: true,
      },
      {
        kind: 'setTokenProp',
        tokenId: 'tok:1',
        prop: 'selected',
        oldValue: false,
        newValue: true,
        preset: 'tint-flash',
        isTriggered: false,
      },
      {
        kind: 'varChange',
        scope: 'perPlayer',
        varName: 'coins',
        oldValue: 1,
        newValue: 2,
        player: asPlayerId(1),
        preset: 'counter-roll',
        isTriggered: true,
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'bank' },
        to: { scope: 'perPlayer', varName: 'coins', player: asPlayerId(1) },
        requestedAmount: 3,
        actualAmount: 2,
        sourceAvailable: 2,
        destinationHeadroom: 8,
        minAmount: 1,
        maxAmount: 3,
        preset: 'counter-roll',
        isTriggered: false,
      },
      {
        kind: 'phaseTransition',
        eventType: 'phaseEnter',
        phase: 'cleanup',
        preset: 'banner-slide',
        isTriggered: false,
      },
      {
        kind: 'skipped',
        traceKind: 'forEach',
      },
      {
        kind: 'skipped',
        traceKind: 'reduce',
      },
    ]);
  });

  it('applies preset overrides by trace kind', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'main',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
    ];

    expect(
      traceToDescriptors(trace, {
        presetOverrides: new Map([
          ['moveToken', 'pulse'],
          ['lifecycleEvent', 'pulse'],
        ]),
      }),
    ).toEqual([
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'pulse',
        isTriggered: false,
      },
      {
        kind: 'phaseTransition',
        eventType: 'phaseEnter',
        phase: 'main',
        preset: 'pulse',
        isTriggered: false,
      },
    ]);
  });

  it('filters detail levels and preserves structural skipped descriptors', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'createToken',
        tokenId: 'tok:2',
        type: 'cube',
        zone: 'zone:b',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'varChange',
        scope: 'global',
        varName: 'score',
        oldValue: 1,
        newValue: 2,
        provenance: traceEntryProvenance('triggerEffect'),
      },
      {
        kind: 'varChange',
        scope: 'global',
        varName: 'round',
        oldValue: 1,
        newValue: 2,
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'main',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
      {
        kind: 'forEach',
        bind: '$item',
        matchCount: 1,
        iteratedCount: 1,
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(traceToDescriptors(trace, { detailLevel: 'standard' }).map((entry) => entry.kind)).toEqual([
      'moveToken',
      'createToken',
      'varChange',
      'skipped',
    ]);

    expect(traceToDescriptors(trace, { detailLevel: 'minimal' }).map((entry) => entry.kind)).toEqual([
      'moveToken',
      'createToken',
      'skipped',
    ]);
  });

  it('is deterministic and does not mutate input', () => {
    const trace: readonly EffectTraceEntry[] = Object.freeze([
      Object.freeze({
        kind: 'moveToken' as const,
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        provenance: traceEntryProvenance('actionEffect'),
      }),
      Object.freeze({
        kind: 'forEach' as const,
        bind: '$item',
        matchCount: 1,
        iteratedCount: 1,
        provenance: traceEntryProvenance('actionEffect'),
      }),
    ]);

    const first = traceToDescriptors(trace);
    const second = traceToDescriptors(trace);

    expect(first).toEqual(second);
    expect(trace[0]).toEqual({
      kind: 'moveToken',
      tokenId: 'tok:1',
      from: 'zone:a',
      to: 'zone:b',
      provenance: traceEntryProvenance('actionEffect'),
    });
  });
});
