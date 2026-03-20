import type { StoreApi } from 'zustand';

import type { GameStore } from '../store/game-store.js';

export interface CanvasCrashRecovery {
  handleCrash(error: unknown): void;
  destroy(): void;
}

export interface CanvasCrashRecoveryOptions {
  readonly store: StoreApi<GameStore>;
  readonly onRecoveryNeeded: () => void;
  readonly logger?: Pick<Console, 'warn'>;
}

export function createCanvasCrashRecovery(options: CanvasCrashRecoveryOptions): CanvasCrashRecovery {
  const logger = options.logger ?? console;
  let destroyed = false;
  let recoveryRequested = false;

  return {
    handleCrash(error: unknown): void {
      if (destroyed || recoveryRequested) {
        return;
      }

      recoveryRequested = true;
      logger.warn('Canvas runtime crash detected. Starting recovery.', error);
      options.store.getState().reportCanvasCrash();
      options.store.getState().beginCanvasRecovery();
      options.onRecoveryNeeded();
    },
    destroy(): void {
      destroyed = true;
    },
  };
}
