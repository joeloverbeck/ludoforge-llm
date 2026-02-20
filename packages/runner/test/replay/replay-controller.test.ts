import { asActionId, type Move } from '@ludoforge/engine/runtime';
import { describe, expect, it, vi } from 'vitest';

import type { GameBridge } from '../../src/bridge/game-bridge.js';
import { createReplayController } from '../../src/replay/replay-controller.js';

interface BridgeMock {
  readonly bridge: GameBridge;
  readonly init: ReturnType<typeof vi.fn>;
  readonly applyMove: ReturnType<typeof vi.fn>;
  readonly playSequence: ReturnType<typeof vi.fn>;
}

const TEST_GAME_DEF = {
  metadata: { id: 'test-game' },
} as unknown;

function makeMove(index: number): Move {
  return {
    actionId: asActionId(`move-${String(index)}`),
    params: { index },
  };
}

function createBridgeMock(): BridgeMock {
  const init = vi.fn(async () => ({}) as unknown);
  const applyMove = vi.fn(async () => ({ state: {} }) as unknown);
  const playSequence = vi.fn(async () => [] as unknown);

  const bridge = {
    init,
    applyMove,
    playSequence,
  } as unknown as GameBridge;

  return {
    bridge,
    init,
    applyMove,
    playSequence,
  };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createReplayController', () => {
  it('initializes with default replay state', () => {
    const bridgeMock = createBridgeMock();
    const moves = [makeMove(0), makeMove(1)];
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      moves,
      () => undefined,
    );

    expect(controller.totalMoves).toBe(2);
    expect(controller.currentMoveIndex).toBe(-1);
    expect(controller.isPlaying).toBe(false);
    expect(controller.playbackSpeed).toBe(1);
  });

  it('steps forward with trace enabled and advances the index', async () => {
    const bridgeMock = createBridgeMock();
    const onStateChange = vi.fn();
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      [makeMove(0), makeMove(1)],
      onStateChange,
    );

    await controller.stepForward();

    expect(controller.currentMoveIndex).toBe(0);
    expect(bridgeMock.applyMove).toHaveBeenCalledTimes(1);
    expect(bridgeMock.applyMove.mock.calls[0]?.[1]).toEqual({ trace: true });
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when stepping forward at the end', async () => {
    const bridgeMock = createBridgeMock();
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      [makeMove(0)],
      () => undefined,
    );

    await controller.stepForward();
    bridgeMock.applyMove.mockClear();

    await controller.stepForward();

    expect(controller.currentMoveIndex).toBe(0);
    expect(bridgeMock.applyMove).not.toHaveBeenCalled();
  });

  it('steps backward by deterministic reset and trace-disabled prefix replay', async () => {
    const bridgeMock = createBridgeMock();
    const moves = [makeMove(0), makeMove(1), makeMove(2)];
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      moves,
      () => undefined,
    );

    await controller.jumpToMove(2);
    bridgeMock.init.mockClear();
    bridgeMock.applyMove.mockClear();
    bridgeMock.playSequence.mockClear();

    await controller.stepBackward();

    expect(controller.currentMoveIndex).toBe(1);
    expect(bridgeMock.init).toHaveBeenCalledTimes(1);
    expect(bridgeMock.init.mock.calls[0]?.[2]).toEqual({ enableTrace: false });
    expect(bridgeMock.playSequence).toHaveBeenCalledTimes(1);
    expect(bridgeMock.playSequence.mock.calls[0]?.[1]).toEqual({ trace: false });
    expect(bridgeMock.applyMove).not.toHaveBeenCalled();
  });

  it('is a no-op when stepping backward from the initial state', async () => {
    const bridgeMock = createBridgeMock();
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      [makeMove(0)],
      () => undefined,
    );

    await controller.stepBackward();

    expect(controller.currentMoveIndex).toBe(-1);
    expect(bridgeMock.init).not.toHaveBeenCalled();
    expect(bridgeMock.applyMove).not.toHaveBeenCalled();
    expect(bridgeMock.playSequence).not.toHaveBeenCalled();
  });

  it('jumps to a move using trace-disabled prefix and trace-enabled landing move', async () => {
    const bridgeMock = createBridgeMock();
    const moves = [makeMove(0), makeMove(1), makeMove(2), makeMove(3), makeMove(4), makeMove(5)];
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      moves,
      () => undefined,
    );

    await controller.jumpToMove(5);

    expect(controller.currentMoveIndex).toBe(5);
    expect(bridgeMock.init).toHaveBeenCalledTimes(1);
    expect(bridgeMock.playSequence).toHaveBeenCalledTimes(1);
    expect(bridgeMock.playSequence.mock.calls[0]?.[0]).toHaveLength(5);
    expect(bridgeMock.playSequence.mock.calls[0]?.[1]).toEqual({ trace: false });
    expect(bridgeMock.applyMove).toHaveBeenCalledTimes(1);
    expect(bridgeMock.applyMove.mock.calls[0]?.[1]).toEqual({ trace: true });
  });

  it('supports jumpToMove(0) and jumpToMove(-1)', async () => {
    const bridgeMock = createBridgeMock();
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      [makeMove(0), makeMove(1)],
      () => undefined,
    );

    await controller.jumpToMove(0);
    expect(controller.currentMoveIndex).toBe(0);
    expect(bridgeMock.applyMove).toHaveBeenCalledTimes(1);
    expect(bridgeMock.applyMove.mock.calls[0]?.[1]).toEqual({ trace: true });

    bridgeMock.init.mockClear();
    bridgeMock.applyMove.mockClear();
    bridgeMock.playSequence.mockClear();

    await controller.jumpToMove(-1);
    expect(controller.currentMoveIndex).toBe(-1);
    expect(bridgeMock.init).toHaveBeenCalledTimes(1);
    expect(bridgeMock.applyMove).not.toHaveBeenCalled();
    expect(bridgeMock.playSequence).not.toHaveBeenCalled();
  });

  it('validates jump bounds and playback speed values', async () => {
    const bridgeMock = createBridgeMock();
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      [makeMove(0)],
      () => undefined,
    );

    await expect(controller.jumpToMove(2)).rejects.toThrow(/out of range/u);
    await expect(controller.jumpToMove(0.25)).rejects.toThrow(/must be an integer/u);
    expect(() => controller.setSpeed(3)).toThrow(/Invalid replay playback speed/u);
  });

  it('auto-advances in play mode, supports speed changes, pauses, and stops at end', async () => {
    vi.useFakeTimers();
    const bridgeMock = createBridgeMock();
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      [makeMove(0), makeMove(1)],
      () => undefined,
    );

    controller.setSpeed(2);
    controller.play();
    expect(controller.isPlaying).toBe(true);

    await vi.advanceTimersByTimeAsync(499);
    await flushAsync();
    expect(controller.currentMoveIndex).toBe(-1);

    await vi.advanceTimersByTimeAsync(1);
    await flushAsync();
    expect(controller.currentMoveIndex).toBe(0);

    controller.pause();
    expect(controller.isPlaying).toBe(false);
    const callsAfterPause = bridgeMock.applyMove.mock.calls.length;

    await vi.advanceTimersByTimeAsync(1000);
    await flushAsync();
    expect(bridgeMock.applyMove.mock.calls.length).toBe(callsAfterPause);

    controller.play();
    await vi.advanceTimersByTimeAsync(500);
    await flushAsync();

    expect(controller.currentMoveIndex).toBe(1);
    expect(controller.isPlaying).toBe(false);

    vi.useRealTimers();
  });

  it('clears pending playback timers on destroy', async () => {
    vi.useFakeTimers();
    const bridgeMock = createBridgeMock();
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      [makeMove(0), makeMove(1)],
      () => undefined,
    );

    controller.play();
    controller.destroy();

    await vi.advanceTimersByTimeAsync(5000);
    await flushAsync();

    expect(controller.isPlaying).toBe(false);
    expect(controller.currentMoveIndex).toBe(-1);
    expect(bridgeMock.applyMove).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('uses monotonic operation stamps across bridge mutations', async () => {
    const bridgeMock = createBridgeMock();
    const controller = createReplayController(
      bridgeMock.bridge,
      TEST_GAME_DEF as never,
      123,
      [makeMove(0), makeMove(1)],
      () => undefined,
    );

    await controller.jumpToMove(1);

    const initStamp = bridgeMock.init.mock.calls[0]?.[3] as { epoch: number; token: number };
    const playSequenceStamp = bridgeMock.playSequence.mock.calls[0]?.[2] as { epoch: number; token: number };
    const applyStamp = bridgeMock.applyMove.mock.calls[0]?.[2] as { epoch: number; token: number };

    expect(initStamp.epoch).toBe(1);
    expect(playSequenceStamp.epoch).toBe(1);
    expect(applyStamp.epoch).toBe(1);
    expect(initStamp.token).toBe(1);
    expect(playSequenceStamp.token).toBe(2);
    expect(applyStamp.token).toBe(3);
  });
});
