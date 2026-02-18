import type { ReactElement } from 'react';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderLastingEffect } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { CollapsiblePanel } from './CollapsiblePanel.js';
import styles from './ActiveEffectsPanel.module.css';

interface ActiveEffectsPanelProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_EFFECTS: readonly RenderLastingEffect[] = [];

export function ActiveEffectsPanel({ store }: ActiveEffectsPanelProps): ReactElement | null {
  const activeEffects = useStore(store, (state) => state.renderModel?.activeEffects ?? EMPTY_EFFECTS);

  if (activeEffects.length === 0) {
    return null;
  }

  return (
    <CollapsiblePanel
      title="Active Effects"
      panelTestId="active-effects-panel"
      toggleTestId="active-effects-toggle"
      contentTestId="active-effects-content"
    >
      <ul className={styles.list} data-testid="active-effects-list">
        {activeEffects.map((effect) => (
          <li key={effect.id} className={styles.row} data-testid={`active-effect-${effect.id}`}>
            <p className={styles.displayName}>{effect.displayName}</p>
            <dl className={styles.metaList}>
              {effect.attributes.map((attribute) => (
                <div key={attribute.key} className={styles.metaItem}>
                  <dt className={styles.metaLabel}>{attribute.label}</dt>
                  <dd className={styles.metaValue}>{attribute.value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </CollapsiblePanel>
  );
}
