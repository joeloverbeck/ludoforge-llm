import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { TraceEvent } from '@ludoforge/engine/trace';
import { asPlayerId, asActionId } from '@ludoforge/engine/runtime';

import { createConsoleTraceSubscriber } from '../../src/trace/console-trace-subscriber.js';

describe('createConsoleTraceSubscriber', () => {
  const globalConsole = globalThis.console;
  const originalGroup = globalConsole.group;
  const originalGroupEnd = globalConsole.groupEnd;
  const originalLog = globalConsole.log;

  let groupSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;
  let groupEndSpy: ReturnType<typeof vi.fn<() => void>>;
  let logSpy: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>;

  beforeEach(() => {
    groupSpy = vi.fn<(...args: unknown[]) => void>();
    groupEndSpy = vi.fn<() => void>();
    logSpy = vi.fn<(...args: unknown[]) => void>();
    globalConsole.group = groupSpy as typeof globalConsole.group;
    globalConsole.groupEnd = groupEndSpy;
    globalConsole.log = logSpy as typeof globalConsole.log;
  });

  afterEach(() => {
    globalConsole.group = originalGroup;
    globalConsole.groupEnd = originalGroupEnd;
    globalConsole.log = originalLog;
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

  it('logs move-applied events with agent decision metadata', () => {
    const subscriber = createConsoleTraceSubscriber();
    const event: TraceEvent = {
      kind: 'move-applied',
      turnCount: 3,
      player: asPlayerId(2),
      move: { actionId: asActionId('train'), params: {} },
      deltas: [],
      triggerFirings: [],
      effectTrace: [],
      agentDecision: {
        kind: 'policy',
        agent: { kind: 'policy' },
        seatId: null,
        requestedProfileId: null,
        resolvedProfileId: 'baseline',
        profileFingerprint: null,
        initialCandidateCount: 7,
        selectedStableMoveKey: 'train|{}|false|unclassified',
        finalScore: null,
        pruningSteps: [],
        tieBreakChain: [],
        previewUsage: {
          mode: 'disabled',
          evaluatedCandidateCount: 0,
          refIds: [],
          unknownRefs: [],
          outcomeBreakdown: {
            ready: 0,
            stochastic: 0,
            unknownRandom: 0,
            unknownHidden: 0,
            unknownUnresolved: 0,
            unknownDepthCap: 0,
            unknownNoPreviewDecision: 0,
            unknownGated: 0,
            unknownFailed: 0,
          },
        },
        emergencyFallback: false,
        failure: null,
      },
    };

    subscriber(event);

    expect(groupSpy).toHaveBeenCalled();
    const headerCall = groupSpy.mock.calls[0]?.[0] as string;
    expect(headerCall).toContain('Turn 3');
    expect(headerCall).toContain('Player 2');
    expect(headerCall).toContain('train');
    expect(headerCall).toContain('policy:baseline');
  });

  it('logs move-applied events without agent decision metadata for human moves', () => {
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
    expect(headerCall).not.toContain('policy:');
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
