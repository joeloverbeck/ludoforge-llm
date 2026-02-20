import { describe, expect, it } from 'vitest';

import type { EventLogEntry } from '../../src/model/translate-effect-trace.js';
import { formatEventLogAsText } from '../../src/model/format-event-log-text.js';

function makeEntry(overrides: Partial<EventLogEntry> & Pick<EventLogEntry, 'kind' | 'message' | 'moveIndex'>): EventLogEntry {
  return {
    id: `entry-${Math.random().toString(36).slice(2, 8)}`,
    depth: 0,
    zoneIds: [],
    tokenIds: [],
    ...overrides,
  };
}

describe('formatEventLogAsText', () => {
  it('returns empty string for empty entries', () => {
    expect(formatEventLogAsText([])).toBe('');
  });

  it('formats a single move group correctly', () => {
    const entries: EventLogEntry[] = [
      makeEntry({ kind: 'phase', message: 'Entered planning.', moveIndex: 0 }),
      makeEntry({ kind: 'variable', message: 'coins changed from 0 to 3.', moveIndex: 0 }),
    ];

    const result = formatEventLogAsText(entries);
    expect(result).toBe(
      '--- Move 1 ---\n' +
      '[phase] Entered planning.\n' +
      '[variable] coins changed from 0 to 3.',
    );
  });

  it('separates multiple move groups with blank lines', () => {
    const entries: EventLogEntry[] = [
      makeEntry({ kind: 'phase', message: 'Entered planning.', moveIndex: 0 }),
      makeEntry({ kind: 'movement', message: 'Moved pawn from A to B.', moveIndex: 1 }),
    ];

    const result = formatEventLogAsText(entries);
    expect(result).toBe(
      '--- Move 1 ---\n' +
      '[phase] Entered planning.\n' +
      '\n' +
      '--- Move 2 ---\n' +
      '[movement] Moved pawn from A to B.',
    );
  });

  it('indents nested triggers by depth', () => {
    const entries: EventLogEntry[] = [
      makeEntry({ kind: 'trigger', message: 'Triggered deploy on phase enter.', moveIndex: 0, depth: 0 }),
      makeEntry({ kind: 'trigger', message: 'Deploy completed for pawn:0.', moveIndex: 0, depth: 1 }),
      makeEntry({ kind: 'trigger', message: 'Cascade effect triggered.', moveIndex: 0, depth: 2 }),
    ];

    const result = formatEventLogAsText(entries);
    expect(result).toBe(
      '--- Move 1 ---\n' +
      '[trigger] Triggered deploy on phase enter.\n' +
      '  [trigger] Deploy completed for pawn:0.\n' +
      '    [trigger] Cascade effect triggered.',
    );
  });

  it('formats all six event kinds with correct labels', () => {
    const kinds: EventLogEntry['kind'][] = ['movement', 'variable', 'trigger', 'phase', 'token', 'lifecycle'];
    const entries: EventLogEntry[] = kinds.map((kind, index) =>
      makeEntry({ kind, message: `${kind} event.`, moveIndex: 0, id: `entry-${index}` }),
    );

    const result = formatEventLogAsText(entries);
    for (const kind of kinds) {
      expect(result).toContain(`[${kind}]`);
    }
  });

  it('does not indent non-trigger entries regardless of depth', () => {
    const entries: EventLogEntry[] = [
      makeEntry({ kind: 'variable', message: 'coins changed.', moveIndex: 0, depth: 2 }),
    ];

    const result = formatEventLogAsText(entries);
    expect(result).toBe(
      '--- Move 1 ---\n' +
      '[variable] coins changed.',
    );
  });

  it('uses 1-based move numbers in headers', () => {
    const entries: EventLogEntry[] = [
      makeEntry({ kind: 'phase', message: 'Start.', moveIndex: 4 }),
    ];

    const result = formatEventLogAsText(entries);
    expect(result).toContain('--- Move 5 ---');
  });
});
