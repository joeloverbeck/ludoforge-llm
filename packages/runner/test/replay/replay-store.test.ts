import { describe, expect, it, vi } from 'vitest';
import type { EffectTraceEntry, TriggerLogEntry } from '@ludoforge/engine/runtime';

import { createReplayStore } from '../../src/replay/replay-store.js';
import type { ReplayController } from '../../src/replay/replay-controller.js';

interface MutableReplayControllerState {
  currentMoveIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
  totalMoves: number;
  lastEffectTrace: readonly EffectTraceEntry[];
  lastTriggerFirings: readonly TriggerLogEntry[];
}

function createControllerMock(initial?: Partial<MutableReplayControllerState>): ReplayController {
  const state: MutableReplayControllerState = {
    currentMoveIndex: -1,
    isPlaying: false,
    playbackSpeed: 1,
    totalMoves: 6,
    lastEffectTrace: [],
    lastTriggerFirings: [],
    ...initial,
  };

  return {
    get totalMoves() {
      return state.totalMoves;
    },
    get currentMoveIndex() {
      return state.currentMoveIndex;
    },
    get isPlaying() {
      return state.isPlaying;
    },
    get playbackSpeed() {
      return state.playbackSpeed;
    },
    get lastEffectTrace() {
      return state.lastEffectTrace;
    },
    get lastTriggerFirings() {
      return state.lastTriggerFirings;
    },
    stepForward: vi.fn(async () => {
      state.currentMoveIndex += 1;
    }),
    stepBackward: vi.fn(async () => {
      state.currentMoveIndex -= 1;
    }),
    jumpToMove: vi.fn(async (index: number) => {
      state.currentMoveIndex = index;
    }),
    play: vi.fn(() => {
      state.isPlaying = true;
    }),
    pause: vi.fn(() => {
      state.isPlaying = false;
    }),
    setSpeed: vi.fn((speed: number) => {
      state.playbackSpeed = speed;
    }),
    destroy: vi.fn(() => {
      state.isPlaying = false;
    }),
  };
}

describe('createReplayStore', () => {
  it('initializes from controller state snapshot', () => {
    const controller = createControllerMock({ currentMoveIndex: 2, isPlaying: true, playbackSpeed: 4, totalMoves: 12 });
    const store = createReplayStore(controller);

    expect(store.getState().currentMoveIndex).toBe(2);
    expect(store.getState().isPlaying).toBe(true);
    expect(store.getState().playbackSpeed).toBe(4);
    expect(store.getState().totalMoves).toBe(12);
  });

  it('delegates stepping and jump actions to controller and resyncs state', async () => {
    const controller = createControllerMock();
    const store = createReplayStore(controller);

    await store.getState().stepForward();
    expect(controller.stepForward).toHaveBeenCalledTimes(1);
    expect(store.getState().currentMoveIndex).toBe(0);

    await store.getState().jumpToMove(4);
    expect(controller.jumpToMove).toHaveBeenCalledWith(4);
    expect(store.getState().currentMoveIndex).toBe(4);

    await store.getState().stepBackward();
    expect(controller.stepBackward).toHaveBeenCalledTimes(1);
    expect(store.getState().currentMoveIndex).toBe(3);
  });

  it('delegates playback controls and keeps store state aligned', () => {
    const controller = createControllerMock();
    const store = createReplayStore(controller);

    store.getState().play();
    expect(controller.play).toHaveBeenCalledTimes(1);
    expect(store.getState().isPlaying).toBe(true);

    store.getState().setSpeed(2);
    expect(controller.setSpeed).toHaveBeenCalledWith(2);
    expect(store.getState().playbackSpeed).toBe(2);

    store.getState().pause();
    expect(controller.pause).toHaveBeenCalledTimes(1);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('supports explicit sync and destroy', () => {
    const controller = createControllerMock();
    const store = createReplayStore(controller);

    (controller.setSpeed as (speed: number) => void)(4);
    store.getState().syncFromController();
    expect(store.getState().playbackSpeed).toBe(4);

    (controller.play as () => void)();
    store.getState().syncFromController();
    expect(store.getState().isPlaying).toBe(true);

    store.getState().destroy();
    expect(controller.destroy).toHaveBeenCalledTimes(1);
    expect(store.getState().isPlaying).toBe(false);
  });
});
