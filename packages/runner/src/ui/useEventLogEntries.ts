import { useEffect, useRef, useState } from 'react';
import type { StoreApi } from 'zustand';

import type { VisualConfigProvider } from '../config/visual-config-provider.js';
import type { EventLogEntry } from '../model/translate-effect-trace.js';
import { translateEffectTrace } from '../model/translate-effect-trace.js';
import type { GameStore } from '../store/game-store.js';

export function useEventLogEntries(
  store: StoreApi<GameStore>,
  visualConfigProvider: VisualConfigProvider,
): readonly EventLogEntry[] {
  const [entries, setEntries] = useState<readonly EventLogEntry[]>([]);
  const moveIndexRef = useRef(0);

  useEffect(() => {
    setEntries([]);
    moveIndexRef.current = 0;
  }, [store]);

  useEffect(() => {
    return store.subscribe((state, previousState) => {
      const gameDef = state.gameDef;
      if (gameDef === null) {
        return;
      }

      const tracesUnchanged = state.effectTrace === previousState.effectTrace
        && state.triggerFirings === previousState.triggerFirings;
      if (tracesUnchanged || (state.effectTrace.length === 0 && state.triggerFirings.length === 0)) {
        return;
      }

      setEntries((currentEntries) => {
        const translated = translateEffectTrace(
          state.effectTrace,
          state.triggerFirings,
          visualConfigProvider,
          gameDef,
          moveIndexRef.current,
        );
        if (translated.length === 0) {
          return currentEntries;
        }

        moveIndexRef.current += 1;
        return [...currentEntries, ...translated];
      });
    });
  }, [store, visualConfigProvider]);

  return entries;
}
