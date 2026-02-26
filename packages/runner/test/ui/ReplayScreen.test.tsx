// @vitest-environment jsdom

import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';

import type { ReplayStore } from '../../src/replay/replay-store.js';
import type { ReplayRuntime } from '../../src/session/replay-runtime.js';
import { ReplayScreen } from '../../src/ui/ReplayScreen.js';

const testDoubles = vi.hoisted(() => ({
  gameContainerProps: null as { readonly readOnlyMode?: boolean } | null,
}));

vi.mock('../../src/ui/GameContainer.js', () => ({
  GameContainer: (props: { readonly readOnlyMode?: boolean }) => {
    testDoubles.gameContainerProps = props;
    return createElement('div', { 'data-testid': 'game-container' });
  },
}));

vi.mock('../../src/ui/ReplayControls.js', () => ({
  ReplayControls: (props: { readonly onBackToMenu: () => void }) => (
    createElement('button', {
      type: 'button',
      'data-testid': 'replay-back-to-menu',
      onClick: props.onBackToMenu,
    }, 'back')
  ),
}));

interface ReplayStoreSpies {
  readonly stepForward: ReturnType<typeof vi.fn>;
  readonly stepBackward: ReturnType<typeof vi.fn>;
  readonly jumpToMove: ReturnType<typeof vi.fn>;
  readonly play: ReturnType<typeof vi.fn>;
  readonly pause: ReturnType<typeof vi.fn>;
}

function createReplayStoreMock(initial?: Partial<{
  currentMoveIndex: number;
  totalMoves: number;
  isPlaying: boolean;
  playbackSpeed: number;
}>): { readonly store: StoreApi<ReplayStore>; readonly spies: ReplayStoreSpies } {
  let isPlaying = initial?.isPlaying ?? false;
  const spies: ReplayStoreSpies = {
    stepForward: vi.fn(async () => undefined),
    stepBackward: vi.fn(async () => undefined),
    jumpToMove: vi.fn(async () => undefined),
    play: vi.fn(() => {
      isPlaying = true;
    }),
    pause: vi.fn(() => {
      isPlaying = false;
    }),
  };

  const store = createStore<ReplayStore>(() => ({
    currentMoveIndex: initial?.currentMoveIndex ?? -1,
    totalMoves: initial?.totalMoves ?? 3,
    get isPlaying() {
      return isPlaying;
    },
    playbackSpeed: initial?.playbackSpeed ?? 1,
    stepForward: spies.stepForward as never,
    stepBackward: spies.stepBackward as never,
    jumpToMove: spies.jumpToMove as never,
    play: spies.play as never,
    pause: spies.pause as never,
    setSpeed: vi.fn() as never,
    syncFromController: vi.fn() as never,
    destroy: vi.fn() as never,
  }));

  return { store, spies };
}

function createRuntime(replayStore: StoreApi<ReplayStore>): ReplayRuntime {
  return {
    bridgeHandle: {
      bridge: {} as never,
      terminate: vi.fn(),
    },
    store: {} as never,
    replayStore,
    visualConfigProvider: {} as never,
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ReplayScreen', () => {
  it('renders loading state before replay runtime is ready', () => {
    render(createElement(ReplayScreen, {
      runtime: null,
      onBackToMenu: vi.fn(),
    }));

    expect(screen.getByTestId('replay-screen-loading')).toBeTruthy();
  });

  it('renders game container in read-only mode and forwards back-to-menu', () => {
    const replay = createReplayStoreMock();
    const onBackToMenu = vi.fn();

    render(createElement(ReplayScreen, {
      runtime: createRuntime(replay.store),
      onBackToMenu,
    }));

    expect(screen.getByTestId('replay-screen')).toBeTruthy();
    expect(screen.getByTestId('game-container')).toBeTruthy();
    expect(testDoubles.gameContainerProps?.readOnlyMode).toBe(true);

    fireEvent.click(screen.getByTestId('replay-back-to-menu'));
    expect(onBackToMenu).toHaveBeenCalledTimes(1);
  });

  it('handles replay keyboard shortcuts and ignores editable targets', () => {
    const replay = createReplayStoreMock({ totalMoves: 5 });

    render(createElement(ReplayScreen, {
      runtime: createRuntime(replay.store),
      onBackToMenu: vi.fn(),
    }));

    fireEvent.keyDown(document, { key: 'ArrowLeft' });
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'Home' });
    fireEvent.keyDown(document, { key: 'End' });
    fireEvent.keyDown(document, { key: ' ' });
    fireEvent.keyDown(document, { key: 'Space' });

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'ArrowRight' });

    expect(replay.spies.stepBackward).toHaveBeenCalledTimes(1);
    expect(replay.spies.stepForward).toHaveBeenCalledTimes(1);
    expect(replay.spies.jumpToMove).toHaveBeenCalledWith(-1);
    expect(replay.spies.jumpToMove).toHaveBeenCalledWith(4);
    expect(replay.spies.play).toHaveBeenCalledTimes(1);
    expect(replay.spies.pause).toHaveBeenCalledTimes(1);
    expect(replay.spies.stepForward).toHaveBeenCalledTimes(1);
  });
});
