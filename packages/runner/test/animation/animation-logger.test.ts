import { describe, expect, it, vi } from 'vitest';

import {
  createAnimationLogger,
  summarizeTraceEntries,
  summarizeDescriptors,
  type LoggerConsole,
} from '../../src/animation/animation-logger';

import type { DiagnosticBuffer } from '../../src/animation/diagnostic-buffer';
import type { AnimationDescriptor } from '../../src/animation/animation-types';
import type { EffectTraceEntry } from '@ludoforge/engine/runtime';

function createMockConsole(): LoggerConsole & {
  readonly groupCalls: unknown[][];
  readonly logCalls: unknown[][];
  readonly tableCalls: unknown[];
  readonly groupEndCalls: number;
} {
  const groupCalls: unknown[][] = [];
  const logCalls: unknown[][] = [];
  const tableCalls: unknown[] = [];
  let groupEndCalls = 0;

  return {
    group: vi.fn((...args: unknown[]) => { groupCalls.push(args); }),
    groupEnd: vi.fn(() => { groupEndCalls += 1; }),
    log: vi.fn((...args: unknown[]) => { logCalls.push(args); }),
    table: vi.fn((data: unknown) => { tableCalls.push(data); }),
    get groupCalls() { return groupCalls; },
    get logCalls() { return logCalls; },
    get tableCalls() { return tableCalls; },
    get groupEndCalls() { return groupEndCalls; },
  };
}

const provenance = { phase: 'main', eventContext: 'actionEffect' as const, actionId: 'test', effectPath: 'test.0' };

function createMockDiagnosticBuffer(): DiagnosticBuffer & {
  readonly beginBatchCalls: ReturnType<typeof vi.fn>;
  readonly recordTraceCalls: ReturnType<typeof vi.fn>;
  readonly recordDescriptorsCalls: ReturnType<typeof vi.fn>;
  readonly recordSpriteResolutionCalls: ReturnType<typeof vi.fn>;
  readonly recordEphemeralCreatedCalls: ReturnType<typeof vi.fn>;
  readonly recordTweenCalls: ReturnType<typeof vi.fn>;
  readonly recordFaceControllerCallCalls: ReturnType<typeof vi.fn>;
  readonly recordTokenVisibilityInitCalls: ReturnType<typeof vi.fn>;
  readonly recordQueueEventCalls: ReturnType<typeof vi.fn>;
  readonly recordWarningCalls: ReturnType<typeof vi.fn>;
  readonly endBatchCalls: ReturnType<typeof vi.fn>;
} {
  const beginBatchCalls = vi.fn();
  const recordTraceCalls = vi.fn();
  const recordDescriptorsCalls = vi.fn();
  const recordSpriteResolutionCalls = vi.fn();
  const recordEphemeralCreatedCalls = vi.fn();
  const recordTweenCalls = vi.fn();
  const recordFaceControllerCallCalls = vi.fn();
  const recordTokenVisibilityInitCalls = vi.fn();
  const recordQueueEventCalls = vi.fn();
  const recordWarningCalls = vi.fn();
  const endBatchCalls = vi.fn();

  return {
    maxBatches: 100,
    beginBatch: beginBatchCalls,
    recordTrace: recordTraceCalls,
    recordDescriptors: recordDescriptorsCalls,
    recordSpriteResolution: recordSpriteResolutionCalls,
    recordEphemeralCreated: recordEphemeralCreatedCalls,
    recordTween: recordTweenCalls,
    recordFaceControllerCall: recordFaceControllerCallCalls,
    recordTokenVisibilityInit: recordTokenVisibilityInitCalls,
    recordQueueEvent: recordQueueEventCalls,
    recordWarning: recordWarningCalls,
    endBatch: endBatchCalls,
    getBatches: vi.fn(() => []),
    downloadAsJson: vi.fn(),
    clear: vi.fn(),
    beginBatchCalls,
    recordTraceCalls,
    recordDescriptorsCalls,
    recordSpriteResolutionCalls,
    recordEphemeralCreatedCalls,
    recordTweenCalls,
    recordFaceControllerCallCalls,
    recordTokenVisibilityInitCalls,
    recordQueueEventCalls,
    recordWarningCalls,
    endBatchCalls,
  };
}

describe('AnimationLogger', () => {
  it('is disabled by default and emits no console calls', () => {
    const cons = createMockConsole();
    const logger = createAnimationLogger({ console: cons });

    expect(logger.enabled).toBe(false);

    logger.logTraceReceived({ traceLength: 2, isSetup: false, entries: [] });
    logger.logDescriptorsMapped({ inputCount: 2, outputCount: 1, skippedCount: 1, descriptors: [] });
    logger.logTimelineBuilt({ visualDescriptorCount: 1, groupCount: 1 });
    logger.logQueueEvent({ event: 'enqueue', queueLength: 1, isPlaying: false });

    expect(cons.group).not.toHaveBeenCalled();
    expect(cons.log).not.toHaveBeenCalled();
    expect(cons.table).not.toHaveBeenCalled();
  });

  it('emits structured console output when enabled', () => {
    const cons = createMockConsole();
    const logger = createAnimationLogger({ console: cons, enabled: true });

    const entries: readonly EffectTraceEntry[] = [
      { kind: 'moveToken', tokenId: 'tok1', from: 'deck:none', to: 'hand:0', provenance },
    ];

    logger.logTraceReceived({ traceLength: 1, isSetup: true, entries });

    expect(cons.group).toHaveBeenCalledTimes(1);
    expect(cons.table).toHaveBeenCalledTimes(1);
    expect(cons.groupEnd).toHaveBeenCalledTimes(1);

    const groupLabel = cons.groupCalls[0]?.[0] as string;
    expect(groupLabel).toContain('[AnimTrace]');
    expect(groupLabel).toContain('1 entries');
    expect(groupLabel).toContain('setup=true');
  });

  it('logDescriptorsMapped outputs descriptor summary', () => {
    const cons = createMockConsole();
    const logger = createAnimationLogger({ console: cons, enabled: true });

    const descriptors: readonly AnimationDescriptor[] = [
      { kind: 'moveToken', tokenId: 'tok1', from: 'a', to: 'b', preset: 'arc-tween', isTriggered: false },
      { kind: 'skipped', traceKind: 'forEach' },
    ];

    logger.logDescriptorsMapped({ inputCount: 2, outputCount: 2, skippedCount: 1, descriptors });

    expect(cons.group).toHaveBeenCalledTimes(1);
    const groupLabel = cons.groupCalls[0]?.[0] as string;
    expect(groupLabel).toContain('[AnimDesc]');
    expect(groupLabel).toContain('2 trace');
    expect(groupLabel).toContain('2 descriptors');
  });

  it('logTimelineBuilt outputs a single log line', () => {
    const cons = createMockConsole();
    const logger = createAnimationLogger({ console: cons, enabled: true });

    logger.logTimelineBuilt({ visualDescriptorCount: 3, groupCount: 2 });

    expect(cons.log).toHaveBeenCalledTimes(1);
    const logLine = cons.logCalls[0]?.[0] as string;
    expect(logLine).toContain('[AnimTimeline]');
    expect(logLine).toContain('3 visual');
  });

  it('logQueueEvent outputs queue state', () => {
    const cons = createMockConsole();
    const logger = createAnimationLogger({ console: cons, enabled: true });

    logger.logQueueEvent({ event: 'playStart', queueLength: 2, isPlaying: true });

    expect(cons.log).toHaveBeenCalledTimes(1);
    const logLine = cons.logCalls[0]?.[0] as string;
    expect(logLine).toContain('[AnimQueue]');
    expect(logLine).toContain('playStart');
  });

  it('toggle behavior: enable/disable changes output', () => {
    const cons = createMockConsole();
    const logger = createAnimationLogger({ console: cons });

    logger.logQueueEvent({ event: 'enqueue', queueLength: 1, isPlaying: false });
    expect(cons.log).not.toHaveBeenCalled();

    logger.setEnabled(true);
    expect(logger.enabled).toBe(true);

    logger.logQueueEvent({ event: 'enqueue', queueLength: 1, isPlaying: false });
    expect(cons.log).toHaveBeenCalledTimes(1);

    logger.setEnabled(false);
    logger.logQueueEvent({ event: 'enqueue', queueLength: 1, isPlaying: false });
    expect(cons.log).toHaveBeenCalledTimes(1);
  });

  it('forwards all supported entries to diagnostic buffer even when disabled', () => {
    const cons = createMockConsole();
    const diagnosticBuffer = createMockDiagnosticBuffer();
    const logger = createAnimationLogger({ console: cons, enabled: false, diagnosticBuffer });

    const entries: readonly EffectTraceEntry[] = [
      { kind: 'moveToken', tokenId: 'tok1', from: 'deck:none', to: 'hand:0', provenance },
    ];
    const descriptors: readonly AnimationDescriptor[] = [
      { kind: 'moveToken', tokenId: 'tok1', from: 'a', to: 'b', preset: 'arc-tween', isTriggered: false },
    ];

    logger.beginBatch(false);
    logger.logTraceReceived({ traceLength: 1, isSetup: false, entries });
    logger.logDescriptorsMapped({ inputCount: 1, outputCount: 1, skippedCount: 0, descriptors });
    logger.logQueueEvent({ event: 'enqueue', queueLength: 1, isPlaying: false });
    logger.logSpriteResolution({ descriptorKind: 'cardDeal', resolved: true, tokenId: 'tok1' });
    logger.logEphemeralCreated({ tokenId: 'tok2', width: 64, height: 96 });
    logger.logTweenCreated({
      descriptorKind: 'cardFlip',
      tokenId: 'tok1',
      preset: 'card-flip-3d',
      durationSeconds: 0.5,
      isTriggeredPulse: false,
    });
    logger.logFaceControllerCall({ tokenId: 'tok1', faceUp: true, context: 'test' });
    logger.logTokenVisibilityInit({ tokenId: 'tok1', alphaSetTo: 0 });
    logger.logWarning('buffer warning');
    logger.endBatch();

    expect(diagnosticBuffer.beginBatchCalls).toHaveBeenCalledWith(false);
    expect(diagnosticBuffer.recordTraceCalls).toHaveBeenCalledWith(entries);
    expect(diagnosticBuffer.recordDescriptorsCalls).toHaveBeenCalledWith(descriptors, 0);
    expect(diagnosticBuffer.recordQueueEventCalls).toHaveBeenCalledWith({ event: 'enqueue', queueLength: 1, isPlaying: false });
    expect(diagnosticBuffer.recordSpriteResolutionCalls).toHaveBeenCalledWith({ descriptorKind: 'cardDeal', resolved: true, tokenId: 'tok1' });
    expect(diagnosticBuffer.recordEphemeralCreatedCalls).toHaveBeenCalledWith({ tokenId: 'tok2', width: 64, height: 96 });
    expect(diagnosticBuffer.recordTweenCalls).toHaveBeenCalledTimes(1);
    expect(diagnosticBuffer.recordFaceControllerCallCalls).toHaveBeenCalledWith({ tokenId: 'tok1', faceUp: true, context: 'test' });
    expect(diagnosticBuffer.recordTokenVisibilityInitCalls).toHaveBeenCalledWith({ tokenId: 'tok1', alphaSetTo: 0 });
    expect(diagnosticBuffer.recordWarningCalls).toHaveBeenCalledWith('buffer warning');
    expect(diagnosticBuffer.endBatchCalls).toHaveBeenCalledTimes(1);
    expect(cons.group).not.toHaveBeenCalled();
    expect(cons.log).not.toHaveBeenCalled();
    expect(cons.table).not.toHaveBeenCalled();
  });

  it('new logger methods are safe without diagnostic buffer', () => {
    const logger = createAnimationLogger({ console: createMockConsole(), enabled: false });

    expect(() => logger.beginBatch(false)).not.toThrow();
    expect(() => logger.endBatch()).not.toThrow();
    expect(() => logger.logSpriteResolution({ descriptorKind: 'cardDeal', resolved: false, reason: 'missing' })).not.toThrow();
    expect(() => logger.logEphemeralCreated({ tokenId: 'tok1', width: 64, height: 96 })).not.toThrow();
    expect(() => logger.logTweenCreated({
      descriptorKind: 'cardFlip',
      tokenId: 'tok1',
      preset: 'card-flip-3d',
      durationSeconds: 0.5,
      isTriggeredPulse: false,
    })).not.toThrow();
    expect(() => logger.logFaceControllerCall({ tokenId: 'tok1', faceUp: true, context: 'test' })).not.toThrow();
    expect(() => logger.logTokenVisibilityInit({ tokenId: 'tok1', alphaSetTo: 0 })).not.toThrow();
    expect(() => logger.logWarning('test warning')).not.toThrow();
  });
});

describe('summarizeTraceEntries', () => {
  it('summarizes moveToken entries', () => {
    const entries: readonly EffectTraceEntry[] = [
      { kind: 'moveToken', tokenId: 'tok1', from: 'deck:none', to: 'hand:0', provenance },
    ];

    const summaries = summarizeTraceEntries(entries);
    expect(summaries).toEqual([
      { kind: 'moveToken', tokenId: 'tok1', from: 'deck:none', to: 'hand:0' },
    ]);
  });

  it('summarizes createToken and destroyToken entries', () => {
    const entries: readonly EffectTraceEntry[] = [
      { kind: 'createToken', tokenId: 'tok1', type: 'card', zone: 'deck:none', provenance },
      { kind: 'destroyToken', tokenId: 'tok2', type: 'chip', zone: 'board:none', provenance },
    ];

    const summaries = summarizeTraceEntries(entries);
    expect(summaries[0]).toEqual({ kind: 'createToken', tokenId: 'tok1', zone: 'deck:none' });
    expect(summaries[1]).toEqual({ kind: 'destroyToken', tokenId: 'tok2', zone: 'board:none' });
  });

  it('summarizes varChange entries', () => {
    const entries: readonly EffectTraceEntry[] = [
      { kind: 'varChange', scope: 'global', varName: 'score', oldValue: 0, newValue: 1, provenance },
    ];

    const summaries = summarizeTraceEntries(entries);
    expect(summaries[0]).toEqual({ kind: 'varChange', varName: 'score' });
  });

  it('summarizes forEach entries as base kind only', () => {
    const entries: readonly EffectTraceEntry[] = [
      { kind: 'forEach', bind: '$zone', matchCount: 3, iteratedCount: 3, provenance },
    ];

    const summaries = summarizeTraceEntries(entries);
    expect(summaries[0]).toEqual({ kind: 'forEach' });
  });
});

describe('summarizeDescriptors', () => {
  it('summarizes move-family descriptors', () => {
    const descriptors: readonly AnimationDescriptor[] = [
      { kind: 'cardDeal', tokenId: 'tok1', from: 'deck:none', to: 'hand:0', preset: 'arc-tween', isTriggered: false },
      { kind: 'cardBurn', tokenId: 'tok2', from: 'hand:0', to: 'burn:none', preset: 'arc-tween', isTriggered: false },
    ];

    const summaries = summarizeDescriptors(descriptors);
    expect(summaries[0]).toEqual({ kind: 'cardDeal', tokenId: 'tok1', from: 'deck:none', to: 'hand:0' });
    expect(summaries[1]).toEqual({ kind: 'cardBurn', tokenId: 'tok2', from: 'hand:0', to: 'burn:none' });
  });

  it('summarizes skipped descriptors as base kind', () => {
    const descriptors: readonly AnimationDescriptor[] = [
      { kind: 'skipped', traceKind: 'forEach' },
    ];

    const summaries = summarizeDescriptors(descriptors);
    expect(summaries[0]).toEqual({ kind: 'skipped' });
  });
});
