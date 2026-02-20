import type { EventLogEntry } from './translate-effect-trace.js';

export interface EventLogMoveGroup {
  readonly moveIndex: number;
  readonly entries: readonly EventLogEntry[];
}

export function groupEntriesByMove(entries: readonly EventLogEntry[]): readonly EventLogMoveGroup[] {
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
