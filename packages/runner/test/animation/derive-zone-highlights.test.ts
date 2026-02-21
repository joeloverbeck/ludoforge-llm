import { describe, expect, it } from 'vitest';

import { decorateWithZoneHighlights } from '../../src/animation/derive-zone-highlights';
import type { AnimationDescriptor } from '../../src/animation/animation-types';

describe('decorateWithZoneHighlights', () => {
  it('adds zoneHighlight descriptors for move and create/destroy kinds', () => {
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
        kind: 'createToken',
        tokenId: 'tok:2',
        type: 'unit',
        zone: 'zone:c',
        preset: 'fade-in-scale',
        isTriggered: true,
      },
      {
        kind: 'setTokenProp',
        tokenId: 'tok:1',
        prop: 'ready',
        oldValue: false,
        newValue: true,
        preset: 'tint-flash',
        isTriggered: false,
      },
    ];

    const decorated = decorateWithZoneHighlights(descriptors, {
      presetId: 'zone-pulse',
      policy: {
        enabled: true,
        includeKinds: ['moveToken', 'cardDeal', 'cardBurn', 'createToken', 'destroyToken'],
        moveEndpoints: 'both',
      },
    });

    expect(decorated.map((descriptor) => descriptor.kind)).toEqual([
      'moveToken',
      'zoneHighlight',
      'zoneHighlight',
      'createToken',
      'zoneHighlight',
      'setTokenProp',
    ]);
    expect(decorated[1]).toEqual({
      kind: 'zoneHighlight',
      zoneId: 'zone:a',
      sourceKind: 'moveToken',
      preset: 'zone-pulse',
      isTriggered: false,
    });
    expect(decorated[2]).toEqual({
      kind: 'zoneHighlight',
      zoneId: 'zone:b',
      sourceKind: 'moveToken',
      preset: 'zone-pulse',
      isTriggered: false,
    });
    expect(decorated[4]).toEqual({
      kind: 'zoneHighlight',
      zoneId: 'zone:c',
      sourceKind: 'createToken',
      preset: 'zone-pulse',
      isTriggered: true,
    });
  });

  it('respects move endpoint policy and includeKinds filtering', () => {
    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'zone:deck',
        to: 'zone:hand',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'destroyToken',
        tokenId: 'tok:2',
        type: 'unit',
        zone: 'zone:graveyard',
        preset: 'fade-out-scale',
        isTriggered: false,
      },
    ];

    const decorated = decorateWithZoneHighlights(descriptors, {
      presetId: 'zone-pulse',
      policy: {
        enabled: true,
        includeKinds: ['cardDeal'],
        moveEndpoints: 'to',
      },
    });

    expect(decorated.map((descriptor) => descriptor.kind)).toEqual([
      'cardDeal',
      'zoneHighlight',
      'destroyToken',
    ]);
    expect(decorated[1]).toEqual({
      kind: 'zoneHighlight',
      zoneId: 'zone:hand',
      sourceKind: 'cardDeal',
      preset: 'zone-pulse',
      isTriggered: false,
    });
  });

  it('returns original descriptors when disabled', () => {
    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'moveToken',
        tokenId: 'tok:1',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
    ];

    const decorated = decorateWithZoneHighlights(descriptors, {
      presetId: 'zone-pulse',
      policy: {
        enabled: false,
        includeKinds: ['moveToken'],
        moveEndpoints: 'both',
      },
    });

    expect(decorated).toBe(descriptors);
  });

  it('deduplicates zone highlights for the same zone across multiple source descriptors', () => {
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
        kind: 'moveToken',
        tokenId: 'tok:2',
        from: 'zone:a',
        to: 'zone:b',
        preset: 'arc-tween',
        isTriggered: false,
      },
      {
        kind: 'cardDeal',
        tokenId: 'tok:3',
        from: 'zone:b',
        to: 'zone:a',
        preset: 'arc-tween',
        isTriggered: false,
      },
    ];

    const decorated = decorateWithZoneHighlights(descriptors, {
      presetId: 'zone-pulse',
      policy: {
        enabled: true,
        includeKinds: ['moveToken', 'cardDeal'],
        moveEndpoints: 'both',
      },
    });

    // zone:a and zone:b should each appear only once as highlights
    const highlights = decorated.filter((d) => d.kind === 'zoneHighlight');
    expect(highlights.length).toBe(2);
    const highlightZones = highlights.map((d) => (d as { zoneId: string }).zoneId);
    expect(highlightZones).toContain('zone:a');
    expect(highlightZones).toContain('zone:b');
  });

  it('emits one highlight per distinct zone even when different source kinds reference same zones', () => {
    const descriptors: readonly AnimationDescriptor[] = [
      {
        kind: 'createToken',
        tokenId: 'tok:1',
        type: 'card',
        zone: 'zone:x',
        preset: 'fade-in-scale',
        isTriggered: false,
      },
      {
        kind: 'destroyToken',
        tokenId: 'tok:2',
        type: 'card',
        zone: 'zone:y',
        preset: 'fade-out-scale',
        isTriggered: false,
      },
      {
        kind: 'moveToken',
        tokenId: 'tok:3',
        from: 'zone:x',
        to: 'zone:y',
        preset: 'arc-tween',
        isTriggered: false,
      },
    ];

    const decorated = decorateWithZoneHighlights(descriptors, {
      presetId: 'zone-pulse',
      policy: {
        enabled: true,
        includeKinds: ['moveToken', 'createToken', 'destroyToken'],
        moveEndpoints: 'both',
      },
    });

    // zone:x from createToken, zone:y from destroyToken — moveToken should NOT add duplicates
    const highlights = decorated.filter((d) => d.kind === 'zoneHighlight');
    expect(highlights.length).toBe(2);
    const highlightZones = highlights.map((d) => (d as { zoneId: string }).zoneId);
    expect(highlightZones).toContain('zone:x');
    expect(highlightZones).toContain('zone:y');
  });
});
