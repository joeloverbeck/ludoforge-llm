import { describe, expect, it, vi, type Mock } from 'vitest';
import type { Application } from 'pixi.js';

import { installTickerErrorFence } from '../../src/canvas/ticker-error-fence.js';

interface MockTicker {
  _tick: (...args: unknown[]) => unknown;
  stop: () => void;
}

function createMockApp(): {
  app: Application;
  ticker: MockTicker;
  tickMock: Mock<(...args: unknown[]) => unknown>;
  stopMock: Mock<() => void>;
} {
  const tickMock = vi.fn<(...args: unknown[]) => unknown>();
  const stopMock = vi.fn<() => void>();
  const ticker: MockTicker = {
    _tick: tickMock,
    stop: stopMock,
  };

  return {
    app: { ticker } as unknown as Application,
    ticker,
    tickMock,
    stopMock,
  };
}

describe('installTickerErrorFence', () => {
  it('single error is caught and does not propagate', () => {
    const { app, ticker, tickMock, stopMock } = createMockApp();
    const failure = new Error('boom');
    tickMock.mockImplementationOnce(() => {
      throw failure;
    });
    const onCrash = vi.fn();

    const fence = installTickerErrorFence(app, {
      onCrash,
      logger: { warn: vi.fn() },
    });

    expect(() => {
      ticker._tick();
    }).not.toThrow();
    expect(stopMock).not.toHaveBeenCalled();
    expect(onCrash).not.toHaveBeenCalled();

    fence.destroy();
  });

  it('successful tick resets the consecutive error counter', () => {
    const { app, ticker, tickMock, stopMock } = createMockApp();
    const failure = new Error('boom');
    tickMock
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw failure;
      });

    const onCrash = vi.fn();
    const fence = installTickerErrorFence(app, {
      maxConsecutiveErrors: 2,
      onCrash,
      logger: { warn: vi.fn() },
    });

    ticker._tick();
    ticker._tick();
    ticker._tick();

    expect(stopMock).not.toHaveBeenCalled();
    expect(onCrash).not.toHaveBeenCalled();

    fence.destroy();
  });

  it('stops the ticker after N consecutive errors', () => {
    const { app, ticker, tickMock, stopMock } = createMockApp();
    const failure = new Error('boom');
    tickMock.mockImplementation(() => {
      throw failure;
    });

    const fence = installTickerErrorFence(app, {
      maxConsecutiveErrors: 3,
      logger: { warn: vi.fn() },
    });

    ticker._tick();
    ticker._tick();
    ticker._tick();

    expect(stopMock).toHaveBeenCalledTimes(1);

    fence.destroy();
  });

  it('reports crash through onCrash after the threshold', () => {
    const { app, ticker, tickMock } = createMockApp();
    const failure = new Error('boom');
    tickMock.mockImplementation(() => {
      throw failure;
    });
    const onCrash = vi.fn();

    const fence = installTickerErrorFence(app, {
      maxConsecutiveErrors: 2,
      onCrash,
      logger: { warn: vi.fn() },
    });

    ticker._tick();
    ticker._tick();
    ticker._tick();

    expect(onCrash).toHaveBeenCalledTimes(1);
    expect(onCrash).toHaveBeenCalledWith(failure);

    fence.destroy();
  });

  it('logs a warning for each contained error', () => {
    const { app, ticker, tickMock } = createMockApp();
    const failure = new Error('boom');
    tickMock.mockImplementation(() => {
      throw failure;
    });
    const logger = { warn: vi.fn() };

    const fence = installTickerErrorFence(app, {
      maxConsecutiveErrors: 2,
      logger,
    });

    ticker._tick();
    ticker._tick();

    expect(logger.warn).toHaveBeenCalledTimes(2);

    fence.destroy();
  });

  it('destroy restores the original _tick callback', () => {
    const { app, ticker, tickMock } = createMockApp();
    const originalTick = ticker._tick;

    const fence = installTickerErrorFence(app, {
      logger: { warn: vi.fn() },
    });

    expect(ticker._tick).not.toBe(originalTick);

    fence.destroy();

    expect(ticker._tick).toBe(originalTick);
    expect(ticker._tick).toBe(tickMock);
  });

  it('rejects duplicate installation on the same ticker', () => {
    const { app } = createMockApp();
    const first = installTickerErrorFence(app, {
      logger: { warn: vi.fn() },
    });

    expect(() => {
      installTickerErrorFence(app, {
        logger: { warn: vi.fn() },
      });
    }).toThrow(/already installed/i);

    first.destroy();
  });
});
