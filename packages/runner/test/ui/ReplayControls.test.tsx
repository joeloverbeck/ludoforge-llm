// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ReplayStore } from '../../src/replay/replay-store.js';
import { ReplayControls } from '../../src/ui/ReplayControls.js';

interface ReplayStoreState {
  currentMoveIndex: number;
  totalMoves: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

interface ReplayStoreSpies {
  readonly stepForward: ReturnType<typeof vi.fn>;
  readonly stepBackward: ReturnType<typeof vi.fn>;
  readonly jumpToMove: ReturnType<typeof vi.fn>;
  readonly play: ReturnType<typeof vi.fn>;
  readonly pause: ReturnType<typeof vi.fn>;
  readonly setSpeed: ReturnType<typeof vi.fn>;
}

function createReplayStoreMock(initial?: Partial<ReplayStoreState>): {
  readonly store: StoreApi<ReplayStore>;
  readonly spies: ReplayStoreSpies;
} {
  const state: ReplayStoreState = {
    currentMoveIndex: -1,
    totalMoves: 12,
    isPlaying: false,
    playbackSpeed: 1,
    ...initial,
  };
  const spies: ReplayStoreSpies = {
    stepForward: vi.fn(async () => undefined),
    stepBackward: vi.fn(async () => undefined),
    jumpToMove: vi.fn(async () => undefined),
    play: vi.fn(() => {
      state.isPlaying = true;
    }),
    pause: vi.fn(() => {
      state.isPlaying = false;
    }),
    setSpeed: vi.fn((speed: number) => {
      state.playbackSpeed = speed;
    }),
  };

  const store = createStore<ReplayStore>(() => ({
    get currentMoveIndex() {
      return state.currentMoveIndex;
    },
    get totalMoves() {
      return state.totalMoves;
    },
    get isPlaying() {
      return state.isPlaying;
    },
    get playbackSpeed() {
      return state.playbackSpeed;
    },
    stepForward: spies.stepForward,
    stepBackward: spies.stepBackward,
    jumpToMove: spies.jumpToMove,
    play: spies.play,
    pause: spies.pause,
    setSpeed: spies.setSpeed,
    syncFromController: vi.fn(),
    destroy: vi.fn(),
  }));

  return {
    store,
    spies,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReplayControls', () => {
  it('renders scrubber bounds and current move counter', () => {
    const replay = createReplayStoreMock({ currentMoveIndex: 4, totalMoves: 8 });

    render(createElement(ReplayControls, {
      replayStore: replay.store,
      onBackToMenu: vi.fn(),
    }));

    const slider = screen.getByTestId('replay-scrubber');
    expect(slider.getAttribute('min')).toBe('-1');
    expect(slider.getAttribute('max')).toBe('7');
    expect(slider.getAttribute('value')).toBe('4');
    expect(screen.getByTestId('replay-move-counter').textContent).toBe('Move 5 / 8');
  });

  it('renders initial-state counter at replay index -1', () => {
    const replay = createReplayStoreMock({ currentMoveIndex: -1, totalMoves: 4 });

    render(createElement(ReplayControls, {
      replayStore: replay.store,
      onBackToMenu: vi.fn(),
    }));

    expect(screen.getByTestId('replay-move-counter').textContent).toBe('Initial State');
  });

  it('wires controls to replay store actions', () => {
    const replay = createReplayStoreMock({ currentMoveIndex: 2, totalMoves: 6 });
    const onBackToMenu = vi.fn();

    render(createElement(ReplayControls, {
      replayStore: replay.store,
      onBackToMenu,
    }));

    fireEvent.change(screen.getByTestId('replay-scrubber'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('replay-step-backward'));
    fireEvent.click(screen.getByTestId('replay-step-forward'));
    fireEvent.click(screen.getByTestId('replay-play-pause'));
    fireEvent.click(screen.getByTestId('replay-jump-start'));
    fireEvent.click(screen.getByTestId('replay-jump-end'));
    fireEvent.click(screen.getByTestId('replay-speed-2'));
    fireEvent.click(screen.getByTestId('replay-back-to-menu'));

    expect(replay.spies.jumpToMove).toHaveBeenCalledWith(5);
    expect(replay.spies.stepBackward).toHaveBeenCalledTimes(1);
    expect(replay.spies.stepForward).toHaveBeenCalledTimes(1);
    expect(replay.spies.play).toHaveBeenCalledTimes(1);
    expect(replay.spies.jumpToMove).toHaveBeenCalledWith(-1);
    expect(replay.spies.jumpToMove).toHaveBeenCalledWith(5);
    expect(replay.spies.setSpeed).toHaveBeenCalledWith(2);
    expect(onBackToMenu).toHaveBeenCalledTimes(1);
  });
});
