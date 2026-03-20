import type { StoreApi } from 'zustand';

import type { GameStore } from '../store/game-store.js';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;

export interface CanvasCrashRecovery {
  handleCrash(error: unknown): void;
  destroy(): void;
}

export interface CanvasRuntimeHealthStatus {
  readonly tickerStarted: boolean;
  readonly canvasConnected: boolean;
}

export interface CanvasCrashRecoveryOptions {
  readonly store: StoreApi<GameStore>;
  readonly onRecoveryNeeded: () => void;
  readonly logger?: Pick<Console, 'warn'>;
  readonly getHealthStatus?: () => CanvasRuntimeHealthStatus | null;
  readonly heartbeatIntervalMs?: number;
}

export function createCanvasCrashRecovery(options: CanvasCrashRecoveryOptions): CanvasCrashRecovery {
  const logger = options.logger ?? console;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  let destroyed = false;
  let recoveryRequested = false;
  let heartbeatId: ReturnType<typeof setInterval> | null = null;

  const requestRecovery = (reason: string, detail: unknown): void => {
    if (destroyed || recoveryRequested) {
      return;
    }

    recoveryRequested = true;
    logger.warn(reason, detail);
    options.store.getState().reportCanvasCrash();
    options.store.getState().beginCanvasRecovery();
    options.onRecoveryNeeded();
  };

  if (heartbeatIntervalMs > 0 && options.getHealthStatus !== undefined) {
    heartbeatId = setInterval(() => {
      const healthStatus = options.getHealthStatus?.();
      if (healthStatus === null || healthStatus === undefined) {
        return;
      }
      if (healthStatus.tickerStarted && healthStatus.canvasConnected) {
        return;
      }
      requestRecovery('Canvas runtime heartbeat detected unhealthy runtime. Starting recovery.', healthStatus);
    }, heartbeatIntervalMs);
  }

  return {
    handleCrash(error: unknown): void {
      requestRecovery('Canvas runtime crash detected. Starting recovery.', error);
    },
    destroy(): void {
      if (destroyed) {
        return;
      }
      destroyed = true;
      if (heartbeatId !== null) {
        clearInterval(heartbeatId);
        heartbeatId = null;
      }
    },
  };
}
