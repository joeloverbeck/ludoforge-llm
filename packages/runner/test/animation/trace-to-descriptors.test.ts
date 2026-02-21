import { asPlayerId, type EffectTraceEntry } from '@ludoforge/engine/runtime';
import { describe, expect, it } from 'vitest';

import { createPresetRegistry, type PresetTweenFactory } from '../../src/animation/preset-registry';
import { traceToDescriptors } from '../../src/animation/trace-to-descriptors';

function traceEntryProvenance(eventContext: EffectTraceEntry['provenance']['eventContext']) {
  return {
    phase: 'main',
    eventContext,
    effectPath: 'effects.0',
  } as const;
}

const CARD_CONTEXT = {
  cardTokenTypeIds: new Set(['card']),
  tokenTypeByTokenId: new Map([
    ['tok:card', 'card'],
    ['tok:chip', 'chip'],
  ]),
  zoneRoles: {
    draw: new Set(['zone:deck']),
    hand: new Set(['zone:hand:p1']),
    shared: new Set(['zone:board']),
    burn: new Set(['zone:burn']),
    discard: new Set(['zone:discard']),
  },
} as const;

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
      {
        kind: 'reveal',
        zone: 'zone:secret',
        observers: [asPlayerId(1)],
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'conceal',
        zone: 'zone:secret',
        from: [asPlayerId(1)],
        grantsRemoved: 1,
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
        preset: 'counter-tick',
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
        preset: 'counter-tick',
        isTriggered: false,
      },
      {
        kind: 'phaseTransition',
        eventType: 'phaseEnter',
        phase: 'cleanup',
        preset: 'banner-overlay',
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
      {
        kind: 'skipped',
        traceKind: 'reveal',
      },
      {
        kind: 'skipped',
        traceKind: 'conceal',
      },
    ]);
  });

  it('applies preset overrides by descriptor kind', () => {
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
          ['phaseTransition', 'pulse'],
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

  it('classifies card semantic descriptors when context is available', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:card',
        from: 'zone:deck',
        to: 'zone:hand:p1',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:card',
        from: 'zone:board',
        to: 'zone:burn',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'setTokenProp',
        tokenId: 'tok:card',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(traceToDescriptors(trace, { cardContext: CARD_CONTEXT })).toEqual([
      {
        kind: 'cardDeal',
        tokenId: 'tok:card',
        from: 'zone:deck',
        to: 'zone:hand:p1',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'cardBurn',
        tokenId: 'tok:card',
        from: 'zone:board',
        to: 'zone:burn',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'cardFlip',
        tokenId: 'tok:card',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'card-flip-3d',
        isTriggered: false,
      },
    ]);
  });

  it('falls back to generic descriptor kinds when card context is absent or ambiguous', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:card',
        from: 'zone:deck',
        to: 'zone:hand:p1',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'setTokenProp',
        tokenId: 'tok:card',
        prop: 'faceUp',
        oldValue: true,
        newValue: true,
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(traceToDescriptors(trace).map((descriptor) => descriptor.kind)).toEqual([
      'moveToken',
      'setTokenProp',
    ]);
    expect(traceToDescriptors(trace, { cardContext: CARD_CONTEXT }).map((descriptor) => descriptor.kind)).toEqual([
      'cardDeal',
      'setTokenProp',
    ]);
  });

  it('supports semantic descriptor-specific preset overrides', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:card',
        from: 'zone:deck',
        to: 'zone:hand:p1',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:card',
        from: 'zone:board',
        to: 'zone:burn',
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(
      traceToDescriptors(trace, {
        cardContext: CARD_CONTEXT,
        presetOverrides: new Map([
          ['cardDeal', 'pulse'],
          ['cardBurn', 'arc-tween'],
        ]),
      }),
    ).toEqual([
      {
        kind: 'cardDeal',
        tokenId: 'tok:card',
        from: 'zone:deck',
        to: 'zone:hand:p1',
        preset: 'pulse',
        isTriggered: false,
      },
      {
        kind: 'cardBurn',
        tokenId: 'tok:card',
        from: 'zone:board',
        to: 'zone:burn',
        preset: 'arc-tween',
        isTriggered: false,
      },
    ]);
  });

  it('rejects incompatible preset overrides', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(
      () =>
        traceToDescriptors(trace, {
          presetOverrides: new Map([['moveToken', 'fade-in-scale']]),
        }),
    ).toThrow(/not compatible/u);
  });

  it('supports custom preset overrides when provided registry includes compatible preset', () => {
    const noopFactory: PresetTweenFactory = () => {
      // noop
    };
    const customRegistry = createPresetRegistry().register({
      id: 'custom-move-tween',
      defaultDurationSeconds: 0.2,
      compatibleKinds: ['moveToken'],
      createTween: noopFactory,
    });

    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(
      traceToDescriptors(
        trace,
        {
          presetOverrides: new Map([['moveToken', 'custom-move-tween']]),
        },
        customRegistry,
      ),
    ).toEqual([
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'custom-move-tween',
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
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'bank' },
        to: { scope: 'perPlayer', varName: 'coins', player: asPlayerId(1) },
        requestedAmount: 5,
        actualAmount: 5,
        sourceAvailable: 100,
        destinationHeadroom: 95,
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
      'phaseTransition',
      'skipped',
    ]);

    expect(traceToDescriptors(trace, { detailLevel: 'minimal' }).map((entry) => entry.kind)).toEqual([
      'moveToken',
      'createToken',
      'phaseTransition',
      'skipped',
    ]);
  });

  it('includes card deal/burn semantics in minimal detail level output', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:card',
        from: 'zone:deck',
        to: 'zone:hand:p1',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:card',
        from: 'zone:board',
        to: 'zone:burn',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'setTokenProp',
        tokenId: 'tok:card',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(
      traceToDescriptors(trace, {
        detailLevel: 'minimal',
        cardContext: CARD_CONTEXT,
      }).map((descriptor) => descriptor.kind),
    ).toEqual(['cardDeal', 'cardBurn']);
  });

  it('suppresses createToken descriptors when suppressCreateToken is true', () => {
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
        kind: 'createToken',
        tokenId: 'tok:3',
        type: 'card',
        zone: 'zone:a',
        provenance: traceEntryProvenance('actionEffect'),
      },
      {
        kind: 'destroyToken',
        tokenId: 'tok:4',
        type: 'cube',
        zone: 'zone:b',
        provenance: traceEntryProvenance('triggerEffect'),
      },
    ];

    const result = traceToDescriptors(trace, { suppressCreateToken: true });

    expect(result.map((d) => d.kind)).toEqual([
      'moveToken',
      'skipped',
      'skipped',
      'destroyToken',
    ]);

    const skipped = result.filter((d) => d.kind === 'skipped');
    for (const s of skipped) {
      if (s.kind === 'skipped') {
        expect(s.traceKind).toBe('createToken');
      }
    }
  });

  it('does not suppress createToken when suppressCreateToken is false or absent', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'createToken',
        tokenId: 'tok:1',
        type: 'cube',
        zone: 'zone:a',
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    expect(traceToDescriptors(trace).map((d) => d.kind)).toEqual(['createToken']);
    expect(traceToDescriptors(trace, { suppressCreateToken: false }).map((d) => d.kind)).toEqual(['createToken']);
  });

  it('filters phase transitions to configured phaseBannerPhases', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'flop',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'hand-setup',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'river',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
    ];

    const result = traceToDescriptors(trace, {
      phaseBannerPhases: new Set(['flop', 'river']),
    });

    expect(result.map((d) => d.kind)).toEqual(['phaseTransition', 'phaseTransition']);
    const phaseDescriptors = result.filter((d) => d.kind === 'phaseTransition');
    expect(phaseDescriptors).toEqual([
      expect.objectContaining({ kind: 'phaseTransition', phase: 'flop' }),
      expect.objectContaining({ kind: 'phaseTransition', phase: 'river' }),
    ]);
  });

  it('emits all phase transitions when phaseBannerPhases is undefined', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'flop',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'hand-setup',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
    ];

    const result = traceToDescriptors(trace);
    expect(result.map((d) => d.kind)).toEqual(['phaseTransition', 'phaseTransition']);
  });

  it('phaseTransition always passes detail filter at standard and minimal levels', () => {
    const trace: readonly EffectTraceEntry[] = [
      {
        kind: 'lifecycleEvent',
        eventType: 'phaseEnter',
        phase: 'flop',
        provenance: traceEntryProvenance('lifecycleEvent'),
      },
      {
        kind: 'varChange',
        scope: 'global',
        varName: 'pot',
        oldValue: 0,
        newValue: 100,
        provenance: traceEntryProvenance('actionEffect'),
      },
    ];

    // phaseTransition should appear at all detail levels; varChange should be filtered at standard/minimal
    expect(traceToDescriptors(trace, { detailLevel: 'full' }).map((d) => d.kind)).toEqual([
      'phaseTransition',
      'varChange',
    ]);
    expect(traceToDescriptors(trace, { detailLevel: 'standard' }).map((d) => d.kind)).toEqual([
      'phaseTransition',
    ]);
    expect(traceToDescriptors(trace, { detailLevel: 'minimal' }).map((d) => d.kind)).toEqual([
      'phaseTransition',
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
