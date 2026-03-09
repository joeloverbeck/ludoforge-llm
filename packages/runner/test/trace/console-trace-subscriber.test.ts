import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { TraceEvent } from '@ludoforge/engine/trace';
import { asPlayerId, asActionId } from '@ludoforge/engine/runtime';

import { createConsoleTraceSubscriber } from '../../src/trace/console-trace-subscriber.js';

describe('createConsoleTraceSubscriber', () => {
  const originalGroup = console.group;
  const originalGroupEnd = console.groupEnd;
  const originalLog = console.log;

  let groupSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
  let groupEndSpy: ReturnType<typeof vi.fn<() => void>>;
  let logSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

  beforeEach(() => {
    groupSpy = vi.fn<(...args: unknown[]) => void>();
    groupEndSpy = vi.fn<() => void>();
    logSpy = vi.fn<(...args: unknown[]) => void>();
    console.group = groupSpy as typeof console.group;
    console.groupEnd = groupEndSpy;
    console.log = logSpy as typeof console.log;
  });

  afterEach(() => {
    console.group = originalGroup;
    console.groupEnd = originalGroupEnd;
    console.log = originalLog;
  });

  it('logs game-initialized events', () => {
    const subscriber = createConsoleTraceSubscriber();
    const event: TraceEvent = {
      kind: 'game-initialized',
      seed: 42,
      playerCount: 4,
      phase: 'setup',
    };

    subscriber(event);

    expect(groupSpy).toHaveBeenCalledTimes(1);
    expect(groupSpy).toHaveBeenCalledWith(expect.stringContaining('Game Initialized'));
    expect(groupSpy).toHaveBeenCalledWith(expect.stringContaining('seed=42'));
    expect(groupEndSpy).toHaveBeenCalledTimes(1);
  });

  it('logs move-applied events with AI decision', () => {
    const subscriber = createConsoleTraceSubscriber();
    const event: TraceEvent = {
      kind: 'move-applied',
      turnCount: 3,
      player: asPlayerId(2),
      move: { actionId: asActionId('train'), params: {} },
      deltas: [],
      triggerFirings: [],
      effectTrace: [],
      aiDecision: {
        seatType: 'ai-greedy',
        candidateCount: 7,
        selectedIndex: 0,
      },
    };

    subscriber(event);

    expect(groupSpy).toHaveBeenCalled();
    const headerCall = groupSpy.mock.calls[0]?.[0] as string;
    expect(headerCall).toContain('Turn 3');
    expect(headerCall).toContain('Player 2');
    expect(headerCall).toContain('train');
    expect(headerCall).toContain('ai-greedy');
  });

  it('logs move-applied events without AI decision for human moves', () => {
    const subscriber = createConsoleTraceSubscriber();
    const event: TraceEvent = {
      kind: 'move-applied',
      turnCount: 1,
      player: asPlayerId(0),
      move: { actionId: asActionId('attack'), params: {} },
      deltas: [
        { path: 'zones.saigon', before: ['troop_1'], after: ['troop_1', 'troop_2'] },
      ],
      triggerFirings: [],
      effectTrace: [],
    };

    subscriber(event);

    expect(groupSpy).toHaveBeenCalled();
    const headerCall = groupSpy.mock.calls[0]?.[0] as string;
    expect(headerCall).not.toContain('ai-');
  });

  it('logs game-terminal events', () => {
    const subscriber = createConsoleTraceSubscriber();
    const event: TraceEvent = {
      kind: 'game-terminal',
      result: { type: 'draw' },
      turnCount: 50,
    };

    subscriber(event);

    expect(groupSpy).toHaveBeenCalledTimes(1);
    expect(groupSpy).toHaveBeenCalledWith(expect.stringContaining('Game Terminal'));
    expect(groupSpy).toHaveBeenCalledWith(expect.stringContaining('draw'));
    expect(logSpy).toHaveBeenCalled();
    expect(groupEndSpy).toHaveBeenCalledTimes(1);
  });

  it('logs state change deltas when present', () => {
    const subscriber = createConsoleTraceSubscriber();
    const event: TraceEvent = {
      kind: 'move-applied',
      turnCount: 1,
      player: asPlayerId(0),
      move: { actionId: asActionId('march'), params: {} },
      deltas: [
        { path: 'zones.hanoi', before: 1, after: 3 },
        { path: 'perPlayerVars.0.resources', before: 10, after: 8 },
      ],
      triggerFirings: [],
      effectTrace: [],
    };

    subscriber(event);

    const deltaGroupCall = groupSpy.mock.calls.find(
      (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('State Changes'),
    );
    expect(deltaGroupCall).toBeDefined();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('zones.hanoi'));
  });
});
