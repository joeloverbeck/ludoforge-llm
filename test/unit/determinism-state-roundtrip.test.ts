import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPhaseId, asPlayerId, assertStateRoundTrip } from '../../src/kernel/index.js';
import type { GameState } from '../../src/kernel/index.js';

const fixtureState: GameState = {
  globalVars: { round: 2, energy: 7 },
  perPlayerVars: {
    '0': { vp: 3, mana: 1 },
    '1': { vp: 4, mana: 2 },
  },
  playerCount: 2,
  zones: {
    'deck:none': [],
    'hand:none': [],
  },
  currentPhase: asPhaseId('main'),
  activePlayer: asPlayerId(1),
  turnCount: 5,
  rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0x10n, 0x21n] },
  stateHash: 0xabcdefn,
  actionUsage: {
    pass: { turnCount: 1, phaseCount: 1, gameCount: 3 },
  },
};

describe('determinism state round-trip helper', () => {
  it('assertStateRoundTrip passes for representative game state', () => {
    assert.doesNotThrow(() => assertStateRoundTrip(fixtureState));
  });

  it('assertStateRoundTrip surfaces serializer constraints', () => {
    const invalidState: GameState = {
      ...fixtureState,
      stateHash: -1n,
    };

    assert.throws(() => assertStateRoundTrip(invalidState), /Expected non-negative bigint/);
  });
});
