import { useCallback, useEffect, useRef, useState } from 'react';

import type { AnnotatedActionDescription } from '@ludoforge/engine/runtime';

import type { GameBridge } from '../bridge/game-bridge.js';
import { hasDisplayableContent } from './has-displayable-content.js';

export interface ActionTooltipState {
  readonly actionId: string | null;
  readonly description: AnnotatedActionDescription | null;
  readonly loading: boolean;
  readonly anchorElement: HTMLElement | null;
}

const INITIAL_STATE: ActionTooltipState = {
  actionId: null,
  description: null,
  loading: false,
  anchorElement: null,
};

const DEBOUNCE_MS = 200;

export function useActionTooltip(bridge: GameBridge): {
  readonly tooltipState: ActionTooltipState;
  readonly onActionHoverStart: (actionId: string, element: HTMLElement) => void;
  readonly onActionHoverEnd: () => void;
} {
  const [tooltipState, setTooltipState] = useState<ActionTooltipState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestCounterRef = useRef(0);

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onActionHoverStart = useCallback((actionId: string, element: HTMLElement) => {
    clearPendingTimer();
    requestCounterRef.current += 1;
    const capturedCounter = requestCounterRef.current;

    setTooltipState({
      actionId,
      description: null,
      loading: false,
      anchorElement: element,
    });

    timerRef.current = setTimeout(() => {
      timerRef.current = null;

      if (requestCounterRef.current !== capturedCounter) {
        return;
      }

      setTooltipState((previous) => ({
        ...previous,
        loading: true,
      }));

      bridge.describeAction(actionId).then(
        (result) => {
          if (requestCounterRef.current !== capturedCounter) {
            return;
          }
          setTooltipState((previous) => ({
            ...previous,
            description: result != null && hasDisplayableContent(result) ? result : null,
            loading: false,
          }));
        },
        () => {
          if (requestCounterRef.current !== capturedCounter) {
            return;
          }
          setTooltipState((previous) => ({
            ...previous,
            loading: false,
          }));
        },
      );
    }, DEBOUNCE_MS);
  }, [bridge, clearPendingTimer]);

  const onActionHoverEnd = useCallback(() => {
    clearPendingTimer();
    requestCounterRef.current += 1;
    setTooltipState(INITIAL_STATE);
  }, [clearPendingTimer]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
    };
  }, [clearPendingTimer]);

  return { tooltipState, onActionHoverStart, onActionHoverEnd };
}
