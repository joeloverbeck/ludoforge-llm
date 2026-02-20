import { asPlayerId, type VariableValue } from '@ludoforge/engine/runtime';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  ANIMATION_DESCRIPTOR_KINDS,
  ANIMATION_PRESET_IDS,
  type AnimationDescriptor,
  type AnimationDetailLevel,
  type AnimationMappingOptions,
} from '../../src/animation/animation-types';

describe('animation-types', () => {
  it('exposes stable built-in preset ids', () => {
    expect(ANIMATION_PRESET_IDS).toEqual([
      'arc-tween',
      'fade-in-scale',
      'fade-out-scale',
      'tint-flash',
      'card-flip-3d',
      'counter-roll',
      'banner-slide',
      'pulse',
    ]);
  });

  it('exposes all descriptor kinds used by the animation pipeline', () => {
    expect(ANIMATION_DESCRIPTOR_KINDS).toEqual([
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
      'skipped',
    ]);
  });

  it('models descriptor variants with canonical trace-shaped fields', () => {
    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'cardDeal',
        tokenId: 'tok:deal',
        from: 'zone:deck',
        to: 'zone:hand:p1',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'cardBurn',
        tokenId: 'tok:burn',
        from: 'zone:board',
        to: 'zone:burn',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'createToken',
        tokenId: 'tok:2',
        type: 'cube',
        zone: 'zone:a',
        preset: 'fade-in-scale',
        isTriggered: false,
      },
      {
        kind: 'destroyToken',
        tokenId: 'tok:2',
        type: 'cube',
        zone: 'zone:a',
        preset: 'fade-out-scale',
        isTriggered: true,
      },
      {
        kind: 'setTokenProp',
        tokenId: 'tok:3',
        prop: 'moved',
        oldValue: false,
        newValue: true,
        preset: 'tint-flash',
        isTriggered: false,
      },
      {
        kind: 'cardFlip',
        tokenId: 'tok:3',
        prop: 'faceUp',
        oldValue: false,
        newValue: true,
        preset: 'card-flip-3d',
        isTriggered: false,
      },
      {
        kind: 'varChange',
        scope: 'perPlayer',
        varName: 'resources',
        oldValue: 1 as VariableValue,
        newValue: 2 as VariableValue,
        player: asPlayerId(0),
        preset: 'counter-roll',
        isTriggered: false,
      },
      {
        kind: 'resourceTransfer',
        from: { scope: 'global', varName: 'supply' },
        to: { scope: 'perPlayer', varName: 'resources', player: asPlayerId(1) },
        requestedAmount: 3,
        actualAmount: 2,
        sourceAvailable: 2,
        destinationHeadroom: 8,
        minAmount: 1,
        maxAmount: 3,
        preset: 'counter-roll',
        isTriggered: true,
      },
      {
        kind: 'phaseTransition',
        eventType: 'phaseEnter',
        phase: 'main',
        preset: 'banner-slide',
        isTriggered: false,
      },
      {
        kind: 'skipped',
        traceKind: 'forEach',
      },
    ];

    expect(descriptors).toHaveLength(11);
    expectTypeOf(descriptors).toMatchTypeOf<readonly AnimationDescriptor[]>();
  });

  it('provides strong option typing for mapping configuration', () => {
    const detailLevel: AnimationDetailLevel = 'standard';
    const options: AnimationMappingOptions = {
      detailLevel,
      presetOverrides: new Map([
        ['moveToken', 'arc-tween'],
        ['varChange', 'custom-counter-roll'],
        ['cardDeal', 'pulse'],
      ]),
    };

    expect(options.detailLevel).toBe('standard');
    expect(options.presetOverrides?.get('moveToken')).toBe('arc-tween');
    expect(options.presetOverrides?.get('varChange')).toBe('custom-counter-roll');
    expect(options.presetOverrides?.get('cardDeal')).toBe('pulse');
  });
});
