import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { makeIsolatedInitialState } from '../helpers/isolated-state-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL = getFitlProductionFixture();

const addTokenToZone = (state: GameState, zoneId: string, token: Token): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    [zoneId]: [...(state.zones[zoneId] ?? []), token],
  },
});

const makePiece = (id: string, faction: string, pieceType: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type: pieceType === 'guerrilla' ? 'guerrilla' : pieceType,
  props: { faction, type: pieceType, ...extra },
});

const makeCard = (id: string, isCoup: boolean): Token => ({
  id: asTokenId(id),
  type: 'card',
  props: { isCoup },
});

/**
 * Place a card into the lookahead zone to control monsoon activation.
 * Monsoon restrictions apply when the lookahead card has isCoup: true.
 */
const withLookaheadCard = (state: GameState, isCoup: boolean): GameState => ({
  ...state,
  zones: {
    ...state.zones,
    'lookahead:none': [makeCard('lookahead-monsoon-test', isCoup)],
  },
});

const hasActionId = (moves: readonly Move[], actionId: string): boolean =>
  moves.some((move) => String(move.actionId) === actionId);

/**
 * Build a state where US sweep would normally be legal:
 * US troops in a source space adjacent to a target space with underground guerrillas.
 */
const withSweepEligibleState = (def: GameDef): GameState => {
  const base = makeIsolatedInitialState(def, 5001, 4);
  let state: GameState = {
    ...base,
    activePlayer: asPlayerId(0),
  };
  state = addTokenToZone(state, 'da-nang:none', makePiece('sweep-us-t1', 'US', 'troops'));
  state = addTokenToZone(state, 'quang-nam:none', makePiece('sweep-target-g', 'NVA', 'guerrilla', { activity: 'underground' }));
  return state;
};

/**
 * Build a state where NVA march would normally be legal:
 * NVA guerrilla in a space with an adjacent destination.
 */
const withMarchEligibleState = (def: GameDef): GameState => {
  const base = makeIsolatedInitialState(def, 5002, 4);
  let state: GameState = {
    ...base,
    activePlayer: asPlayerId(2),
    globalVars: {
      ...base.globalVars,
      nvaResources: 10,
    },
  };
  state = addTokenToZone(state, 'quang-nam:none', makePiece('march-nva-g1', 'NVA', 'guerrilla', { activity: 'underground' }));
  return state;
};

describe('FITL monsoon production restrictions', () => {
  it('excludes sweep from legalMoves during monsoon (lookahead isCoup: true)', () => {
    assert.notEqual(FITL.gameDef, null);
    const def = FITL.compiled.gameDef!;
    const state = withLookaheadCard(withSweepEligibleState(def), true);

    const moves = legalMoves(def, state);
    assert.equal(
      hasActionId(moves, 'sweep'),
      false,
      'Sweep should be excluded from legal moves during monsoon',
    );
  });

  it('excludes march from legalMoves during monsoon (lookahead isCoup: true)', () => {
    assert.notEqual(FITL.gameDef, null);
    const def = FITL.compiled.gameDef!;
    const state = withLookaheadCard(withMarchEligibleState(def), true);

    const moves = legalMoves(def, state);
    assert.equal(
      hasActionId(moves, 'march'),
      false,
      'March should be excluded from legal moves during monsoon',
    );
  });

  it('caps airLift space params at 2 during monsoon', () => {
    assert.notEqual(FITL.gameDef, null);
    const def = FITL.compiled.gameDef!;
    const base = makeIsolatedInitialState(def, 5003, 4);
    let state: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
    };
    state = addTokenToZone(state, 'da-nang:none', makePiece('airlift-us-t1', 'US', 'troops'));
    state = withLookaheadCard(state, true);

    const moves = legalMoves(def, state);
    const airLiftMoves = moves.filter((move) => String(move.actionId) === 'airLift');

    for (const move of airLiftMoves) {
      const spacesParam = move.params.$spaces;
      if (typeof spacesParam === 'number') {
        assert.ok(spacesParam <= 2, `airLift $spaces param should be <= 2 during monsoon, got ${spacesParam}`);
      }
      if (Array.isArray(spacesParam)) {
        assert.ok(spacesParam.length <= 2, `airLift $spaces array should have <= 2 entries during monsoon, got ${spacesParam.length}`);
      }
    }
  });

  it('caps airStrike params at 2 during monsoon', () => {
    assert.notEqual(FITL.gameDef, null);
    const def = FITL.compiled.gameDef!;
    const base = makeIsolatedInitialState(def, 5004, 4);
    let state: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
    };
    state = addTokenToZone(state, 'quang-nam:none', makePiece('airstrike-nva-g', 'NVA', 'guerrilla', { activity: 'active' }));
    state = withLookaheadCard(state, true);

    const moves = legalMoves(def, state);
    const airStrikeMoves = moves.filter((move) => String(move.actionId) === 'airStrike');

    for (const move of airStrikeMoves) {
      const spacesParam = move.params.$spaces;
      const arcLightParam = move.params.$arcLightNoCoinProvinces;
      const spacesCount = typeof spacesParam === 'number' ? spacesParam : (Array.isArray(spacesParam) ? spacesParam.length : 0);
      const arcLightCount = typeof arcLightParam === 'number' ? arcLightParam : (Array.isArray(arcLightParam) ? arcLightParam.length : 0);
      assert.ok(
        spacesCount + arcLightCount <= 2,
        `airStrike combined $spaces + $arcLightNoCoinProvinces should be <= 2 during monsoon, got ${spacesCount} + ${arcLightCount}`,
      );
    }
  });

  it('allows sweep when monsoon is not active (lookahead isCoup: false)', () => {
    assert.notEqual(FITL.gameDef, null);
    const def = FITL.compiled.gameDef!;

    const sweepStateMonsoon = withLookaheadCard(withSweepEligibleState(def), true);
    const sweepStateNoMonsoon = withLookaheadCard(withSweepEligibleState(def), false);

    assert.equal(
      hasActionId(legalMoves(def, sweepStateMonsoon), 'sweep'),
      false,
      'Sweep should be blocked during monsoon',
    );
    assert.equal(
      hasActionId(legalMoves(def, sweepStateNoMonsoon), 'sweep'),
      true,
      'Sweep should be available when monsoon is not active',
    );
  });

  it('allows march when monsoon is not active (NVA active player)', () => {
    assert.notEqual(FITL.gameDef, null);
    const def = FITL.compiled.gameDef!;
    // NVA march requires the active player to be NVA — set turnOrderState to roundRobin
    // to bypass card-driven eligibility constraints while still testing monsoon filtering.
    const base = makeIsolatedInitialState(def, 5005, 4, { turnOrderMode: 'roundRobin' });
    let state: GameState = {
      ...base,
      activePlayer: asPlayerId(2),
      globalVars: {
        ...base.globalVars,
        nvaResources: 10,
      },
    };
    state = addTokenToZone(state, 'quang-nam:none', makePiece('march-rr-nva-g1', 'NVA', 'guerrilla', { activity: 'underground' }));

    const marchMoves = legalMoves(def, state);
    assert.equal(
      hasActionId(marchMoves, 'march'),
      true,
      'March should be available for NVA when monsoon is not active',
    );
  });
});
