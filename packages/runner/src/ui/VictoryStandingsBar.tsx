import {
  useContext,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { StoreApi } from 'zustand';
import { useStore } from 'zustand';

import type { RenderComponentBreakdown, RenderVictoryStandingEntry } from '../model/render-model.js';
import type { GameStore } from '../store/game-store.js';
import { VisualConfigContext } from '../config/visual-config-context.js';
import { buildFactionColorValue } from './faction-color-style.js';
import { formatIdAsDisplayName } from '../utils/format-display-name.js';
import { applyDetailTemplate } from '../utils/apply-detail-template.js';
import styles from './VictoryStandingsBar.module.css';

const EMPTY_STANDINGS: readonly RenderVictoryStandingEntry[] = [];
const DEFAULT_DETAIL_TEMPLATE = '{contribution}';

interface TooltipState {
  readonly entry: RenderVictoryStandingEntry;
  readonly rect: DOMRect;
}

export function VictoryStandingsBar({ store }: { readonly store: StoreApi<GameStore> }): ReactElement | null {
  const standings = useStore(store, (state) => state.renderModel?.victoryStandings ?? EMPTY_STANDINGS);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  if (standings.length === 0) {
    return null;
  }

  const handleEntryPointerEnter = (entry: RenderVictoryStandingEntry, element: HTMLDivElement): void => {
    setTooltip({ entry, rect: element.getBoundingClientRect() });
  };

  const handleEntryPointerLeave = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && tooltipRef.current?.contains(nextTarget)) {
      return;
    }
    setTooltip(null);
  };

  const handleTooltipPointerLeave = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const nextTarget = event.relatedTarget;
    if (
      nextTarget instanceof HTMLElement
      && tooltip !== null
      && nextTarget.closest(`[data-victory-seat="${tooltip.entry.seat}"]`) !== null
    ) {
      return;
    }
    setTooltip(null);
  };

  return (
    <div className={styles.bar} data-testid="victory-standings-bar">
      {standings.map((entry, index) => (
        <VictoryEntry
          key={entry.seat}
          entry={entry}
          index={index}
          isLast={index === standings.length - 1}
          onPointerEnter={handleEntryPointerEnter}
          onPointerLeave={handleEntryPointerLeave}
        />
      ))}
      {tooltip !== null && createPortal(
        <VictoryTooltip
          key={tooltip.entry.seat}
          entry={tooltip.entry}
          anchorRect={tooltip.rect}
          tooltipRef={tooltipRef}
          onPointerLeave={handleTooltipPointerLeave}
        />,
        document.body,
      )}
    </div>
  );
}

interface VictoryEntryProps {
  readonly entry: RenderVictoryStandingEntry;
  readonly index: number;
  readonly isLast: boolean;
  readonly onPointerEnter: (entry: RenderVictoryStandingEntry, element: HTMLDivElement) => void;
  readonly onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

function VictoryEntry({ entry, index, isLast, onPointerEnter, onPointerLeave }: VictoryEntryProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const isWinning = entry.score >= entry.threshold;
  const factionColor = buildFactionColorValue(entry.seat, index);

  const handlePointerEnter = (): void => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    onPointerEnter(entry, el);
  };

  return (
    <>
      <div
        ref={ref}
        className={`${styles.entry} ${isWinning ? styles.winning : ''}`}
        style={{ color: factionColor }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={onPointerLeave}
        data-victory-seat={entry.seat}
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
  readonly tooltipRef: RefObject<HTMLDivElement | null>;
  readonly onPointerLeave: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

interface TooltipRow {
  readonly componentId: RenderComponentBreakdown['componentId'];
  readonly label: string;
  readonly description: string | undefined;
  readonly detailTemplate: string | undefined;
  readonly breakdown: RenderComponentBreakdown;
}

function VictoryTooltip({ entry, anchorRect, tooltipRef, onPointerLeave }: VictoryTooltipProps): ReactElement {
  const visualConfig = useContext(VisualConfigContext);
  const breakdown = visualConfig?.getVictoryTooltipBreakdown(entry.seat) ?? null;
  const [expandedIndices, setExpandedIndices] = useState<ReadonlySet<RenderComponentBreakdown['componentId']>>(
    () => new Set<RenderComponentBreakdown['componentId']>(),
  );

  const top = anchorRect.bottom;
  const left = anchorRect.left + anchorRect.width / 2;

  const displayName = visualConfig?.getFactionDisplayName(entry.seat)
    ?? formatIdAsDisplayName(entry.seat);
  const componentMetadataById = new Map(
    (breakdown?.components ?? []).map((component) => [component.componentId, component] as const),
  );
  const rows: readonly TooltipRow[] = breakdown === null
    ? []
    : entry.components.map((component) => ({
      componentId: component.componentId,
      label: componentMetadataById.get(component.componentId)?.label ?? formatIdAsDisplayName(component.componentId),
      description: componentMetadataById.get(component.componentId)?.description,
      detailTemplate: componentMetadataById.get(component.componentId)?.detailTemplate,
      breakdown: component,
    }));

  const toggleExpanded = (componentId: RenderComponentBreakdown['componentId']): void => {
    setExpandedIndices((current) => {
      const next = new Set(current);
      if (next.has(componentId)) {
        next.delete(componentId);
      } else {
        next.add(componentId);
      }
      return next;
    });
  };

  return (
    <div
      ref={tooltipRef}
      className={styles.tooltip}
      style={{ top, left, transform: 'translateX(-50%)' }}
      onPointerLeave={onPointerLeave}
      data-testid={`victory-tooltip-${entry.seat}`}
    >
      <div className={styles.tooltipPanel}>
        <div className={styles.tooltipTitle}>
          {displayName} &mdash; {entry.score} / {entry.threshold}
        </div>
        {breakdown !== null && rows.length > 0 ? (
          <>
            {rows.map((row) => {
              const isExpanded = expandedIndices.has(row.componentId);
              const hasSpaces = row.breakdown.spaces.length > 0;
              const contributingSpaces = [...row.breakdown.spaces]
                .filter((space) => space.contribution > 0)
                .sort((leftSpace, rightSpace) => rightSpace.contribution - leftSpace.contribution);

              return (
                <div key={row.componentId}>
                  <div className={styles.tooltipRow}>
                    <div className={styles.tooltipRowLabel}>
                      {hasSpaces ? (
                        <button
                          type="button"
                          className={styles.toggle}
                          onClick={() => toggleExpanded(row.componentId)}
                          aria-expanded={isExpanded}
                          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${row.label}`}
                        >
                          {isExpanded ? '▼' : '▶'}
                        </button>
                      ) : (
                        <span className={styles.toggleSpacer} aria-hidden="true" />
                      )}
                      <span className={styles.tooltipLabel}>{row.label}</span>
                    </div>
                    <span className={styles.tooltipValue}>{row.breakdown.aggregate}</span>
                  </div>
                  {row.description !== undefined && (
                    <div className={styles.tooltipDescription}>{row.description}</div>
                  )}
                  {isExpanded && hasSpaces ? (
                    <div
                      className={styles.breakdownList}
                      data-testid={`victory-breakdown-${entry.seat}-${row.componentId}`}
                    >
                      {contributingSpaces.map((space) => (
                        <div key={space.spaceId} className={styles.breakdownItem}>
                          <span className={styles.breakdownSpace}>{space.displayName}</span>
                          <span className={styles.breakdownDetail}>
                            {applyDetailTemplate(
                              row.detailTemplate ?? DEFAULT_DETAIL_TEMPLATE,
                              space.factors,
                              space.contribution,
                            )}
                          </span>
                        </div>
                      ))}
                      <div className={styles.breakdownSummary}>
                        ({contributingSpaces.length} of {row.breakdown.spaces.length} spaces contribute)
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
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
    </div>
  );
}
