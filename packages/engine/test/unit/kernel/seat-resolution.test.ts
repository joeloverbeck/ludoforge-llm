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
    assert.equal(resolvePlayerIndexForSeatValue('US', 2, index), 0);
    assert.equal(resolvePlayerIndexForSeatValue('nva', 2, index), 1);
    assert.equal(resolvePlayerIndexForSeatValue('N-V-A', 2, index), 1);
    assert.equal(resolvePlayerIndexForSeatValue('1', 2, index), null);
    assert.equal(resolvePlayerIndexForSeatValue('unknown', 2, index), null);
  });

  it('does not resolve turn-flow seats through index-position fallback aliases', () => {
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

    assert.equal(resolvePlayerIndexForTurnFlowSeat(def, 2, 'US'), 0);
    assert.equal(resolveTurnFlowSeatForPlayerIndex(def, 2, ['US', 'NVA'], 0), 'US');
    assert.equal(resolvePlayerIndexForTurnFlowSeat(def, 2, '1'), null);
    assert.equal(resolveTurnFlowSeatForPlayerIndex(def, 2, ['0', '1'], 1), null);
  });
});
