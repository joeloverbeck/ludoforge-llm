import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Application } from 'pixi.js';

import { createCanvasCrashRecovery } from '../../src/canvas/canvas-crash-recovery.js';
import type { CanvasRuntimeHealthStatus } from '../../src/canvas/canvas-runtime-health.js';
import { createRenderHealthProbe } from '../../src/canvas/render-health-probe.js';
import { installTickerErrorFence, type TickerErrorFence } from '../../src/canvas/ticker-error-fence.js';
import type { GameStore } from '../../src/store/game-store.js';

interface RecoveryStoreState {
  reportCanvasCrash(): void;
  beginCanvasRecovery(): void;
}

interface MockStageChild {
  renderable: boolean;
  visible: boolean;
}

interface MockStage {
  children: MockStageChild[];
}

interface MockTicker {
  _tick: (...args: unknown[]) => unknown;
  addOnce(callback: () => void): void;
  remove(callback: () => void): void;
  stop(): void;
  started: boolean;
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

function createTickerHarness(): {
  app: Application;
  stage: MockStage;
  ticker: MockTicker;
  tickImpl: ReturnType<typeof vi.fn<(...args: unknown[]) => unknown>>;
  stopMock: ReturnType<typeof vi.fn>;
  flushScheduledCallbacks(): void;
} {
  const stage: MockStage = {
    children: [],
  };
  const tickImpl = vi.fn<(...args: unknown[]) => unknown>();
  const stopMock = vi.fn();
  const scheduledCallbacks = new Set<() => void>();
  const ticker: MockTicker = {
    _tick: (...args: unknown[]) => tickImpl(...args),
    addOnce: (callback: () => void) => {
      scheduledCallbacks.add(callback);
    },
    remove: (callback: () => void) => {
      scheduledCallbacks.delete(callback);
    },
    stop: () => {
      ticker.started = false;
      stopMock();
    },
    started: true,
  };

  return {
    app: { ticker } as unknown as Application,
    stage,
    ticker,
    tickImpl,
    stopMock,
    flushScheduledCallbacks: () => {
      const callbacks = [...scheduledCallbacks];
      scheduledCallbacks.clear();
      for (const callback of callbacks) {
        callback();
      }
    },
  };
}

function createIntegrationHarness(options?: {
  stageChildren?: MockStageChild[];
  heartbeatIntervalMs?: number;
}): {
  calls: string[];
  recovery: ReturnType<typeof createCanvasCrashRecovery>;
  probe: ReturnType<typeof createRenderHealthProbe>;
  fence: TickerErrorFence;
  tickerHarness: ReturnType<typeof createTickerHarness>;
  getHealthStatus(): CanvasRuntimeHealthStatus;
} {
  const calls: string[] = [];
  const tickerHarness = createTickerHarness();
  tickerHarness.stage.children = options?.stageChildren ?? [];
  const store = createRecoveryStore(calls) as unknown as StoreApi<GameStore>;

  let fence!: TickerErrorFence;
  const recovery = createCanvasCrashRecovery({
    store,
    onRecoveryNeeded: () => {
      calls.push('onRecoveryNeeded');
    },
    getHealthStatus: () => ({
      tickerStarted: tickerHarness.ticker.started,
      canvasConnected: true,
      renderCorruptionSuspected: fence.isRenderCorruptionSuspected(),
    }),
    heartbeatIntervalMs: options?.heartbeatIntervalMs ?? 0,
    logger: { warn: vi.fn() },
  });
  const probe = createRenderHealthProbe({
    stage: tickerHarness.stage,
    ticker: tickerHarness.ticker,
    onCorruption: () => {
      recovery.handleCrash(new Error('render health probe confirmed corruption'));
    },
    logger: { warn: vi.fn() },
  });
  fence = installTickerErrorFence(tickerHarness.app, {
    onContainedError: () => {
      probe.scheduleVerification();
    },
    onCrash: (error) => {
      recovery.handleCrash(error);
    },
    logger: { warn: vi.fn() },
  });

  return {
    calls,
    recovery,
    probe,
    fence,
    tickerHarness,
    getHealthStatus: () => ({
      tickerStarted: tickerHarness.ticker.started,
      canvasConnected: true,
      renderCorruptionSuspected: fence.isRenderCorruptionSuspected(),
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('crash elimination integration', () => {
  it('routes a contained ticker error through probe confirmation into immediate recovery', () => {
    const harness = createIntegrationHarness({
      stageChildren: [{ renderable: false, visible: false }],
    });
    const failure = new Error('contained ticker failure');
    harness.tickerHarness.tickImpl.mockImplementation(() => {
      throw failure;
    });

    expect(() => {
      harness.tickerHarness.ticker._tick();
    }).not.toThrow();
    expect(harness.getHealthStatus().renderCorruptionSuspected).toBe(true);
    expect(harness.calls).toEqual([]);

    harness.tickerHarness.flushScheduledCallbacks();

    expect(harness.calls).toEqual([
      'reportCanvasCrash',
      'beginCanvasRecovery',
      'onRecoveryNeeded',
    ]);

    harness.fence.destroy();
    harness.probe.destroy();
    harness.recovery.destroy();
  });

  it('falls back to heartbeat recovery when corruption suspicion persists with structural health still true', () => {
    vi.useFakeTimers();
    const harness = createIntegrationHarness({
      stageChildren: [{ renderable: true, visible: true }],
      heartbeatIntervalMs: 100,
    });
    harness.tickerHarness.tickImpl.mockImplementation(() => {
      throw new Error('contained ticker failure');
    });

    harness.tickerHarness.ticker._tick();
    harness.tickerHarness.flushScheduledCallbacks();

    expect(harness.getHealthStatus()).toEqual({
      tickerStarted: true,
      canvasConnected: true,
      renderCorruptionSuspected: true,
    });
    expect(harness.calls).toEqual([]);

    vi.advanceTimersByTime(100);

    expect(harness.calls).toEqual([
      'reportCanvasCrash',
      'beginCanvasRecovery',
      'onRecoveryNeeded',
    ]);

    harness.fence.destroy();
    harness.probe.destroy();
    harness.recovery.destroy();
  });

  it('requests recovery exactly once when probe confirmation and heartbeat polling race', () => {
    vi.useFakeTimers();
    const harness = createIntegrationHarness({
      stageChildren: [{ renderable: false, visible: false }],
      heartbeatIntervalMs: 100,
    });
    harness.tickerHarness.tickImpl.mockImplementation(() => {
      throw new Error('contained ticker failure');
    });

    expect(() => {
      harness.tickerHarness.ticker._tick();
      harness.tickerHarness.flushScheduledCallbacks();
      vi.advanceTimersByTime(100);
    }).not.toThrow();

    expect(harness.calls).toEqual([
      'reportCanvasCrash',
      'beginCanvasRecovery',
      'onRecoveryNeeded',
    ]);

    harness.fence.destroy();
    harness.probe.destroy();
    harness.recovery.destroy();
  });
});
