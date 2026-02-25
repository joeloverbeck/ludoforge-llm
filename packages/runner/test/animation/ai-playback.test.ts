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

  it('recovers from permanently stuck animationPlaying via drain timeout', async () => {
    // animationPlaying stays true forever — simulating the race condition
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

    const animation = {
      setDetailLevel: vi.fn(),
      skipAll: vi.fn(),
    };

    const controller = createAiPlaybackController({
      store: store as unknown as StoreApi<GameStore>,
      animation,
      baseStepDelayMs: 0,
      drainTimeoutMs: 50,
    });

    controller.start();
    // First resolveAiStep returns 'advanced', then waits for drain which never comes
    await flushAsync();
    expect(calls).toBe(1);

    // Wait for drain timeout to fire
    await new Promise((resolve) => setTimeout(resolve, 80));
    await flushAsync();

    expect(animation.skipAll).toHaveBeenCalled();
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

  for (const errorCase of [
    { outcome: 'no-legal-moves' as const, expectedMessage: 'no legal moves' },
    { outcome: 'uncompletable-template' as const, expectedMessage: 'could not be completed' },
    { outcome: 'illegal-template' as const, expectedMessage: 'failed legality validation' },
  ]) {
    it(`calls onError when resolveAiStep returns ${errorCase.outcome}`, async () => {
      const store = createAiStore({
        resolveAiStep: async () => errorCase.outcome,
      });
      const onError = vi.fn();

      const controller = createAiPlaybackController({
        store: store as unknown as StoreApi<GameStore>,
        animation: { setDetailLevel: vi.fn(), skipAll: vi.fn() },
        baseStepDelayMs: 0,
        onError,
      });

      controller.start();
      await flushAsync();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining(errorCase.expectedMessage));

      controller.destroy();
    });
  }

  it('retries on no-op then calls onError after max retries exhausted', async () => {
    let calls = 0;
    const store = createAiStore({
      resolveAiStep: async () => {
        calls += 1;
        return 'no-op';
      },
    });
    const onError = vi.fn();

    const controller = createAiPlaybackController({
      store: store as unknown as StoreApi<GameStore>,
      animation: { setDetailLevel: vi.fn(), skipAll: vi.fn() },
      baseStepDelayMs: 0,
      maxNoOpRetries: 3,
      onError,
    });

    controller.start();
    // Wait for all retries to complete (each has a small delay)
    await new Promise((resolve) => setTimeout(resolve, 500));
    await flushAsync();

    expect(calls).toBe(3);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('stalled'));

    controller.destroy();
  });

  it('stops after maxDriveMoves and calls onError', async () => {
    let calls = 0;
    const store = createAiStore({
      resolveAiStep: async () => {
        calls += 1;
        return 'advanced';
      },
    });
    const onError = vi.fn();

    const controller = createAiPlaybackController({
      store: store as unknown as StoreApi<GameStore>,
      animation: { setDetailLevel: vi.fn(), skipAll: vi.fn() },
      baseStepDelayMs: 0,
      maxDriveMoves: 5,
      onError,
    });

    controller.start();
    await flushAsync();
    // Wait a tick for the loop to exhaust moves
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushAsync();

    expect(calls).toBe(5);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.stringContaining('move limit'));

    controller.destroy();
  });
});
