import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { PlayerId } from '@ludoforge/engine/runtime';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderVariable } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { CollapsiblePanel } from './CollapsiblePanel.js';
import styles from './VariablesPanel.module.css';

interface VariablesPanelProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_GLOBAL_VARS: readonly RenderVariable[] = [];
const EMPTY_PLAYER_VARS: ReadonlyMap<PlayerId, readonly RenderVariable[]> = new Map();

function buildGlobalVariableKey(name: string): string {
  return `global:${name}`;
}

function buildPlayerVariableKey(playerId: PlayerId, name: string): string {
  return `player:${String(playerId)}:${name}`;
}

function mapVariableValues(
  globalVars: readonly RenderVariable[],
  playerVars: ReadonlyMap<PlayerId, readonly RenderVariable[]>,
): Map<string, string> {
  const values = new Map<string, string>();

  for (const variable of globalVars) {
    values.set(buildGlobalVariableKey(variable.name), String(variable.value));
  }

  for (const [playerId, variables] of playerVars.entries()) {
    for (const variable of variables) {
      values.set(buildPlayerVariableKey(playerId, variable.name), String(variable.value));
    }
  }

  return values;
}

function deriveChangedKeys(currentValues: ReadonlyMap<string, string>, previousValues: ReadonlyMap<string, string>): Set<string> {
  const changedKeys = new Set<string>();

  for (const [key, value] of currentValues.entries()) {
    const previous = previousValues.get(key);
    if (previous !== undefined && previous !== value) {
      changedKeys.add(key);
    }
  }

  return changedKeys;
}

function hasVariableData(
  globalVars: readonly unknown[],
  playerVars: ReadonlyMap<PlayerId, readonly unknown[]>,
): boolean {
  if (globalVars.length > 0) {
    return true;
  }

  for (const variables of playerVars.values()) {
    if (variables.length > 0) {
      return true;
    }
  }

  return false;
}

export function VariablesPanel({ store }: VariablesPanelProps): ReactElement | null {
  const globalVars = useStore(store, (state) => state.renderModel?.globalVars ?? EMPTY_GLOBAL_VARS);
  const playerVars = useStore(store, (state) => state.renderModel?.playerVars ?? EMPTY_PLAYER_VARS);

  const previousValuesRef = useRef<ReadonlyMap<string, string>>(new Map());

  const currentValues = useMemo(() => mapVariableValues(globalVars, playerVars), [globalVars, playerVars]);
  const changedKeys = useMemo(
    () => deriveChangedKeys(currentValues, previousValuesRef.current),
    [currentValues],
  );

  useEffect(() => {
    previousValuesRef.current = currentValues;
  }, [currentValues]);

  if (!hasVariableData(globalVars, playerVars)) {
    return null;
  }

  const playerEntries = Array.from(playerVars.entries()).filter(([, variables]) => variables.length > 0);

  return (
    <CollapsiblePanel
      title="Variables"
      panelTestId="variables-panel"
      toggleTestId="variables-panel-toggle"
      contentTestId="variables-panel-content"
    >
      {globalVars.length > 0 ? (
        <section className={styles.section} data-testid="variables-global-section">
          <h3 className={styles.sectionTitle}>Global</h3>
          <ul className={styles.list}>
            {globalVars.map((variable) => {
              const variableKey = buildGlobalVariableKey(variable.name);
              const rowClassName = changedKeys.has(variableKey)
                ? `${styles.row} ${styles.rowChanged}`
                : styles.row;

              return (
                <li key={variableKey} className={rowClassName} data-testid={`variable-${variableKey}`}>
                  <span className={styles.name}>{variable.displayName}</span>
                  <span className={styles.value}>{String(variable.value)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {playerEntries.length > 0 ? (
        <section className={styles.section} data-testid="variables-player-section">
          <h3 className={styles.sectionTitle}>Per Player</h3>
          {playerEntries.map(([playerId, variables]) => (
            <details key={String(playerId)} open className={styles.playerGroup} data-testid={`variables-player-${String(playerId)}`}>
              <summary className={styles.playerSummary}>Player {String(playerId)}</summary>
              <ul className={styles.list}>
                {variables.map((variable) => {
                  const variableKey = buildPlayerVariableKey(playerId, variable.name);
                  const rowClassName = changedKeys.has(variableKey)
                    ? `${styles.row} ${styles.rowChanged}`
                    : styles.row;

                  return (
                    <li key={variableKey} className={rowClassName} data-testid={`variable-${variableKey}`}>
                      <span className={styles.name}>{variable.displayName}</span>
                      <span className={styles.value}>{String(variable.value)}</span>
                    </li>
                  );
                })}
              </ul>
            </details>
          ))}
        </section>
      ) : null}
    </CollapsiblePanel>
  );
}

export { buildGlobalVariableKey, buildPlayerVariableKey, deriveChangedKeys };
