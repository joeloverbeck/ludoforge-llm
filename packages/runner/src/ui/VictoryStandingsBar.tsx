import { useContext, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderVictoryStandingEntry } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { VisualConfigContext } from '../config/visual-config-context.js';
import { buildFactionColorValue } from './faction-color-style.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import styles from './VictoryStandingsBar.module.css';

const EMPTY_STANDINGS: readonly RenderVictoryStandingEntry[] = [];

interface TooltipState {
  readonly entry: RenderVictoryStandingEntry;
  readonly rect: DOMRect;
}

export function VictoryStandingsBar({ store }: { readonly store: StoreApi<GameStore> }): ReactElement | null {
  const standings = useStore(store, (state) => state.renderModel?.victoryStandings ?? EMPTY_STANDINGS);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (standings.length === 0) {
    return null;
  }

  return (
    <div className={styles.bar} data-testid="victory-standings-bar">
      {standings.map((entry, index) => (
        <VictoryEntry
          key={entry.seat}
          entry={entry}
          index={index}
          isLast={index === standings.length - 1}
          onHover={setTooltip}
        />
      ))}
      {tooltip !== null && createPortal(
        <VictoryTooltip entry={tooltip.entry} anchorRect={tooltip.rect} />,
        document.body,
      )}
    </div>
  );
}

interface VictoryEntryProps {
  readonly entry: RenderVictoryStandingEntry;
  readonly index: number;
  readonly isLast: boolean;
  readonly onHover: (state: TooltipState | null) => void;
}

function VictoryEntry({ entry, index, isLast, onHover }: VictoryEntryProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const isWinning = entry.score >= entry.threshold;
  const factionColor = buildFactionColorValue(entry.seat, index);

  const handlePointerEnter = (): void => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    onHover({ entry, rect: el.getBoundingClientRect() });
  };

  const handlePointerLeave = (): void => {
    onHover(null);
  };

  return (
    <>
      <div
        ref={ref}
        className={`${styles.entry} ${isWinning ? styles.winning : ''}`}
        style={{ color: factionColor }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        data-testid={`victory-entry-${entry.seat}`}
      >
        <span className={styles.factionDot} style={{ backgroundColor: factionColor }} />
        <span className={styles.score}>{entry.score}</span>
        <span className={styles.threshold}>/ {entry.threshold}</span>
      </div>
      {isLast ? null : <span className={styles.separator}>|</span>}
    </>
  );
}

interface VictoryTooltipProps {
  readonly entry: RenderVictoryStandingEntry;
  readonly anchorRect: DOMRect;
}

function VictoryTooltip({ entry, anchorRect }: VictoryTooltipProps): ReactElement {
  const visualConfig = useContext(VisualConfigContext);
  const breakdown = visualConfig?.getVictoryTooltipBreakdown(entry.seat) ?? null;

  const top = anchorRect.bottom + 6;
  const left = anchorRect.left + anchorRect.width / 2;

  const displayName = visualConfig?.getFactionDisplayName(entry.seat)
    ?? formatIdAsDisplayName(entry.seat);

  return (
    <div
      className={styles.tooltip}
      style={{ top, left, transform: 'translateX(-50%)' }}
      data-testid={`victory-tooltip-${entry.seat}`}
    >
      <div className={styles.tooltipTitle}>
        {displayName} &mdash; {entry.score} / {entry.threshold}
      </div>
      {breakdown !== null && entry.components.length > 0 ? (
        <>
          {breakdown.components.map((comp, i) => (
            <div key={comp.label}>
              <div className={styles.tooltipRow}>
                <span className={styles.tooltipLabel}>{comp.label}</span>
                <span className={styles.tooltipValue}>
                  {i < entry.components.length ? entry.components[i] : '?'}
                </span>
              </div>
              {comp.description !== undefined && (
                <div className={styles.tooltipDescription}>{comp.description}</div>
              )}
            </div>
          ))}
          <div className={`${styles.tooltipRow} ${styles.tooltipTotal}`}>
            <span>Total</span>
            <span className={styles.tooltipValue}>{entry.score}</span>
          </div>
        </>
      ) : (
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipLabel}>Score</span>
          <span className={styles.tooltipValue}>{entry.score}</span>
        </div>
      )}
    </div>
  );
}
