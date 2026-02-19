import { useContext, useEffect, useMemo, useRef, type ReactElement } from 'react';
import type { PlayerId } from '@ludoforge/engine/runtime';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import { VisualConfigContext } from '../config/visual-config-context.js';
import type { VariableFormatting } from '../config/visual-config-types.js';
import type { RenderVariable } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { CollapsiblePanel } from './CollapsiblePanel.js';
import styles from './VariablesPanel.module.css';

interface VariablesPanelProps {
  readonly store: StoreApi<GameStore>;
}

const EMPTY_GLOBAL_VARS: readonly RenderVariable[] = [];
const EMPTY_PLAYER_VARS: ReadonlyMap<PlayerId, readonly RenderVariable[]> = new Map();
const EMPTY_VARIABLES: readonly VariableEntry[] = [];
const OTHER_GROUP_NAME = 'Other';

interface VariableEntry {
  readonly key: string;
  readonly playerId: PlayerId | null;
  readonly variable: RenderVariable;
}

interface VariableDisplay {
  readonly text: string;
  readonly boundedPercent: number | null;
}

interface VariableGroup {
  readonly name: string;
  readonly rows: readonly VariableEntry[];
}

function buildGlobalVariableKey(name: string): string {
  return `global:${name}`;
}

function buildPlayerVariableKey(playerId: PlayerId, name: string): string {
  return `player:${String(playerId)}:${name}`;
}

function collectVariableEntries(
  globalVars: readonly RenderVariable[],
  playerVars: ReadonlyMap<PlayerId, readonly RenderVariable[]>,
): readonly VariableEntry[] {
  const rows: VariableEntry[] = [];
  for (const variable of globalVars) {
    rows.push({
      key: buildGlobalVariableKey(variable.name),
      playerId: null,
      variable,
    });
  }

  for (const [playerId, variables] of playerVars.entries()) {
    for (const variable of variables) {
      rows.push({
        key: buildPlayerVariableKey(playerId, variable.name),
        playerId,
        variable,
      });
    }
  }

  return rows;
}

function mapVariableValues(rows: readonly VariableEntry[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const row of rows) {
    values.set(row.key, String(row.variable.value));
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

function hasVariableData(rows: readonly unknown[]): boolean {
  return rows.length > 0;
}

function formatVariableDisplay(value: number | boolean, formatting: VariableFormatting | null): VariableDisplay {
  let text: string;
  if (formatting?.type === 'enum' && typeof value === 'number' && Number.isInteger(value)) {
    const maybeLabel = formatting.labels?.[value];
    text = maybeLabel ?? String(value);
  } else {
    text = String(value);
    if (formatting?.type === 'percentage' && typeof value === 'number') {
      text = `${text}%`;
    }
  }

  if (formatting?.suffix !== undefined) {
    text = `${text}${formatting.suffix}`;
  }

  if (
    typeof value !== 'number'
    || formatting?.min === undefined
    || formatting.max === undefined
    || formatting.max <= formatting.min
  ) {
    return {
      text,
      boundedPercent: null,
    };
  }

  const bounded = ((value - formatting.min) / (formatting.max - formatting.min)) * 100;
  const boundedPercent = Math.max(0, Math.min(100, bounded));
  return {
    text,
    boundedPercent,
  };
}

function buildProminentRows(rows: readonly VariableEntry[], prominent: readonly string[] | undefined): readonly VariableEntry[] {
  if (prominent === undefined || prominent.length === 0) {
    return EMPTY_VARIABLES;
  }
  const names = new Set(prominent);
  return rows.filter((row) => names.has(row.variable.name));
}

function buildVariableGroups(rows: readonly VariableEntry[], panels: readonly { name: string; vars: readonly string[] }[] | undefined): readonly VariableGroup[] | null {
  if (panels === undefined) {
    return null;
  }

  const consumed = new Set<string>();
  const groups: VariableGroup[] = [];
  for (const panel of panels) {
    const panelVars = new Set(panel.vars);
    const panelRows = rows.filter((row) => panelVars.has(row.variable.name) && !consumed.has(row.key));
    for (const row of panelRows) {
      consumed.add(row.key);
    }
    groups.push({
      name: panel.name,
      rows: panelRows,
    });
  }

  const otherRows = rows.filter((row) => !consumed.has(row.key));
  if (otherRows.length > 0) {
    groups.push({
      name: OTHER_GROUP_NAME,
      rows: otherRows,
    });
  }
  return groups;
}

function toGroupTestId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unnamed';
}

function toRowName(row: VariableEntry, disambiguatePlayers: boolean): string {
  if (!disambiguatePlayers || row.playerId === null) {
    return row.variable.displayName;
  }
  return `Player ${String(row.playerId)} ${row.variable.displayName}`;
}

export function VariablesPanel({ store }: VariablesPanelProps): ReactElement | null {
  const globalVars = useStore(store, (state) => state.renderModel?.globalVars ?? EMPTY_GLOBAL_VARS);
  const playerVars = useStore(store, (state) => state.renderModel?.playerVars ?? EMPTY_PLAYER_VARS);
  const visualConfigProvider = useContext(VisualConfigContext);
  const variablesConfig = useMemo(() => visualConfigProvider?.getVariablesConfig() ?? null, [visualConfigProvider]);

  const previousValuesRef = useRef<ReadonlyMap<string, string>>(new Map());
  const variableRows = useMemo(() => collectVariableEntries(globalVars, playerVars), [globalVars, playerVars]);
  const prominentRows = useMemo(() => buildProminentRows(variableRows, variablesConfig?.prominent), [variableRows, variablesConfig?.prominent]);
  const groupedRows = useMemo(() => buildVariableGroups(variableRows, variablesConfig?.panels), [variableRows, variablesConfig?.panels]);

  const currentValues = useMemo(() => mapVariableValues(variableRows), [variableRows]);
  const changedKeys = useMemo(
    () => deriveChangedKeys(currentValues, previousValuesRef.current),
    [currentValues],
  );

  useEffect(() => {
    previousValuesRef.current = currentValues;
  }, [currentValues]);

  if (!hasVariableData(variableRows)) {
    return null;
  }

  const renderRow = (row: VariableEntry, options?: {
    readonly disambiguatePlayers?: boolean;
    readonly prominent?: boolean;
    readonly testIdPrefix?: string;
  }): ReactElement => {
    const rowClassNames = [styles.row];
    if (changedKeys.has(row.key)) {
      rowClassNames.push(styles.rowChanged);
    }
    if (options?.prominent === true) {
      rowClassNames.push(styles.prominent);
    }
    const format = variablesConfig?.formatting?.[row.variable.name] ?? null;
    const display = formatVariableDisplay(row.variable.value, format);

    return (
      <li
        key={`${options?.testIdPrefix ?? 'variable'}:${row.key}`}
        className={rowClassNames.join(' ')}
        data-testid={`${options?.testIdPrefix ?? 'variable'}-${row.key}`}
      >
        <span className={styles.name}>{toRowName(row, options?.disambiguatePlayers === true)}</span>
        <span className={styles.value}>{display.text}</span>
        {display.boundedPercent !== null ? (
          <span className={styles.progressBar} aria-hidden="true">
            <span className={styles.progressFill} style={{ width: `${display.boundedPercent}%` }} />
          </span>
        ) : null}
      </li>
    );
  };

  const playerEntries = Array.from(playerVars.entries()).filter(([, variables]) => variables.length > 0);

  return (
    <CollapsiblePanel
      title="Variables"
      panelTestId="variables-panel"
      toggleTestId="variables-panel-toggle"
      contentTestId="variables-panel-content"
    >
      {prominentRows.length > 0 ? (
        <section className={styles.section} data-testid="variables-prominent-section">
          <h3 className={styles.sectionTitle}>Prominent</h3>
          <ul className={styles.list}>
            {prominentRows.map((row) => renderRow(row, {
              prominent: true,
              disambiguatePlayers: true,
              testIdPrefix: 'prominent-variable',
            }))}
          </ul>
        </section>
      ) : null}

      {groupedRows !== null ? (
        groupedRows.map((group) => (
          <section
            key={group.name}
            className={styles.panelGroup}
            data-testid={`variables-panel-group-${toGroupTestId(group.name)}`}
          >
            <h3 className={styles.sectionTitle}>{group.name}</h3>
            <ul className={styles.list}>
              {group.rows.map((row) => renderRow(row, { disambiguatePlayers: true }))}
            </ul>
          </section>
        ))
      ) : (
        <>
      {globalVars.length > 0 ? (
        <section className={styles.section} data-testid="variables-global-section">
          <h3 className={styles.sectionTitle}>Global</h3>
          <ul className={styles.list}>
            {globalVars.map((variable) => renderRow({
              key: buildGlobalVariableKey(variable.name),
              playerId: null,
              variable,
            }))}
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
                {variables.map((variable) => renderRow({
                  key: buildPlayerVariableKey(playerId, variable.name),
                  playerId,
                  variable,
                }))}
              </ul>
            </details>
          ))}
        </section>
      ) : null}
        </>
      )}
    </CollapsiblePanel>
  );
}

export { buildGlobalVariableKey, buildPlayerVariableKey, deriveChangedKeys };
