import { useCallback } from 'react';

import type { AnnotatedActionDescription } from '@ludoforge/engine/runtime';

import type { GameBridge } from '../bridge/game-bridge.js';
import { hasDisplayableContent } from './has-displayable-content.js';
import { useHoverPopoverSession } from './useHoverPopoverSession.js';

export interface ActionTooltipState {
  readonly actionId: string | null;
  readonly description: AnnotatedActionDescription | null;
  readonly loading: boolean;
  readonly anchorElement: HTMLElement | null;
  readonly status: 'idle' | 'pending' | 'visible';
  readonly interactionOwner: 'source' | 'popover' | 'grace' | null;
  readonly revision: number;
}

interface ActionTooltipSource {
  readonly actionId: string;
  readonly actorPlayer: number | undefined;
}

export function useActionTooltip(bridge: GameBridge): {
  readonly tooltipState: ActionTooltipState;
  readonly onActionHoverStart: (actionId: string, element: HTMLElement, actorPlayer?: number) => void;
  readonly onActionHoverEnd: () => void;
  readonly onTooltipPointerEnter: () => void;
  readonly onTooltipPointerLeave: () => void;
  readonly invalidateActionTooltip: () => void;
  readonly dismissActionTooltip: () => void;
} {
  const session = useHoverPopoverSession<ActionTooltipSource, AnnotatedActionDescription | null>({
    loadContent: async (source) => {
      const context = source.actorPlayer != null ? { actorPlayer: source.actorPlayer } : undefined;
      const result = await bridge.describeAction(source.actionId, context);
      return result != null && hasDisplayableContent(result) ? result : null;
    },
  });

  const onActionHoverStart = useCallback((actionId: string, element: HTMLElement, actorPlayer?: number) => {
    session.startHover({
      actionId,
      actorPlayer,
    }, element);
  }, [session]);

  return {
    tooltipState: {
      actionId: session.source?.actionId ?? null,
      description: session.content,
      loading: session.loading,
      anchorElement: session.anchorElement,
      status: session.status,
      interactionOwner: session.interactionOwner,
      revision: session.revision,
    },
    onActionHoverStart,
    onActionHoverEnd: session.endHover,
    onTooltipPointerEnter: session.onPopoverPointerEnter,
    onTooltipPointerLeave: session.onPopoverPointerLeave,
    invalidateActionTooltip: session.invalidate,
    dismissActionTooltip: session.dismiss,
  };
}
