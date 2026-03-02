import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asPlayerId } from '../../../src/kernel/branded.js';
import { createSeatResolutionContext } from '../../../src/kernel/seat-resolution.js';
import { requireCardDrivenActiveSeat } from '../../../src/kernel/turn-flow-runtime-invariants.js';
import type { GameDef, GameState } from '../../../src/kernel/types.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const makeDef = (): GameDef =>
  ({
    metadata: { id: 'turn-flow-runtime-invariants-test', players: { min: 2, max: 2 } },
    seats: [{ id: 'us' }, { id: 'nva' }],
    constants: {},
    globalVars: [],
    perPlayerVars: [],
    zones: [],
    tokenTypes: [],
    setup: [],
    turnStructure: { phases: [{ id: 'main' }] },
    actions: [],
    triggers: [],
    terminal: { conditions: [] },
    turnOrder: {
      type: 'cardDriven',
      config: {
        turnFlow: {
          cardLifecycle: { played: 'played:none', lookahead: 'lookahead:none', leader: 'leader:none' },
          eligibility: { seats: ['US', 'NVA'], overrideWindows: [] },
          optionMatrix: [],
          passRewards: [],
          durationWindows: ['turn', 'nextTurn', 'round', 'cycle'],
        },
      },
    },
  }) as unknown as GameDef;

const makeState = (): GameState =>
  ({
    globalVars: {},
    perPlayerVars: {},
    zoneVars: {},
    playerCount: 2,
    zones: {},
    nextTokenOrdinal: 0,
    currentPhase: 'main',
    activePlayer: asPlayerId(1),
    turnCount: 1,
    rng: { algorithm: 'pcg-dxsm-128', version: 1, state: [0n, 1n] },
    stateHash: 0n,
    actionUsage: {},
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        seatOrder: ['US', 'NVA'],
        eligibility: { US: true, NVA: true },
        currentCard: {
          firstEligible: 'US',
          secondEligible: 'NVA',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
        pendingEligibilityOverrides: [],
      },
    },
    markers: {},
  }) as unknown as GameState;

describe('turn-flow-runtime-invariants', () => {
  it('resolves active seat using a prebuilt operation-scoped seat-resolution context', () => {
    const def = makeDef();
    const state = makeState();
    const seatResolution = createSeatResolutionContext(def, state.playerCount);

    assert.equal(
      requireCardDrivenActiveSeat(def, state, 'testSurface', seatResolution),
      'NVA',
    );
    assert.equal(
      requireCardDrivenActiveSeat(def, state, 'testSurface', seatResolution),
      'NVA',
    );
  });

  it('forbids implicit seat-resolution fallback in active-seat invariant helper', () => {
    const source = readKernelSource('src/kernel/turn-flow-runtime-invariants.ts');
    assert.doesNotMatch(
      source,
      /seatResolution\?:\s*SeatResolutionContext/u,
      'requireCardDrivenActiveSeat must require explicit seatResolution context',
    );
    assert.doesNotMatch(
      source,
      /createSeatResolutionContext\(/u,
      'turn-flow runtime invariants must not build seat-resolution context implicitly',
    );
  });
});
