import type { EventLogEntry } from './translate-effect-trace.js';

interface MoveGroup {
  readonly moveIndex: number;
  readonly entries: readonly EventLogEntry[];
}

function groupByMove(entries: readonly EventLogEntry[]): readonly MoveGroup[] {
  const groups: MoveGroup[] = [];

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

function formatEntry(entry: EventLogEntry): string {
  const indent = entry.kind === 'trigger' && entry.depth > 0
    ? '  '.repeat(entry.depth)
    : '';
  return `${indent}[${entry.kind}] ${entry.message}`;
}

export function formatEventLogAsText(entries: readonly EventLogEntry[]): string {
  if (entries.length === 0) {
    return '';
  }

  const groups = groupByMove(entries);

  return groups
    .map((group) => {
      const header = `--- Move ${group.moveIndex + 1} ---`;
      const lines = group.entries.map(formatEntry);
      return [header, ...lines].join('\n');
    })
    .join('\n\n');
}
