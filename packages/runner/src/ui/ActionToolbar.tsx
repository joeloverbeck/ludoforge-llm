import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { GameStore } from '../store/game-store.js';
import styles from './ActionToolbar.module.css';

interface ActionToolbarProps {
  readonly store: StoreApi<GameStore>;
}

type SelectActionId = Parameters<GameStore['selectAction']>[0];

function canRenderToolbar(renderModel: GameStore['renderModel']): boolean {
  if (renderModel == null || renderModel.choiceType !== null) {
    return false;
  }

  const activePlayer = renderModel.players.find((player) => player.id === renderModel.activePlayerID);
  if (activePlayer?.isHuman !== true) {
    return false;
  }

  return renderModel.actionGroups.some((group) => group.actions.length > 0);
}

export function ActionToolbar({ store }: ActionToolbarProps): ReactElement | null {
  const renderModel = useStore(store, (state) => state.renderModel);
  const selectedAction = useStore(store, (state) => state.selectedAction);

  if (!canRenderToolbar(renderModel) || selectedAction !== null) {
    return null;
  }
  const toolbarModel = renderModel as NonNullable<GameStore['renderModel']>;

  let hint = 1;

  return (
    <section className={styles.toolbar} aria-label="Available actions" data-testid="action-toolbar">
      {toolbarModel.actionGroups.map((group) => (
        <div key={group.groupName} className={styles.group} data-testid={`action-group-${group.groupName}`}>
          <p className={styles.groupLabel}>{group.groupName}</p>
          <div className={styles.groupActions}>
            {group.actions.map((action) => {
              const displayHint = hint;
              hint += 1;
              const actionId = action.actionId as SelectActionId;

              return (
                <button
                  key={`${group.groupName}:${action.actionId}`}
                  type="button"
                  className={styles.actionButton}
                  disabled={!action.isAvailable}
                  aria-disabled={action.isAvailable ? undefined : 'true'}
                  data-testid={`action-${action.actionId}`}
                  onClick={() => {
                    if (!action.isAvailable) {
                      return;
                    }
                    void store.getState().selectAction(actionId);
                  }}
                >
                  <span className={styles.hint}>{displayHint}</span>
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
