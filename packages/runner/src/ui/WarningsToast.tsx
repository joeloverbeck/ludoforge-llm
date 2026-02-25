import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderWarning } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import styles from './WarningsToast.module.css';

interface WarningsToastProps {
  readonly store: StoreApi<GameStore>;
}

interface ActiveToast {
  readonly id: number;
  readonly key: string;
  readonly code: string;
  readonly message: string;
  readonly isDismissing: boolean;
}

const AUTO_DISMISS_MS = 5000;
const DISMISS_ANIMATION_MS = 200;
const EMPTY_WARNINGS: readonly RenderWarning[] = [];

function buildWarningKey(warning: RenderWarning): string {
  return `${warning.code}::${warning.message}`;
}

export function WarningsToast({ store }: WarningsToastProps): ReactElement | null {
  const warnings = useStore(store, (state) => state.renderModel?.moveEnumerationWarnings ?? EMPTY_WARNINGS);
  const orchestrationDiagnostic = useStore(store, (state) => state.orchestrationDiagnostic);
  const [toasts, setToasts] = useState<readonly ActiveToast[]>([]);
  const nextToastIdRef = useRef(0);
  const previousWarningKeysRef = useRef<ReadonlySet<string>>(new Set());
  const previousOrchestrationDiagnosticSequenceRef = useRef<number | null>(null);
  const dismissTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const removalTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((timers: Map<number, ReturnType<typeof setTimeout>>, toastId: number) => {
    const timer = timers.get(toastId);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(toastId);
    }
  }, []);

  const removeToast = useCallback((toastId: number) => {
    clearTimer(dismissTimersRef.current, toastId);
    clearTimer(removalTimersRef.current, toastId);
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, [clearTimer]);

  const startDismiss = useCallback((toastId: number) => {
    clearTimer(dismissTimersRef.current, toastId);
    setToasts((current) => current.map((toast) => (
      toast.id === toastId ? { ...toast, isDismissing: true } : toast
    )));
    if (!removalTimersRef.current.has(toastId)) {
      const removalTimer = setTimeout(() => {
        removeToast(toastId);
      }, DISMISS_ANIMATION_MS);
      removalTimersRef.current.set(toastId, removalTimer);
    }
  }, [clearTimer, removeToast]);

  const enqueueToast = useCallback((code: string, message: string, key: string) => {
    const id = nextToastIdRef.current;
    nextToastIdRef.current += 1;

    setToasts((current) => {
      if (current.some((toast) => toast.key === key)) {
        return current;
      }

      return [{ id, key, code, message, isDismissing: false }, ...current];
    });

    const dismissTimer = setTimeout(() => {
      startDismiss(id);
    }, AUTO_DISMISS_MS);
    dismissTimersRef.current.set(id, dismissTimer);
  }, [startDismiss]);

  useEffect(() => {
    const currentWarningKeys = new Set<string>();
    const previousWarningKeys = previousWarningKeysRef.current;

    for (const warning of warnings) {
      const key = buildWarningKey(warning);
      currentWarningKeys.add(key);
      if (!previousWarningKeys.has(key)) {
        enqueueToast(warning.code, warning.message, key);
      }
    }

    previousWarningKeysRef.current = currentWarningKeys;
  }, [warnings, enqueueToast]);

  useEffect(() => {
    if (orchestrationDiagnostic === null) {
      return;
    }
    if (previousOrchestrationDiagnosticSequenceRef.current === orchestrationDiagnostic.sequence) {
      return;
    }
    previousOrchestrationDiagnosticSequenceRef.current = orchestrationDiagnostic.sequence;
    enqueueToast(
      orchestrationDiagnostic.code,
      orchestrationDiagnostic.message,
      `orchestration::${orchestrationDiagnostic.sequence}`,
    );
  }, [orchestrationDiagnostic, enqueueToast]);

  useEffect(() => () => {
    for (const timer of dismissTimersRef.current.values()) {
      clearTimeout(timer);
    }
    dismissTimersRef.current.clear();

    for (const timer of removalTimersRef.current.values()) {
      clearTimeout(timer);
    }
    removalTimersRef.current.clear();
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <section className={styles.container} data-testid="warnings-toast" aria-live="polite" aria-label="Move warnings">
      <ul className={styles.list} data-testid="warnings-toast-list">
        {toasts.map((toast) => (
          <li
            key={toast.id}
            className={toast.isDismissing ? `${styles.item} ${styles.itemDismissing}` : styles.item}
            data-testid="warnings-toast-item"
          >
            <button
              type="button"
              className={styles.dismissButton}
              onClick={() => {
                startDismiss(toast.id);
              }}
              aria-label={`Dismiss warning ${toast.code}`}
            >
              <span className={styles.code} data-testid="warnings-toast-code">{toast.code}</span>
              <span className={styles.message} data-testid="warnings-toast-message">{toast.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
