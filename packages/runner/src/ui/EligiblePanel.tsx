import type { CSSProperties, ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderRuntimeEligibleFaction } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { buildFactionColorValue } from './faction-color-style.js';
import styles from './EligiblePanel.module.css';

interface EligiblePanelProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_ELIGIBLE: readonly RenderRuntimeEligibleFaction[] = [];

function buildEntryStyle(factionId: string, index: number): CSSProperties {
  const colorValue = buildFactionColorValue(factionId, index);
  return { color: colorValue, borderColor: colorValue };
}

export function EligiblePanel({ store }: EligiblePanelProps): ReactElement | null {
  const runtimeEligible = useStore(store, (state) => state.renderModel?.runtimeEligible ?? EMPTY_ELIGIBLE);

  if (runtimeEligible.length === 0) {
    return null;
  }

  return (
    <section className={styles.container} data-testid="eligible-panel" aria-label="Eligible factions">
      <h3 className={styles.heading}>Eligible</h3>
      <ul className={styles.list}>
        {runtimeEligible.map((entry) => (
          <li
            key={entry.seatId}
            className={styles.entry}
            style={buildEntryStyle(entry.factionId, entry.seatIndex)}
            data-testid={`eligible-faction-${entry.seatId}`}
          >
            {entry.displayName}
          </li>
        ))}
      </ul>
    </section>
  );
}
