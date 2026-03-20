import { describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';

import { createCanvasCrashRecovery } from '../../src/canvas/canvas-crash-recovery.js';
import type { GameStore } from '../../src/store/game-store.js';

interface RecoveryStoreState {
  reportCanvasCrash(): void;
  beginCanvasRecovery(): void;
}

function createRecoveryStore(log: string[]): StoreApi<RecoveryStoreState> {
  return createStore<RecoveryStoreState>()(() => ({
    reportCanvasCrash: () => {
      log.push('reportCanvasCrash');
    },
    beginCanvasRecovery: () => {
      log.push('beginCanvasRecovery');
    },
  }));
}

describe('canvas crash recovery', () => {
  it('handleCrash reports canvas crash and begins recovery', () => {
    const calls: string[] = [];
    const onRecoveryNeeded = vi.fn(() => {
      calls.push('onRecoveryNeeded');
    });
    const recovery = createCanvasCrashRecovery({
      store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
      onRecoveryNeeded,
      logger: { warn: vi.fn() },
    });

    recovery.handleCrash(new Error('boom'));

    expect(calls).toEqual([
      'reportCanvasCrash',
      'beginCanvasRecovery',
      'onRecoveryNeeded',
    ]);
    expect(onRecoveryNeeded).toHaveBeenCalledTimes(1);
  });

  it('handleCrash requests recovery remount exactly once per recovery window', () => {
    const calls: string[] = [];
    const onRecoveryNeeded = vi.fn(() => {
      calls.push('onRecoveryNeeded');
    });
    const recovery = createCanvasCrashRecovery({
      store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
      onRecoveryNeeded,
      logger: { warn: vi.fn() },
    });

    recovery.handleCrash(new Error('first'));
    recovery.handleCrash(new Error('second'));

    expect(calls).toEqual([
      'reportCanvasCrash',
      'beginCanvasRecovery',
      'onRecoveryNeeded',
    ]);
    expect(onRecoveryNeeded).toHaveBeenCalledTimes(1);
  });

  it('destroy disables later crash handling', () => {
    const calls: string[] = [];
    const recovery = createCanvasCrashRecovery({
      store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
      onRecoveryNeeded: vi.fn(),
      logger: { warn: vi.fn() },
    });

    recovery.destroy();
    recovery.handleCrash(new Error('boom'));

    expect(calls).toEqual([]);
  });
});
