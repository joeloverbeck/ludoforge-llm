import { asPlayerId, type EffectTraceEntry } from '@ludoforge/engine/runtime';
import { describe, expect, it, vi } from 'vitest';

import {
  createDiagnosticBuffer,
  type DiagnosticBufferRuntime,
} from '../../src/animation/diagnostic-buffer';
import type { AnimationDescriptor } from '../../src/animation';

const provenance = {
  phase: 'main',
  eventContext: 'actionEffect' as const,
  actionId: 'diagnostic-buffer-test',
  effectPath: 'effects.0',
};

function createEntries(): {
  readonly traceEntries: readonly EffectTraceEntry[];
  readonly descriptors: readonly AnimationDescriptor[];
} {
  return {
    traceEntries: [
      {
        kind: 'varChange',
        scope: 'perPlayer',
        varName: 'chips',
        oldValue: 1,
        newValue: 2,
        player: asPlayerId(0),
        provenance,
      },
    ],
    descriptors: [
      {
        kind: 'cardDeal',
        tokenId: 'tok:1',
        from: 'deck:none',
        to: 'hand:0',
        preset: 'arc-tween',
        isTriggered: false,
      },
    ],
  };
}

describe('createDiagnosticBuffer', () => {
  it('records a full batch lifecycle with stage data', () => {
    const buffer = createDiagnosticBuffer();
    const { traceEntries, descriptors } = createEntries();

    buffer.beginBatch(false);
    buffer.recordTrace(traceEntries);
    buffer.recordDescriptors(descriptors, 1);
    buffer.recordSpriteResolution({
      descriptorKind: 'cardDeal',
      tokenId: 'tok:1',
      zoneId: 'hand:0',
      resolved: true,
      containerType: 'existing',
      position: { x: 10, y: 20 },
    });
    buffer.recordEphemeralCreated({ tokenId: 'tok:missing', width: 64, height: 96 });
    buffer.recordTween({
      descriptorKind: 'cardFlip',
      tokenId: 'tok:1',
      preset: 'card-flip-3d',
      durationSeconds: 0.5,
      isTriggeredPulse: false,
      fromPosition: { x: 0, y: 0 },
      toPosition: { x: 12, y: 16 },
      faceState: { oldValue: false, newValue: true },
    });
    buffer.recordFaceControllerCall({ tokenId: 'tok:1', faceUp: true, context: 'test' });
    buffer.recordTokenVisibilityInit({ tokenId: 'tok:1', alphaSetTo: 0 });
    buffer.recordQueueEvent({ event: 'enqueue', queueLength: 1, isPlaying: false });
    buffer.recordWarning('example warning');
    buffer.endBatch();

    const batches = buffer.getBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      batchId: 1,
      isSetup: false,
      skippedCount: 1,
      warnings: ['example warning'],
      queueEvent: { event: 'enqueue', queueLength: 1, isPlaying: false },
    });
    expect(batches[0]?.traceEntries).toEqual(traceEntries);
    expect(batches[0]?.descriptors).toEqual(descriptors);
    expect(batches[0]?.spriteResolutions).toHaveLength(1);
    expect(batches[0]?.ephemeralsCreated).toHaveLength(1);
    expect(batches[0]?.tweens).toHaveLength(1);
    expect(batches[0]?.faceControllerCalls).toHaveLength(1);
    expect(batches[0]?.tokenVisibilityInits).toHaveLength(1);
  });

  it('enforces maxBatches ring buffer eviction', () => {
    const buffer = createDiagnosticBuffer(2);

    buffer.beginBatch(false);
    buffer.endBatch();
    buffer.beginBatch(false);
    buffer.endBatch();
    buffer.beginBatch(false);
    buffer.endBatch();

    const batches = buffer.getBatches();
    expect(batches).toHaveLength(2);
    expect(batches.map((batch) => batch.batchId)).toEqual([2, 3]);
  });

  it('clears batches and open accumulator state', () => {
    const buffer = createDiagnosticBuffer();

    buffer.beginBatch(false);
    buffer.recordWarning('pending');
    buffer.clear();

    expect(buffer.getBatches()).toEqual([]);

    buffer.endBatch();
    expect(buffer.getBatches()).toEqual([]);
  });

  it('creates an empty batch when begin/end have no record calls', () => {
    const buffer = createDiagnosticBuffer();

    buffer.beginBatch(true);
    buffer.endBatch();

    const batches = buffer.getBatches();
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      batchId: 1,
      isSetup: true,
      skippedCount: 0,
      traceEntries: [],
      descriptors: [],
      spriteResolutions: [],
      ephemeralsCreated: [],
      tweens: [],
      faceControllerCalls: [],
      tokenVisibilityInits: [],
      warnings: [],
    });
  });

  it('auto-finalizes an open batch when beginBatch is called again', () => {
    const buffer = createDiagnosticBuffer();

    buffer.beginBatch(false);
    buffer.recordWarning('first');
    buffer.beginBatch(true);
    buffer.recordWarning('second');
    buffer.endBatch();

    const batches = buffer.getBatches();
    expect(batches).toHaveLength(2);
    expect(batches[0]?.warnings).toEqual(['first']);
    expect(batches[1]).toMatchObject({ isSetup: true, warnings: ['second'] });
  });

  it('uses monotonically increasing batchId values', () => {
    const buffer = createDiagnosticBuffer();

    for (let i = 0; i < 4; i += 1) {
      buffer.beginBatch(false);
      buffer.endBatch();
    }

    expect(buffer.getBatches().map((batch) => batch.batchId)).toEqual([1, 2, 3, 4]);
  });

  it('returns immutable snapshots that do not mutate internal state', () => {
    const buffer = createDiagnosticBuffer();

    buffer.beginBatch(false);
    buffer.recordWarning('immutable');
    buffer.endBatch();

    const batches = buffer.getBatches();
    expect(Object.isFrozen(batches)).toBe(true);
    expect(Object.isFrozen(batches[0] ?? null)).toBe(true);

    const mutableTraceEntries: EffectTraceEntry[] = [
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
    buffer.beginBatch(false);
    buffer.recordTrace(mutableTraceEntries);
    buffer.endBatch();

    ((mutableTraceEntries[0] as unknown) as Record<string, unknown>).oldValue = 99;
    ((mutableTraceEntries[0] as unknown) as Record<string, unknown>).newValue = 100;

    expect(buffer.getBatches()[1]?.traceEntries[0]).toMatchObject({ oldValue: 1, newValue: 2 });
  });

  it('serializes valid json payload and invokes runtime download', () => {
    const downloadJson = vi.fn();
    const runtime: DiagnosticBufferRuntime = { downloadJson };
    const buffer = createDiagnosticBuffer(100, runtime);

    buffer.beginBatch(false);
    buffer.recordWarning('download-test');
    buffer.endBatch();

    buffer.downloadAsJson();

    expect(downloadJson).toHaveBeenCalledTimes(1);
    const payload = downloadJson.mock.calls[0]?.[0];
    expect(payload?.mimeType).toBe('application/json');
    expect(payload?.filename).toMatch(/^anim-diagnostic-.*\.json$/);

    const parsed = JSON.parse(payload?.content ?? '{}');
    expect(parsed.meta.batchCount).toBe(1);
    expect(parsed.meta.oldestBatchId).toBe(1);
    expect(parsed.meta.newestBatchId).toBe(1);
    expect(parsed.batches).toHaveLength(1);
    expect(parsed.batches[0].warnings).toEqual(['download-test']);
  });

  it('is safe to call downloadAsJson without browser globals', () => {
    const buffer = createDiagnosticBuffer();

    expect(() => buffer.downloadAsJson()).not.toThrow();
  });

  it('rejects non-positive maxBatches', () => {
    expect(() => createDiagnosticBuffer(0)).toThrow(RangeError);
    expect(() => createDiagnosticBuffer(-1)).toThrow(RangeError);
    expect(() => createDiagnosticBuffer(1.5)).toThrow(RangeError);
  });
});
