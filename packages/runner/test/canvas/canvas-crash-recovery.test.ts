import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  createCanvasCrashRecovery,
} from '../../src/canvas/canvas-crash-recovery.js';
import type { CanvasRuntimeHealthStatus } from '../../src/canvas/canvas-runtime-health.js';
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

afterEach(() => {
  vi.useRealTimers();
});

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

  describe('heartbeat', () => {
    it('triggers recovery when the ticker stops', () => {
      vi.useFakeTimers();
      const calls: string[] = [];
      let healthStatus: CanvasRuntimeHealthStatus | null = {
        tickerStarted: true,
        canvasConnected: true,
        renderCorruptionSuspected: false,
      };
      const recovery = createCanvasCrashRecovery({
        store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
        onRecoveryNeeded: vi.fn(() => {
          calls.push('onRecoveryNeeded');
        }),
        getHealthStatus: () => healthStatus,
        heartbeatIntervalMs: 100,
        logger: { warn: vi.fn() },
      });

      healthStatus = {
        tickerStarted: false,
        canvasConnected: true,
        renderCorruptionSuspected: false,
      };
      vi.advanceTimersByTime(100);

      expect(calls).toEqual([
        'reportCanvasCrash',
        'beginCanvasRecovery',
        'onRecoveryNeeded',
      ]);

      recovery.destroy();
    });

    it('triggers recovery when the canvas disconnects', () => {
      vi.useFakeTimers();
      const calls: string[] = [];
      const recovery = createCanvasCrashRecovery({
        store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
        onRecoveryNeeded: vi.fn(() => {
          calls.push('onRecoveryNeeded');
        }),
        getHealthStatus: () => ({
          tickerStarted: true,
          canvasConnected: false,
          renderCorruptionSuspected: false,
        }),
        heartbeatIntervalMs: 100,
        logger: { warn: vi.fn() },
      });

      vi.advanceTimersByTime(100);

      expect(calls).toEqual([
        'reportCanvasCrash',
        'beginCanvasRecovery',
        'onRecoveryNeeded',
      ]);

      recovery.destroy();
    });

    it('does not trigger duplicate recovery after the first request', () => {
      vi.useFakeTimers();
      const calls: string[] = [];
      const recovery = createCanvasCrashRecovery({
        store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
        onRecoveryNeeded: vi.fn(() => {
          calls.push('onRecoveryNeeded');
        }),
        getHealthStatus: () => ({
          tickerStarted: false,
          canvasConnected: true,
          renderCorruptionSuspected: false,
        }),
        heartbeatIntervalMs: 100,
        logger: { warn: vi.fn() },
      });

      vi.advanceTimersByTime(300);

      expect(calls).toEqual([
        'reportCanvasCrash',
        'beginCanvasRecovery',
        'onRecoveryNeeded',
      ]);

      recovery.destroy();
    });

    it('clears the heartbeat on destroy', () => {
      vi.useFakeTimers();
      const calls: string[] = [];
      const recovery = createCanvasCrashRecovery({
        store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
        onRecoveryNeeded: vi.fn(() => {
          calls.push('onRecoveryNeeded');
        }),
        getHealthStatus: () => ({
          tickerStarted: false,
          canvasConnected: true,
          renderCorruptionSuspected: false,
        }),
        heartbeatIntervalMs: 100,
        logger: { warn: vi.fn() },
      });

      recovery.destroy();
      vi.advanceTimersByTime(300);

      expect(calls).toEqual([]);
    });

    it('does not create a heartbeat when disabled or when no health getter is provided', () => {
      vi.useFakeTimers();
      const calls: string[] = [];
      const disabled = createCanvasCrashRecovery({
        store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
        onRecoveryNeeded: vi.fn(() => {
          calls.push('disabled');
        }),
        getHealthStatus: () => ({
          tickerStarted: false,
          canvasConnected: true,
          renderCorruptionSuspected: false,
        }),
        heartbeatIntervalMs: 0,
        logger: { warn: vi.fn() },
      });
      const noGetter = createCanvasCrashRecovery({
        store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
        onRecoveryNeeded: vi.fn(() => {
          calls.push('noGetter');
        }),
        heartbeatIntervalMs: 100,
        logger: { warn: vi.fn() },
      });

      vi.advanceTimersByTime(300);

      expect(calls).toEqual([]);

      disabled.destroy();
      noGetter.destroy();
    });

    it('triggers recovery when render corruption is suspected despite structural health remaining true', () => {
      vi.useFakeTimers();
      const calls: string[] = [];
      const recovery = createCanvasCrashRecovery({
        store: createRecoveryStore(calls) as unknown as StoreApi<GameStore>,
        onRecoveryNeeded: vi.fn(() => {
          calls.push('onRecoveryNeeded');
        }),
        getHealthStatus: () => ({
          tickerStarted: true,
          canvasConnected: true,
          renderCorruptionSuspected: true,
        }),
        heartbeatIntervalMs: 100,
        logger: { warn: vi.fn() },
      });

      vi.advanceTimersByTime(100);

      expect(calls).toEqual([
        'reportCanvasCrash',
        'beginCanvasRecovery',
        'onRecoveryNeeded',
      ]);

      recovery.destroy();
    });
  });
});
