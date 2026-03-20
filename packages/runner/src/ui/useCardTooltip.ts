import type { RenderEventCard } from '../model/render-model.js';
import { useHoverPopoverSession } from './useHoverPopoverSession.js';

export interface CardTooltipState {
  readonly card: RenderEventCard | null;
  readonly anchorElement: HTMLElement | null;
  readonly status: 'idle' | 'pending' | 'visible';
  readonly interactionOwner: 'source' | 'popover' | 'grace' | null;
  readonly revision: number;
}

export function useCardTooltip(): {
  readonly cardTooltipState: CardTooltipState;
  readonly onCardHoverStart: (card: RenderEventCard, element: HTMLElement) => void;
  readonly onCardHoverEnd: () => void;
  readonly onCardTooltipPointerEnter: () => void;
  readonly onCardTooltipPointerLeave: () => void;
  readonly invalidateCardTooltip: () => void;
  readonly dismissCardTooltip: () => void;
} {
  const session = useHoverPopoverSession<RenderEventCard, RenderEventCard>({
    loadContent: (card) => card,
  });

  return {
    cardTooltipState: {
      card: session.content,
      anchorElement: session.anchorElement,
      status: session.status,
      interactionOwner: session.interactionOwner,
      revision: session.revision,
    },
    onCardHoverStart: session.startHover,
    onCardHoverEnd: session.endHover,
    onCardTooltipPointerEnter: session.onPopoverPointerEnter,
    onCardTooltipPointerLeave: session.onPopoverPointerLeave,
    invalidateCardTooltip: session.invalidate,
    dismissCardTooltip: session.dismiss,
  };
}
