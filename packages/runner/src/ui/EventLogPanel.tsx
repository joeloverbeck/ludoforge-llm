import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';

import { formatEventLogAsText } from '../model/format-event-log-text.js';
import type { EventLogEntry } from '../model/translate-effect-trace.js';
import { CollapsiblePanel } from './CollapsiblePanel.js';
import styles from './EventLogPanel.module.css';

type EventKind = EventLogEntry['kind'];

const EVENT_KIND_ORDER: readonly EventKind[] = ['movement', 'variable', 'trigger', 'phase', 'token', 'lifecycle'];
const EVENT_KIND_LABELS: Readonly<Record<EventKind, string>> = {
  movement: 'Movement',
  variable: 'Variable',
  trigger: 'Trigger',
  phase: 'Phase',
  token: 'Token',
  lifecycle: 'Lifecycle',
};

interface EventLogPanelProps {
  readonly entries: readonly EventLogEntry[];
  readonly onSelectEntry?: (entry: EventLogEntry) => void;
  readonly selectedEntryId?: string | null;
}

interface EventLogMoveGroup {
  readonly moveIndex: number;
  readonly entries: readonly EventLogEntry[];
}

function groupEntriesByMove(entries: readonly EventLogEntry[]): readonly EventLogMoveGroup[] {
  const groups: EventLogMoveGroup[] = [];

  for (const entry of entries) {
    const lastGroup = groups.at(-1);
    if (lastGroup !== undefined && lastGroup.moveIndex === entry.moveIndex) {
      groups[groups.length - 1] = {
        moveIndex: lastGroup.moveIndex,
        entries: [...lastGroup.entries, entry],
      };
      continue;
    }

    groups.push({
      moveIndex: entry.moveIndex,
      entries: [entry],
    });
  }

  return groups;
}

function isAtBottom(element: HTMLDivElement): boolean {
  const threshold = 8;
  return element.scrollTop + element.clientHeight >= element.scrollHeight - threshold;
}

function hasNestedTriggerEntries(entries: readonly EventLogEntry[]): boolean {
  return entries.some((entry) => entry.kind === 'trigger' && entry.depth > 0);
}

export function EventLogPanel({ entries, onSelectEntry, selectedEntryId = null }: EventLogPanelProps): ReactElement {
  const [enabledKinds, setEnabledKinds] = useState<ReadonlySet<EventKind>>(new Set(EVENT_KIND_ORDER));
  const [collapsedNestedMoves, setCollapsedNestedMoves] = useState<ReadonlySet<number>>(new Set());
  const [copyLabel, setCopyLabel] = useState<'Copy' | 'Copied!'>('Copy');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const autoScrollEnabledRef = useRef(true);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => enabledKinds.has(entry.kind)),
    [enabledKinds, entries],
  );

  const groupedEntries = useMemo(
    () => groupEntriesByMove(filteredEntries),
    [filteredEntries],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container === null || !autoScrollEnabledRef.current) {
      return;
    }

    container.scrollTop = container.scrollHeight;
  }, [filteredEntries.length]);

  const toggleKind = (kind: EventKind): void => {
    setEnabledKinds((currentKinds) => {
      const nextKinds = new Set(currentKinds);
      if (nextKinds.has(kind)) {
        nextKinds.delete(kind);
      } else {
        nextKinds.add(kind);
      }
      return nextKinds;
    });
  };

  const handleCopy = useCallback(async (): Promise<void> => {
    const text = formatEventLogAsText(filteredEntries);
    await navigator.clipboard.writeText(text);
    setCopyLabel('Copied!');
    setTimeout(() => {
      setCopyLabel('Copy');
    }, 1500);
  }, [filteredEntries]);

  const toggleNestedForMove = (moveIndex: number): void => {
    setCollapsedNestedMoves((currentMoves) => {
      const next = new Set(currentMoves);
      if (next.has(moveIndex)) {
        next.delete(moveIndex);
      } else {
        next.add(moveIndex);
      }
      return next;
    });
  };

  return (
    <CollapsiblePanel
      title="Event Log"
      panelTestId="event-log-panel"
      toggleTestId="event-log-panel-toggle"
      contentTestId="event-log-panel-content"
    >
      <div className={styles.filters} data-testid="event-log-filters">
        {EVENT_KIND_ORDER.map((kind) => {
          const enabled = enabledKinds.has(kind);
          return (
            <button
              key={kind}
              type="button"
              className={`${styles.filterButton} ${enabled ? styles.filterButtonEnabled : ''}`}
              aria-pressed={enabled}
              data-testid={`event-log-filter-${kind}`}
              onClick={() => {
                toggleKind(kind);
              }}
            >
              {EVENT_KIND_LABELS[kind]}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`${styles.copyButton} ${copyLabel === 'Copied!' ? styles.copyButtonCopied : ''}`}
        data-testid="event-log-copy"
        disabled={filteredEntries.length === 0}
        onClick={() => {
          void handleCopy();
        }}
      >
        {copyLabel}
      </button>

      <div
        ref={scrollContainerRef}
        className={styles.scrollArea}
        data-testid="event-log-scroll"
        onScroll={() => {
          const container = scrollContainerRef.current;
          if (container === null) {
            return;
          }
          autoScrollEnabledRef.current = isAtBottom(container);
        }}
      >
        {groupedEntries.length === 0 ? (
          <p className={styles.emptyState} data-testid="event-log-empty">No events yet</p>
        ) : (
          <ol className={styles.moveList} data-testid="event-log-groups">
            {groupedEntries.map((group) => {
              const moveCollapsed = collapsedNestedMoves.has(group.moveIndex);
              const moveHasNestedTriggers = hasNestedTriggerEntries(group.entries);
              const visibleEntries = moveCollapsed
                ? group.entries.filter((entry) => entry.kind !== 'trigger' || entry.depth === 0)
                : group.entries;

              return (
                <li key={`move-${group.moveIndex}`} className={styles.moveGroup} data-testid={`event-log-move-${group.moveIndex}`}>
                  <div className={styles.moveHeader}>
                    <h3 className={styles.moveTitle}>Move {group.moveIndex + 1}</h3>
                    {moveHasNestedTriggers ? (
                      <button
                        type="button"
                        className={styles.nestedToggle}
                        data-testid={`event-log-move-${group.moveIndex}-toggle-nested`}
                        onClick={() => {
                          toggleNestedForMove(group.moveIndex);
                        }}
                      >
                        {moveCollapsed ? 'Show nested triggers' : 'Hide nested triggers'}
                      </button>
                    ) : null}
                  </div>
                  <ul className={styles.entryList}>
                    {visibleEntries.map((entry) => (
                      <li
                        key={entry.id}
                        className={styles.entry}
                        data-testid={`event-log-entry-${entry.id}`}
                        style={{ paddingInlineStart: `${entry.kind === 'trigger' ? entry.depth * 10 : 0}px` }}
                      >
                        <button
                          type="button"
                          className={`${styles.entryButton} ${selectedEntryId === entry.id ? styles.entryButtonSelected : ''}`}
                          data-testid={`event-log-entry-button-${entry.id}`}
                          onClick={() => {
                            onSelectEntry?.(entry);
                          }}
                        >
                          <span className={styles.kind}>{EVENT_KIND_LABELS[entry.kind]}</span>
                          <span className={styles.message}>{entry.message}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </CollapsiblePanel>
  );
}
