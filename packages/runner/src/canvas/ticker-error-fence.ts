import type { Application } from 'pixi.js';

const DEFAULT_MAX_CONSECUTIVE_ERRORS = 3;

type TickerTick = (...args: unknown[]) => unknown;

interface TickerLike {
  _tick: TickerTick;
  stop(): void;
}

interface ApplicationWithTicker {
  readonly ticker: TickerLike;
}

interface FenceState {
  readonly originalTick: TickerTick;
}

const installedFences = new WeakMap<TickerLike, FenceState>();

export interface TickerErrorFence {
  destroy(): void;
}

export interface TickerErrorFenceOptions {
  readonly maxConsecutiveErrors?: number;
  readonly onCrash?: (error: unknown) => void;
  readonly logger?: Pick<Console, 'warn'>;
}

export function installTickerErrorFence(
  app: Application,
  options?: TickerErrorFenceOptions,
): TickerErrorFence {
  const ticker = getTicker(app);
  if (installedFences.has(ticker)) {
    throw new Error('Ticker error fence already installed for this Pixi application ticker.');
  }

  const maxConsecutiveErrors = options?.maxConsecutiveErrors ?? DEFAULT_MAX_CONSECUTIVE_ERRORS;
  if (!Number.isInteger(maxConsecutiveErrors) || maxConsecutiveErrors < 1) {
    throw new Error('Ticker error fence maxConsecutiveErrors must be an integer >= 1.');
  }

  const logger = options?.logger ?? console;
  const originalTick = ticker._tick;
  let consecutiveErrors = 0;
  let destroyed = false;
  let crashReported = false;

  const wrappedTick: TickerTick = (...args: unknown[]): unknown => {
    try {
      const result = originalTick.apply(ticker, args);
      consecutiveErrors = 0;
      return result;
    } catch (error) {
      consecutiveErrors += 1;
      const reachedThreshold = consecutiveErrors >= maxConsecutiveErrors;
      logger.warn(
        reachedThreshold
          ? `Ticker error fence stopped the Pixi ticker after ${consecutiveErrors} consecutive error(s).`
          : `Ticker error fence contained ticker error ${consecutiveErrors}/${maxConsecutiveErrors}.`,
        error,
      );
      if (reachedThreshold && !crashReported) {
        crashReported = true;
        ticker.stop();
        options?.onCrash?.(error);
      }
      return undefined;
    }
  };

  ticker._tick = wrappedTick;
  installedFences.set(ticker, { originalTick });

  return {
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      const activeFence = installedFences.get(ticker);
      if (activeFence?.originalTick === originalTick) {
        ticker._tick = originalTick;
        installedFences.delete(ticker);
      }
    },
  };
}

function getTicker(app: Application): TickerLike {
  const ticker = (app as unknown as ApplicationWithTicker).ticker;
  if (
    ticker === undefined ||
    ticker === null ||
    typeof ticker !== 'object' ||
    typeof ticker._tick !== 'function' ||
    typeof ticker.stop !== 'function'
  ) {
    throw new Error('Pixi application ticker does not expose a wrap-compatible _tick()/stop() surface.');
  }
  return ticker;
}
