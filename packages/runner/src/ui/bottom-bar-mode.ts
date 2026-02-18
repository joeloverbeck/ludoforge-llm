import type { GameStore } from '../store/game-store.js';

export type ChoicePanelMode = 'choicePending' | 'choiceConfirm';

export type BottomBarState =
  | { readonly kind: 'hidden' }
  | { readonly kind: 'actions' }
  | { readonly kind: ChoicePanelMode }
  | { readonly kind: 'aiTurn' };

function isActivePlayerHuman(renderModel: NonNullable<GameStore['renderModel']>): boolean {
  const activePlayer = renderModel.players.find((player) => player.id === renderModel.activePlayerID);
  return activePlayer?.isHuman === true;
}

export function deriveBottomBarState(
  renderModel: GameStore['renderModel'],
  selectedAction: GameStore['selectedAction'],
  partialMove: GameStore['partialMove'],
): BottomBarState {
  if (renderModel == null) {
    return { kind: 'hidden' };
  }

  if (!isActivePlayerHuman(renderModel)) {
    return { kind: 'aiTurn' };
  }

  switch (renderModel.choiceUi.kind) {
    case 'discreteOne':
    case 'discreteMany':
    case 'numeric':
      return { kind: 'choicePending' };
    case 'confirmReady':
      if (selectedAction != null && partialMove != null) {
        return { kind: 'choiceConfirm' };
      }
      return { kind: 'actions' };
    case 'none':
      break;
  }

  return { kind: 'actions' };
}
