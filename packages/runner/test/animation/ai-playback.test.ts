import { asPlayerId } from '@ludoforge/engine/runtime';
import { subscribeWithSelector } from 'zustand/middleware';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { describe, expect, it, vi } from 'vitest';

import { createAiPlaybackController } from '../../src/animation/ai-playback';
import type { GameStore } from '../../src/store/game-store';

interface AiPlaybackStoreState {
  readonly renderModel: GameStore['renderModel'];
  readonly gameLifecycle: GameStore['gameLifecycle'];
  readonly loading: boolean;
  readonly animationPlaying: boolean;
  readonly aiPlaybackDetailLevel: GameStore['aiPlaybackDetailLevel'];
  readonly aiPlaybackSpeed: GameStore['aiPlaybackSpeed'];
  readonly aiPlaybackAutoSkip: GameStore['aiPlaybackAutoSkip'];
  readonly aiSkipRequestToken: number;
  resolveAiStep: GameStore['resolveAiStep'];
}

function createAiStore(overrides: Partial<AiPlaybackStoreState> = {}): StoreApi<AiPlaybackStoreState> {
  const aiRenderModel = {
    players: [
      { id: asPlayerId(0), isHuman: true },
      { id: asPlayerId(1), isHuman: false },
    ],
    activePlayerID: asPlayerId(1),
  } as unknown as GameStore['renderModel'];

  return createStore<AiPlaybackStoreState>()(
    subscribeWithSelector(() => ({
      renderModel: aiRenderModel,
      gameLifecycle: 'playing',
      loading: false,
      animationPlaying: false,
      aiPlaybackDetailLevel: 'standard',
      aiPlaybackSpeed: '1x',
      aiPlaybackAutoSkip: false,
      aiSkipRequestToken: 0,
      resolveAiStep: async () => 'human-turn',
      ...overrides,
    })),
  );
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createAiPlaybackController', () => {
  it('syncs detail level to animation port on start and updates', async () => {
    const store = createAiStore();
    const animation = {
      setDetailLevel: vi.fn(),
      skipAll: vi.fn(),
    };

    const controller = createAiPlaybackController({
      store: store as unknown as StoreApi<GameStore>,
      animation,
      baseStepDelayMs: 0,
    });

    controller.start();
    expect(animation.setDetailLevel).toHaveBeenCalledWith('standard');

    store.setState({ aiPlaybackDetailLevel: 'minimal' });
    await flushAsync();

    expect(animation.setDetailLevel).toHaveBeenCalledWith('minimal');
    controller.destroy();
  });

  it('waits for animation drain before applying the next AI step', async () => {
    const store = createAiStore({ animationPlaying: true });
    let calls = 0;
    store.setState({
      resolveAiStep: async () => {
        calls += 1;
        if (calls === 1) {
          return 'advanced';
        }
        return 'human-turn';
      },
    });

    const controller = createAiPlaybackController({
      store: store as unknown as StoreApi<GameStore>,
      animation: {
        setDetailLevel: vi.fn(),
        skipAll: vi.fn(),
      },
      baseStepDelayMs: 0,
    });

    controller.start();
    await flushAsync();
    expect(calls).toBe(1);

    store.setState({ animationPlaying: false });
    await flushAsync();
    expect(calls).toBe(2);

    controller.destroy();
  });

  it('skip requests trigger animation skip and immediate AI step resolution', async () => {
    const resolveAiStep = vi.fn(async () => 'human-turn' as const);
    const store = createAiStore({
      aiPlaybackSpeed: '1x',
      resolveAiStep,
    });
    const animation = {
      setDetailLevel: vi.fn(),
      skipAll: vi.fn(),
    };

    const controller = createAiPlaybackController({
      store: store as unknown as StoreApi<GameStore>,
      animation,
      baseStepDelayMs: 500,
    });

    controller.start();
    store.setState((state) => ({ aiSkipRequestToken: state.aiSkipRequestToken + 1 }));
    await flushAsync();

    expect(animation.skipAll).toHaveBeenCalled();
    expect(resolveAiStep).toHaveBeenCalledTimes(1);

    controller.destroy();
  });
});
