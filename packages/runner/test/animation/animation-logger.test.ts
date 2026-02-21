import { describe, expect, it, vi } from 'vitest';

import {
  createAnimationLogger,
  summarizeTraceEntries,
  summarizeDescriptors,
  type LoggerConsole,
} from '../../src/animation/animation-logger';

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
