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
    expect(fence.isRenderCorruptionSuspected()).toBe(true);

    fence.destroy();
  });

  it('clears render corruption suspicion after enough successful ticks', () => {
    const { app, ticker, tickMock } = createMockApp();
    const failure = new Error('boom');
    tickMock
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockImplementation(() => undefined);

    const fence = installTickerErrorFence(app, {
      corruptionClearThreshold: 3,
      logger: { warn: vi.fn() },
    });

    ticker._tick();
    expect(fence.isRenderCorruptionSuspected()).toBe(true);

    ticker._tick();
    ticker._tick();
    expect(fence.isRenderCorruptionSuspected()).toBe(true);

    ticker._tick();
    expect(fence.isRenderCorruptionSuspected()).toBe(false);

    fence.destroy();
  });

  it('resets the corruption clear countdown after a new contained error', () => {
    const { app, ticker, tickMock } = createMockApp();
    const failure = new Error('boom');
    tickMock
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockImplementation(() => undefined);

    const fence = installTickerErrorFence(app, {
      corruptionClearThreshold: 3,
      logger: { warn: vi.fn() },
    });

    ticker._tick();
    ticker._tick();
    ticker._tick();
    expect(fence.isRenderCorruptionSuspected()).toBe(true);

    ticker._tick();
    expect(fence.isRenderCorruptionSuspected()).toBe(true);

    ticker._tick();
    ticker._tick();
    expect(fence.isRenderCorruptionSuspected()).toBe(true);

    ticker._tick();
    expect(fence.isRenderCorruptionSuspected()).toBe(false);

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

  it('calls onContainedError for contained errors before the crash threshold is reached', () => {
    const { app, ticker, tickMock } = createMockApp();
    const failure = new Error('boom');
    tickMock.mockImplementation(() => {
      throw failure;
    });
    const onContainedError = vi.fn();

    const fence = installTickerErrorFence(app, {
      maxConsecutiveErrors: 3,
      onContainedError,
      logger: { warn: vi.fn() },
    });

    ticker._tick();
    ticker._tick();

    expect(onContainedError).toHaveBeenCalledTimes(2);
    expect(onContainedError).toHaveBeenNthCalledWith(1, failure);
    expect(onContainedError).toHaveBeenNthCalledWith(2, failure);

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

  describe('sliding window error detection', () => {
    it('triggers crash when repeated errors stay within the window despite successful frames', () => {
      const { app, ticker, tickMock, stopMock } = createMockApp();
      const failure = new Error('boom');
      tickMock
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => { throw failure; });
      const onCrash = vi.fn();
      const now = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(300)
        .mockReturnValueOnce(600);

      const fence = installTickerErrorFence(app, {
        maxConsecutiveErrors: 3,
        windowErrors: 3,
        windowMs: 1000,
        now,
        onCrash,
        logger: { warn: vi.fn() },
      });

      ticker._tick();
      ticker._tick();
      ticker._tick();
      ticker._tick();
      ticker._tick();

      expect(stopMock).toHaveBeenCalledTimes(1);
      expect(onCrash).toHaveBeenCalledTimes(1);
      expect(onCrash).toHaveBeenCalledWith(failure);

      fence.destroy();
    });

    it('does not count errors that fall outside the configured time window', () => {
      const { app, ticker, tickMock, stopMock } = createMockApp();
      const failure = new Error('boom');
      tickMock
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => { throw failure; });
      const onCrash = vi.fn();
      const now = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(1500)
        .mockReturnValueOnce(3001);

      const fence = installTickerErrorFence(app, {
        maxConsecutiveErrors: 4,
        windowErrors: 3,
        windowMs: 1000,
        now,
        onCrash,
        logger: { warn: vi.fn() },
      });

      ticker._tick();
      ticker._tick();
      ticker._tick();
      ticker._tick();
      ticker._tick();

      expect(stopMock).not.toHaveBeenCalled();
      expect(onCrash).not.toHaveBeenCalled();

      fence.destroy();
    });

    it('wraps the timestamp ring buffer and only considers the most recent errors', () => {
      const { app, ticker, tickMock, stopMock } = createMockApp();
      const failure = new Error('boom');
      tickMock
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => { throw failure; })
        .mockImplementationOnce(() => undefined)
        .mockImplementationOnce(() => { throw failure; });
      const onCrash = vi.fn();
      const now = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(2000)
        .mockReturnValueOnce(2300)
        .mockReturnValueOnce(2500);

      const fence = installTickerErrorFence(app, {
        maxConsecutiveErrors: 5,
        windowErrors: 3,
        windowMs: 600,
        now,
        onCrash,
        logger: { warn: vi.fn() },
      });

      ticker._tick();
      ticker._tick();
      ticker._tick();
      ticker._tick();
      ticker._tick();
      ticker._tick();
      ticker._tick();

      expect(stopMock).toHaveBeenCalledTimes(1);
      expect(onCrash).toHaveBeenCalledTimes(1);

      fence.destroy();
    });

    it('calls onCrash once when both thresholds are reached together', () => {
      const { app, ticker, tickMock, stopMock } = createMockApp();
      const failure = new Error('boom');
      tickMock.mockImplementation(() => {
        throw failure;
      });
      const onCrash = vi.fn();
      const now = vi.fn()
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(100);

      const fence = installTickerErrorFence(app, {
        maxConsecutiveErrors: 2,
        windowErrors: 2,
        windowMs: 1000,
        now,
        onCrash,
        logger: { warn: vi.fn() },
      });

      ticker._tick();
      ticker._tick();
      ticker._tick();

      expect(stopMock).toHaveBeenCalledTimes(1);
      expect(onCrash).toHaveBeenCalledTimes(1);

      fence.destroy();
    });

    it('validates windowErrors and windowMs options', () => {
      const { app } = createMockApp();

      expect(() => {
        installTickerErrorFence(app, {
          windowErrors: 1,
          logger: { warn: vi.fn() },
        });
      }).toThrow(/windowErrors/i);

      expect(() => {
        installTickerErrorFence(app, {
          windowMs: 0,
          logger: { warn: vi.fn() },
        });
      }).toThrow(/windowMs/i);

      expect(() => {
        installTickerErrorFence(app, {
          corruptionClearThreshold: 0,
          logger: { warn: vi.fn() },
        });
      }).toThrow(/corruptionClearThreshold/i);
    });
  });
});
