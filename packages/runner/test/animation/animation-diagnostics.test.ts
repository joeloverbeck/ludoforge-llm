import { asPlayerId, type EffectTraceEntry } from '@ludoforge/engine/runtime';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type {
  ArcGeometryDiagnostic,
  DiagnosticBatch,
  DiagnosticQueueEvent,
  EphemeralCreatedEntry,
  FaceControllerCallEntry,
  SpriteResolutionEntry,
  TokenVisibilityInitEntry,
  TweenLogEntry,
} from '../../src/animation/animation-diagnostics';

const provenance = {
  phase: 'main',
  eventContext: 'actionEffect' as const,
  actionId: 'test-action',
  effectPath: 'effects.0',
};

describe('animation-diagnostics types', () => {
  it('constructs strongly-typed diagnostic entries', () => {
    const spriteResolution: SpriteResolutionEntry = {
      descriptorKind: 'cardDeal',
      tokenId: 'tok:1',
      zoneId: 'zone:b',
      resolved: true,
      containerType: 'existing',
      position: { x: 10, y: 20 },
    };

    const ephemeralCreated: EphemeralCreatedEntry = {
      tokenId: 'tok:missing',
      width: 64,
      height: 96,
    };

    const tween: TweenLogEntry = {
      descriptorKind: 'cardFlip',
      tokenId: 'tok:card',
      preset: 'card-flip-3d',
      durationSeconds: 0.4,
      isTriggeredPulse: false,
      fromPosition: { x: 0, y: 0 },
      toPosition: { x: 100, y: 20 },
      faceState: { oldValue: false, newValue: true },
      tweenedProperties: ['scaleX(proxy)'],
    };

    const tweenWithoutProps: TweenLogEntry = {
      descriptorKind: 'moveToken',
      tokenId: 'tok:1',
      preset: 'arc-tween',
      durationSeconds: 0.6,
      isTriggeredPulse: false,
    };
    expect(tweenWithoutProps.tweenedProperties).toBeUndefined();

    const faceControllerCall: FaceControllerCallEntry = {
      tokenId: 'tok:card',
      faceUp: true,
      context: 'card-deal-to-shared-mid-arc',
    };

    const visibilityInit: TokenVisibilityInitEntry = {
      tokenId: 'tok:card',
      alphaSetTo: 0,
    };

    const queueEvent: DiagnosticQueueEvent = {
      event: 'enqueue',
      queueLength: 2,
      isPlaying: false,
    };

    const traceEntries: readonly EffectTraceEntry[] = [
      {
        kind: 'varChange',
        scope: 'perPlayer',
        varName: 'chips',
        oldValue: 1,
        newValue: 2,
        player: asPlayerId(0),
        provenance,
      },
    ];

    const batch: DiagnosticBatch = {
      batchId: 1,
      timestampIso: '2026-02-22T00:00:00.000Z',
      isSetup: false,
      traceEntries,
      descriptors: [
        {
          kind: 'moveToken',
          tokenId: 'tok:1',
          from: 'zone:a',
          to: 'zone:b',
          preset: 'arc-tween',
          isTriggered: false,
        },
      ],
      skippedCount: 0,
      spriteResolutions: [spriteResolution],
      ephemeralsCreated: [ephemeralCreated],
      tweens: [tween],
      faceControllerCalls: [faceControllerCall],
      tokenVisibilityInits: [visibilityInit],
      queueEvent,
      warnings: ['example warning'],
    };

    expect(batch.batchId).toBe(1);
    expect(batch.traceEntries).toHaveLength(1);
    expect(batch.descriptors).toHaveLength(1);
    expect(batch.queueEvent?.event).toBe('enqueue');
    expectTypeOf(batch).toMatchTypeOf<DiagnosticBatch>();
  });

  it('EphemeralCreatedEntry supports hasCardContent and cardTemplateName', () => {
    const entry: EphemeralCreatedEntry = {
      tokenId: 'tok:card',
      width: 24,
      height: 34,
      hasCardContent: true,
      cardTemplateName: 'rank,suit',
    };

    expect(entry.hasCardContent).toBe(true);
    expect(entry.cardTemplateName).toBe('rank,suit');

    const entryWithout: EphemeralCreatedEntry = {
      tokenId: 'tok:plain',
      width: 24,
      height: 34,
    };

    expect(entryWithout.hasCardContent).toBeUndefined();
    expect(entryWithout.cardTemplateName).toBeUndefined();
  });

  it('TweenLogEntry supports destinationOffset and arcGeometry', () => {
    const arcGeo: ArcGeometryDiagnostic = {
      midX: 150,
      midY: -40,
      liftHeight: 60,
      horizontalOffsetApplied: true,
    };

    const tween: TweenLogEntry = {
      descriptorKind: 'cardDeal',
      tokenId: 'tok:card',
      preset: 'arc-tween',
      durationSeconds: 0.4,
      isTriggeredPulse: false,
      destinationOffset: { x: -14, y: 0 },
      arcGeometry: arcGeo,
    };

    expect(tween.destinationOffset).toEqual({ x: -14, y: 0 });
    expect(tween.arcGeometry?.horizontalOffsetApplied).toBe(true);
    expect(tween.arcGeometry?.liftHeight).toBe(60);

    const tweenWithout: TweenLogEntry = {
      descriptorKind: 'moveToken',
      tokenId: 'tok:1',
      preset: 'arc-tween',
      durationSeconds: 0.4,
      isTriggeredPulse: false,
    };

    expect(tweenWithout.destinationOffset).toBeUndefined();
    expect(tweenWithout.arcGeometry).toBeUndefined();
  });
});
