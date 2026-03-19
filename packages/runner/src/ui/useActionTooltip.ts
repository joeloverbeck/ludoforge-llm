import { useCallback } from 'react';

import type { AnnotatedActionDescription } from '@ludoforge/engine/runtime';

import type { GameBridge } from '../bridge/game-bridge.js';
import type { ActionTooltipSourceKey } from './action-tooltip-source-key.js';
import { hasDisplayableContent } from './has-displayable-content.js';
import { useHoverPopoverSession } from './useHoverPopoverSession.js';

export interface ActionTooltipState {
  readonly sourceKey: ActionTooltipSourceKey | null;
  readonly description: AnnotatedActionDescription | null;
  readonly loading: boolean;
  readonly anchorElement: HTMLElement | null;
  readonly status: 'idle' | 'pending' | 'visible';
  readonly interactionOwner: 'source' | 'popover' | 'grace' | null;
  readonly revision: number;
}

export function useActionTooltip(bridge: GameBridge): {
  readonly tooltipState: ActionTooltipState;
  readonly onActionHoverStart: (sourceKey: ActionTooltipSourceKey, element: HTMLElement) => void;
  readonly onActionHoverEnd: () => void;
  readonly onTooltipPointerEnter: () => void;
  readonly onTooltipPointerLeave: () => void;
  readonly invalidateActionTooltip: () => void;
  readonly dismissActionTooltip: () => void;
} {
  const session = useHoverPopoverSession<ActionTooltipSourceKey, AnnotatedActionDescription | null>({
    loadContent: async (source) => {
      const context = source.playerId != null ? { actorPlayer: source.playerId } : undefined;
      const result = await bridge.describeAction(source.actionId, context);
      return result != null && hasDisplayableContent(result) ? result : null;
    },
  });

  const onActionHoverStart = useCallback((sourceKey: ActionTooltipSourceKey, element: HTMLElement) => {
    session.startHover(sourceKey, element);
  }, [session]);

  return {
    tooltipState: {
      sourceKey: session.source,
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
