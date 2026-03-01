import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildSeatResolutionIndex,
  normalizeSeatKey,
  resolvePlayerIndexForSeatValue,
  resolvePlayerIndexForTurnFlowSeat,
  resolveTurnFlowSeatForPlayerIndex,
} from '../../../src/kernel/index.js';
import type { GameDef } from '../../../src/kernel/types.js';

describe('seat-resolution helpers', () => {
  it('normalizes seat keys consistently', () => {
    assert.equal(normalizeSeatKey(' US-ARVN '), 'usarvn');
    assert.equal(normalizeSeatKey('NVA'), 'nva');
  });

  it('resolves player indices across seat ids, mapped card seat keys, and normalized values', () => {
    const def = {
      seats: [{ id: 'us' }, { id: 'nva' }],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardSeatOrderMapping: {
              US: 'us',
              NVA: 'nva',
            },
          },
        },
      },
    } as unknown as Pick<GameDef, 'seats' | 'turnOrder'>;

    const index = buildSeatResolutionIndex(def, 2);
    assert.equal(resolvePlayerIndexForSeatValue('US', index), 0);
    assert.equal(resolvePlayerIndexForSeatValue('nva', index), 1);
    assert.equal(resolvePlayerIndexForSeatValue('N-V-A', index), 1);
    assert.equal(resolvePlayerIndexForSeatValue('1', index), null);
    assert.equal(resolvePlayerIndexForSeatValue('unknown', index), null);
  });

  it('resolves turn-flow seats using only the provided prebuilt index', () => {
    const def = {
      seats: [{ id: 'us' }, { id: 'nva' }],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            eligibility: { seats: ['US', 'NVA'], overrideWindows: [] },
          },
        },
      },
    } as unknown as Pick<GameDef, 'seats' | 'turnOrder'>;

    const index = buildSeatResolutionIndex(def, 2);
    assert.equal(resolvePlayerIndexForTurnFlowSeat('US', index), 0);
    assert.equal(resolveTurnFlowSeatForPlayerIndex(['US', 'NVA'], 0, index), 'US');
    assert.equal(resolvePlayerIndexForTurnFlowSeat('1', index), null);
    assert.equal(resolveTurnFlowSeatForPlayerIndex(['0', '1'], 1, index), null);
  });

  it('keeps resolver behavior deterministic for repeated lookups against the same index', () => {
    const def = {
      seats: [{ id: 'us' }, { id: 'nva' }],
      turnOrder: {
        type: 'cardDriven',
        config: {
          turnFlow: {
            cardSeatOrderMapping: {
              US: 'us',
              NVA: 'nva',
            },
          },
        },
      },
    } as unknown as Pick<GameDef, 'seats' | 'turnOrder'>;

    const index = buildSeatResolutionIndex(def, 2);
    assert.equal(resolvePlayerIndexForTurnFlowSeat('US', index), 0);
    assert.equal(resolvePlayerIndexForTurnFlowSeat('US', index), 0);
    assert.equal(resolveTurnFlowSeatForPlayerIndex(['US', 'NVA'], 1, index), 'NVA');
    assert.equal(resolveTurnFlowSeatForPlayerIndex(['US', 'NVA'], 1, index), 'NVA');
  });
});
