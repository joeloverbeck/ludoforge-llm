import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import type { ActionTooltipSourceKey } from './action-tooltip-source-key.js';
import styles from './ActionToolbar.module.css';

interface ActionToolbarProps {
  readonly store: StoreApi<GameStore>;
  readonly surfaceRevision: number;
  readonly onActionHoverStart?: (sourceKey: ActionTooltipSourceKey, element: HTMLElement) => void;
  readonly onActionHoverEnd?: () => void;
}

type SelectActionId = Parameters<GameStore['selectAction']>[0];

function canRenderToolbar(renderModel: GameStore['renderModel']): boolean {
  if (renderModel == null) {
    return false;
  }

  return renderModel.actionGroups.some((group) => group.actions.length > 0);
}

export function ActionToolbar({ store, surfaceRevision, onActionHoverStart, onActionHoverEnd }: ActionToolbarProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);

  if (!canRenderToolbar(renderModel)) {
    return null;
  }
  const toolbarModel = renderModel as NonNullable<GameStore['renderModel']>;

  return (
    <section className={styles.toolbar} aria-label="Available actions" data-testid="action-toolbar">
      {toolbarModel.actionGroups.map((group) => (
        <div key={group.groupKey} className={styles.group} data-testid={`action-group-${group.groupKey}`}>
          <p className={styles.groupLabel}>{group.groupName}</p>
          <div className={styles.groupActions}>
            {group.actions.map((action) => {
              const actionId = action.actionId as SelectActionId;

              return (
                <button
                  key={`${group.groupKey}:${action.actionId}`}
                  type="button"
                  className={styles.actionButton}
                  disabled={!action.isAvailable}
                  aria-disabled={action.isAvailable ? undefined : 'true'}
                  data-testid={`action-${group.groupKey}-${action.actionId}`}
                  onClick={() => {
                    if (!action.isAvailable) {
                      return;
                    }
                    void store.getState().selectAction(actionId, action.actionClass);
                  }}
                  onPointerEnter={(e) => onActionHoverStart?.({
                    playerId: toolbarModel.activePlayerID != null ? Number(toolbarModel.activePlayerID) : null,
                    groupKey: group.groupKey,
                    actionId: action.actionId,
                    surfaceRevision,
                  }, e.currentTarget)}
                  onPointerLeave={() => onActionHoverEnd?.()}
                >
                  <span className={styles.label}>{action.displayName}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
