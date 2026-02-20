import { groupEntriesByMove } from './event-log-grouping.js';
import type { EventLogEntry } from './translate-effect-trace.js';

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

  const groups = groupEntriesByMove(entries);

  return groups
    .map((group) => {
      const header = `--- Move ${group.moveIndex + 1} ---`;
      const lines = group.entries.map(formatEntry);
      return [header, ...lines].join('\n');
    })
    .join('\n\n');
}
