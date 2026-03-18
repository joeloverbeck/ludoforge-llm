import { useCallback, useEffect, useRef, useState } from 'react';

import type { RenderEventCard } from '../model/render-model.js';

export interface CardTooltipState {
  readonly card: RenderEventCard | null;
  readonly anchorElement: HTMLElement | null;
}

const INITIAL_STATE: CardTooltipState = {
  card: null,
  anchorElement: null,
};

const DEBOUNCE_MS = 200;
const GRACE_MS = 100;

type CardTooltipInteractionState = 'idle' | 'hovering-card' | 'hovering-tooltip' | 'grace-pending';

export function useCardTooltip(): {
  readonly cardTooltipState: CardTooltipState;
  readonly onCardHoverStart: (card: RenderEventCard, element: HTMLElement) => void;
  readonly onCardHoverEnd: () => void;
  readonly onCardTooltipPointerEnter: () => void;
  readonly onCardTooltipPointerLeave: () => void;
} {
  const [cardTooltipState, setCardTooltipState] = useState<CardTooltipState>(INITIAL_STATE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionStateRef = useRef<CardTooltipInteractionState>('idle');

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
    interactionStateRef.current = 'idle';
    setCardTooltipState(INITIAL_STATE);
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

  const onCardHoverStart = useCallback((card: RenderEventCard, element: HTMLElement) => {
    clearPendingTimer();
    clearGraceTimer();
    interactionStateRef.current = 'hovering-card';

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (interactionStateRef.current === 'hovering-card') {
        setCardTooltipState({ card, anchorElement: element });
      }
    }, DEBOUNCE_MS);
  }, [clearPendingTimer, clearGraceTimer]);

  const onCardHoverEnd = useCallback(() => {
    clearPendingTimer();
    if (interactionStateRef.current === 'hovering-tooltip') {
      return;
    }
    startGracePeriod();
  }, [clearPendingTimer, startGracePeriod]);

  const onCardTooltipPointerEnter = useCallback(() => {
    interactionStateRef.current = 'hovering-tooltip';
    clearGraceTimer();
  }, [clearGraceTimer]);

  const onCardTooltipPointerLeave = useCallback(() => {
    startGracePeriod();
  }, [startGracePeriod]);

  useEffect(() => {
    return () => {
      clearPendingTimer();
      clearGraceTimer();
    };
  }, [clearPendingTimer, clearGraceTimer]);

  return {
    cardTooltipState,
    onCardHoverStart,
    onCardHoverEnd,
    onCardTooltipPointerEnter,
    onCardTooltipPointerLeave,
  };
}
