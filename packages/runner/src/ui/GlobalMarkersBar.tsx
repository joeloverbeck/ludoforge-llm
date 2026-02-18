import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderGlobalMarker } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { CollapsiblePanel } from './CollapsiblePanel.js';
import styles from './GlobalMarkersBar.module.css';

interface GlobalMarkersBarProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_GLOBAL_MARKERS: readonly RenderGlobalMarker[] = [];

function buildPossibleStatesTitle(possibleStates: readonly string[]): string {
  if (possibleStates.length === 0) {
    return 'Possible states: none';
  }

  return `Possible states: ${possibleStates.join(', ')}`;
}

export function GlobalMarkersBar({ store }: GlobalMarkersBarProps): ReactElement | null {
  const globalMarkers = useStore(store, (state) => state.renderModel?.globalMarkers ?? EMPTY_GLOBAL_MARKERS);

  if (globalMarkers.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="Global Markers"
      panelTestId="global-markers-panel"
      toggleTestId="global-markers-toggle"
      contentTestId="global-markers-content"
    >
      <ul className={styles.chipList} data-testid="global-markers-list">
        {globalMarkers.map((marker) => (
          <li
            key={marker.id}
            className={styles.chip}
            data-testid={`global-marker-${marker.id}`}
            title={buildPossibleStatesTitle(marker.possibleStates)}
          >
            <span className={styles.markerId}>{marker.id}</span>
            <span className={styles.markerState}>{marker.state}</span>
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  );
}

export { buildPossibleStatesTitle };
