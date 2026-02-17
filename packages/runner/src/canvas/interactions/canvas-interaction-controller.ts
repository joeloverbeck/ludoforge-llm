import type { GameStore } from '../../store/game-store';
import type { AriaAnnouncer } from './aria-announcer';
import type { CanvasSelectionTarget } from './selection-dispatcher';
import { dispatchCanvasSelection } from './selection-dispatcher';

export interface CanvasInteractionController {
  getSelectableZoneIDs(): readonly string[];
  getFocusedZoneID(): string | null;
  onFocusChange(zoneID: string | null): void;
  onFocusAnnounce(zoneID: string): void;
  onSelectTarget(target: CanvasSelectionTarget): void;
}

export function createCanvasInteractionController(
  getStoreState: () => GameStore,
  announcer: AriaAnnouncer,
): CanvasInteractionController {
  let focusedZoneID: string | null = null;

  return {
    getSelectableZoneIDs(): readonly string[] {
      const zones = getStoreState().renderModel?.zones;
      if (zones === undefined || zones.length === 0) {
        return [];
      }

      return zones.filter((zone) => zone.isSelectable).map((zone) => zone.id);
    },
    getFocusedZoneID(): string | null {
      return focusedZoneID;
    },
    onFocusChange(zoneID: string | null): void {
      focusedZoneID = zoneID;
    },
    onFocusAnnounce(zoneID: string): void {
      const zoneLabel = getStoreState().renderModel?.zones.find((zone) => zone.id === zoneID)?.displayName ?? zoneID;
      announcer.announce(`Zone focus: ${zoneLabel}`);
    },
    onSelectTarget(target: CanvasSelectionTarget): void {
      if (target.type === 'zone') {
        focusedZoneID = target.id;
      }

      const storeState = getStoreState();
      dispatchCanvasSelection(storeState, target);
      const message = toSelectionAnnouncement(storeState, target);
      if (message !== null) {
        announcer.announce(message);
      }
    },
  };
}

function toSelectionAnnouncement(
  state: Pick<GameStore, 'renderModel'>,
  target: CanvasSelectionTarget,
): string | null {
  if (target.type === 'zone') {
    const zoneLabel = state.renderModel?.zones.find((zone) => zone.id === target.id)?.displayName ?? target.id;
    return `Zone selected: ${zoneLabel}`;
  }

  const tokenLabel = state.renderModel?.tokens.find((token) => token.id === target.id)?.type ?? target.id;
  return `Token selected: ${tokenLabel}`;
}
