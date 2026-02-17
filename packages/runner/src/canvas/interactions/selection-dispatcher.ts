import type { GameStore } from '../../store/game-store';

export type CanvasSelectionTarget =
  | { readonly type: 'zone'; readonly id: string }
  | { readonly type: 'token'; readonly id: string };

export function dispatchCanvasSelection(store: GameStore, target: CanvasSelectionTarget): void {
  store.chooseOne(target.id);
}
