import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeTierAdmissibility,
  type PrioritizedTierEntry,
} from '../../../src/kernel/prioritized-tier-legality.js';

describe('prioritized tier legality', () => {
  it('returns only the first non-exhausted tier when qualifier mode is disabled', () => {
    const tiers: readonly (readonly PrioritizedTierEntry[])[] = [
      [{ value: 'available-a' }, { value: 'available-b' }],
      [{ value: 'map-a' }, { value: 'map-b' }],
      [{ value: 'reserve-a' }],
    ];

    assert.deepEqual(
      computeTierAdmissibility(tiers, [], 'none'),
      {
        admissibleValues: ['available-a', 'available-b'],
        activeTierIndices: [0],
      },
    );

    assert.deepEqual(
      computeTierAdmissibility(tiers, ['available-a', 'available-b'], 'none'),
      {
        admissibleValues: ['map-a', 'map-b'],
        activeTierIndices: [1],
      },
    );
  });

  it('returns no active tiers when every value is already selected', () => {
    const tiers: readonly (readonly PrioritizedTierEntry[])[] = [
      [{ value: 'a' }],
      [{ value: 'b' }],
    ];

    assert.deepEqual(
      computeTierAdmissibility(tiers, ['a', 'b'], 'none'),
      {
        admissibleValues: [],
        activeTierIndices: [],
      },
    );
  });

  it('unlocks qualifiers independently across tiers', () => {
    const tiers: readonly (readonly PrioritizedTierEntry[])[] = [
      [
        { value: 'available-troop-1', qualifier: 'troop' },
        { value: 'available-troop-2', qualifier: 'troop' },
        { value: 'available-police-1', qualifier: 'police' },
      ],
      [
        { value: 'map-troop-1', qualifier: 'troop' },
        { value: 'map-troop-2', qualifier: 'troop' },
        { value: 'map-police-1', qualifier: 'police' },
        { value: 'map-base-1', qualifier: 'base' },
      ],
      [
        { value: 'reserve-base-1', qualifier: 'base' },
      ],
    ];

    assert.deepEqual(
      computeTierAdmissibility(tiers, [], 'byQualifier'),
      {
        admissibleValues: [
          'available-troop-1',
          'available-troop-2',
          'available-police-1',
          'map-base-1',
        ],
        activeTierIndices: [0, 1],
      },
    );
  });

  it('unlocks lower-tier values for one qualifier without affecting others', () => {
    const tiers: readonly (readonly PrioritizedTierEntry[])[] = [
      [
        { value: 'available-troop-1', qualifier: 'troop' },
        { value: 'available-police-1', qualifier: 'police' },
      ],
      [
        { value: 'map-troop-1', qualifier: 'troop' },
        { value: 'map-troop-2', qualifier: 'troop' },
        { value: 'map-police-1', qualifier: 'police' },
      ],
    ];

    assert.deepEqual(
      computeTierAdmissibility(tiers, ['available-troop-1'], 'byQualifier'),
      {
        admissibleValues: [
          'available-police-1',
          'map-troop-1',
          'map-troop-2',
        ],
        activeTierIndices: [0, 1],
      },
    );
  });

  it('keeps all values from the active tier for a qualifier admissible together', () => {
    const tiers: readonly (readonly PrioritizedTierEntry[])[] = [
      [{ value: 'available-troop-1', qualifier: 'troop' }],
      [
        { value: 'map-troop-1', qualifier: 'troop' },
        { value: 'map-troop-2', qualifier: 'troop' },
      ],
    ];

    assert.deepEqual(
      computeTierAdmissibility(tiers, ['available-troop-1'], 'byQualifier'),
      {
        admissibleValues: ['map-troop-1', 'map-troop-2'],
        activeTierIndices: [1],
      },
    );
  });
});
