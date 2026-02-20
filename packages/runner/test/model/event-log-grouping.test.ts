import { describe, expect, it } from 'vitest';

import { groupEntriesByMove } from '../../src/model/event-log-grouping.js';
import type { EventLogEntry } from '../../src/model/translate-effect-trace.js';

function makeEntry(id: string, moveIndex: number, message = id): EventLogEntry {
  return {
    id,
    kind: 'movement',
    message,
    zoneIds: [],
    tokenIds: [],
    depth: 0,
    moveIndex,
  };
}

describe('groupEntriesByMove', () => {
  it('returns no groups for empty entries', () => {
    expect(groupEntriesByMove([])).toEqual([]);
  });

  it('returns one group for entries in a single move', () => {
    const entries = [
      makeEntry('entry-0', 0),
      makeEntry('entry-1', 0),
    ];

    expect(groupEntriesByMove(entries)).toEqual([
      {
        moveIndex: 0,
        entries,
      },
    ]);
  });

  it('creates multiple groups for consecutive move boundaries', () => {
    const entries = [
      makeEntry('entry-0', 0),
      makeEntry('entry-1', 1),
      makeEntry('entry-2', 1),
      makeEntry('entry-3', 2),
    ];

    expect(groupEntriesByMove(entries)).toEqual([
      {
        moveIndex: 0,
        entries: [entries[0]],
      },
      {
        moveIndex: 1,
        entries: [entries[1], entries[2]],
      },
      {
        moveIndex: 2,
        entries: [entries[3]],
      },
    ]);
  });

  it('keeps non-consecutive move indexes as distinct consecutive groups', () => {
    const entries = [
      makeEntry('entry-0', 0),
      makeEntry('entry-1', 2),
      makeEntry('entry-2', 0),
    ];

    expect(groupEntriesByMove(entries)).toEqual([
      {
        moveIndex: 0,
        entries: [entries[0]],
      },
      {
        moveIndex: 2,
        entries: [entries[1]],
      },
      {
        moveIndex: 0,
        entries: [entries[2]],
      },
    ]);
  });
});
