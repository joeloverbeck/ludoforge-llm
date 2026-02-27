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
const GRACE_MS = 100;

type TooltipInteractionState = 'idle' | 'hovering-action' | 'hovering-tooltip' | 'grace-pending';

export function useActionTooltip(bridge: GameBridge): {
  readonly tooltipState: ActionTooltipState;
  readonly onActionHoverStart: (actionId: string, element: HTMLElement) => void;
  readonly onActionHoverEnd: () => void;
  readonly onTooltipPointerEnter: () => void;
  readonly onTooltipPointerLeave: () => void;
} {
  const [tooltipState, setTooltipState] = useState<ActionTooltipState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestCounterRef = useRef(0);
  const interactionStateRef = useRef<TooltipInteractionState>('idle');

  const clearPendingTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current !== null) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    requestCounterRef.current += 1;
    interactionStateRef.current = 'idle';
    setTooltipState(INITIAL_STATE);
  }, []);

  const startGracePeriod = useCallback(() => {
    interactionStateRef.current = 'grace-pending';
    clearGraceTimer();

    graceTimerRef.current = setTimeout(() => {
      graceTimerRef.current = null;
      if (interactionStateRef.current === 'grace-pending') {
        dismiss();
      }
    }, GRACE_MS);
  }, [clearGraceTimer, dismiss]);

  const onActionHoverStart = useCallback((actionId: string, element: HTMLElement) => {
    clearPendingTimer();
    clearGraceTimer();
    interactionStateRef.current = 'hovering-action';
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
  }, [bridge, clearPendingTimer, clearGraceTimer]);

  const onActionHoverEnd = useCallback(() => {
    clearPendingTimer();
    if (interactionStateRef.current === 'hovering-tooltip') {
      return;
    }
    startGracePeriod();
  }, [clearPendingTimer, startGracePeriod]);

  const onTooltipPointerEnter = useCallback(() => {
    interactionStateRef.current = 'hovering-tooltip';
    clearGraceTimer();
  }, [clearGraceTimer]);

  const onTooltipPointerLeave = useCallback(() => {
    startGracePeriod();
  }, [startGracePeriod]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
      clearGraceTimer();
    };
  }, [clearPendingTimer, clearGraceTimer]);

  return {
    tooltipState,
    onActionHoverStart,
    onActionHoverEnd,
    onTooltipPointerEnter,
    onTooltipPointerLeave,
  };
}
