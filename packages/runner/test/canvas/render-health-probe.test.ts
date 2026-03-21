import { describe, expect, it, vi } from 'vitest';

import { createRenderHealthProbe } from '../../src/canvas/render-health-probe.js';

interface MockTicker {
  addOnce(callback: () => void): void;
  remove(callback: () => void): void;
}

function createTickerHarness(): {
  ticker: MockTicker;
  addOnce: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  fire(): void;
} {
  let callback: (() => void) | null = null;

  const addOnce = vi.fn((nextCallback: () => void) => {
    callback = nextCallback;
  });
  const remove = vi.fn((nextCallback: () => void) => {
    if (callback === nextCallback) {
      callback = null;
    }
  });

  return {
    ticker: {
      addOnce,
      remove,
    },
    addOnce,
    remove,
    fire: () => {
      const activeCallback = callback;
      callback = null;
      activeCallback?.();
    },
  };
}

describe('createRenderHealthProbe', () => {
  it('triggers corruption when the stage has children but none are renderable and visible', () => {
    const onCorruption = vi.fn();
    const logger = { warn: vi.fn() };
    const tickerHarness = createTickerHarness();
    const probe = createRenderHealthProbe({
      stage: {
        children: [
          { renderable: false, visible: true },
          { renderable: true, visible: false },
        ],
      },
      ticker: tickerHarness.ticker,
      onCorruption,
      logger,
    });

    probe.scheduleVerification();
    tickerHarness.fire();

    expect(onCorruption).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('does not trigger corruption when the stage has a renderable visible child', () => {
    const onCorruption = vi.fn();
    const tickerHarness = createTickerHarness();
    const probe = createRenderHealthProbe({
      stage: {
        children: [
          { renderable: false, visible: true },
          { renderable: true, visible: true },
        ],
      },
      ticker: tickerHarness.ticker,
      onCorruption,
      logger: { warn: vi.fn() },
    });

    probe.scheduleVerification();
    tickerHarness.fire();

    expect(onCorruption).not.toHaveBeenCalled();
  });

  it('does not treat an empty stage as corruption', () => {
    const onCorruption = vi.fn();
    const tickerHarness = createTickerHarness();
    const probe = createRenderHealthProbe({
      stage: { children: [] },
      ticker: tickerHarness.ticker,
      onCorruption,
      logger: { warn: vi.fn() },
    });

    probe.scheduleVerification();
    tickerHarness.fire();

    expect(onCorruption).not.toHaveBeenCalled();
  });

  it('debounces multiple schedule requests until verification runs', () => {
    const tickerHarness = createTickerHarness();
    const probe = createRenderHealthProbe({
      stage: { children: [] },
      ticker: tickerHarness.ticker,
      onCorruption: vi.fn(),
      logger: { warn: vi.fn() },
    });

    probe.scheduleVerification();
    probe.scheduleVerification();
    probe.scheduleVerification();

    expect(tickerHarness.addOnce).toHaveBeenCalledTimes(1);

    tickerHarness.fire();
    probe.scheduleVerification();

    expect(tickerHarness.addOnce).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending verification on destroy', () => {
    const onCorruption = vi.fn();
    const tickerHarness = createTickerHarness();
    const probe = createRenderHealthProbe({
      stage: {
        children: [{ renderable: false, visible: false }],
      },
      ticker: tickerHarness.ticker,
      onCorruption,
      logger: { warn: vi.fn() },
    });

    probe.scheduleVerification();
    probe.destroy();
    tickerHarness.fire();

    expect(tickerHarness.remove).toHaveBeenCalledTimes(1);
    expect(onCorruption).not.toHaveBeenCalled();
  });
});
