import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GameDef, GameState, Token } from '../../src/kernel/index.js';
import {
  countTokensInZone,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';

const CARD_129 = 'card-129';
const CARD_130 = 'card-130';
const AVAILABLE_ARVN = 'available-ARVN:none';
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';

const isArvnCube = (token: Token): boolean =>
  token.props.faction === 'ARVN' && (token.props.type === 'troops' || token.props.type === 'police');

const makeArvnTroops = (count: number, prefix: string): readonly Token[] =>
  Array.from({ length: count }, (_, i) => makeFitlToken(`${prefix}-trp-${i}`, 'troops', 'ARVN'));

const makeArvnPolice = (count: number, prefix: string): readonly Token[] =>
  Array.from({ length: count }, (_, i) => makeFitlToken(`${prefix}-pol-${i}`, 'police', 'ARVN'));

const globalMarkerState = (state: GameState, marker: string): string =>
  (state.globalMarkers ?? {})[marker] ?? '';

const globalVarNumber = (state: GameState, varName: string): number => {
  const value = state.globalVars[varName];
  if (typeof value !== 'number') {
    throw new Error(`Expected global var ${varName} to be numeric`);
  }
  return value;
};

const setupFailedAttemptState = (
  def: GameDef,
  options: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly activeLeader?: string;
    readonly leaderBoxCardCount?: number;
  },
): GameState =>
  setupFitlEventState(def, {
    seed: 42,
    playerCount: 4,
    turnOrderMode: 'roundRobin',
    cardIdInDiscardZone: CARD_129,
    globalMarkers: { activeLeader: options.activeLeader ?? 'minh' },
    globalVars: { leaderBoxCardCount: options.leaderBoxCardCount ?? 0 },
    zoneTokens: options.zoneTokens ?? {},
  });

describe('FITL Failed Attempt desertion (cards 129-130)', () => {
  const def = getFitlEventDef();

  it('removes floor(3/3)=1 cube from a space with 3 ARVN cubes', () => {
    const troops = makeArvnTroops(3, 'saigon');
    const state = setupFailedAttemptState(def, {
      zoneTokens: { [SAIGON]: [...troops] },
    });

    const result = runEvent(def, state, CARD_129, 'unshaded');
    const remaining = countTokensInZone(result.state, SAIGON, isArvnCube);
    assert.equal(remaining, 2, 'floor(3/3)=1 removed, 2 remain');
  });

  it('removes floor(7/3)=2 cubes from a space with 7 ARVN cubes', () => {
    const troops = makeArvnTroops(4, 'saigon');
    const police = makeArvnPolice(3, 'saigon');
    const state = setupFailedAttemptState(def, {
      zoneTokens: { [SAIGON]: [...troops, ...police] },
    });

    const result = runEvent(def, state, CARD_129, 'unshaded');
    const remaining = countTokensInZone(result.state, SAIGON, isArvnCube);
    assert.equal(remaining, 5, 'floor(7/3)=2 removed, 5 remain');
  });

  it('removes 0 cubes from a space with 2 ARVN cubes (floor(2/3)=0)', () => {
    const troops = makeArvnTroops(2, 'saigon');
    const state = setupFailedAttemptState(def, {
      zoneTokens: { [SAIGON]: [...troops] },
    });

    const result = runEvent(def, state, CARD_129, 'unshaded');
    const remaining = countTokensInZone(result.state, SAIGON, isArvnCube);
    assert.equal(remaining, 2, 'floor(2/3)=0 removed, all 2 remain');
  });

  it('skips spaces with 0 ARVN cubes', () => {
    const troops = makeArvnTroops(3, 'hue');
    const state = setupFailedAttemptState(def, {
      zoneTokens: { [HUE]: [...troops] },
    });

    const result = runEvent(def, state, CARD_129, 'unshaded');
    const saigonCount = countTokensInZone(result.state, SAIGON, isArvnCube);
    const hueCount = countTokensInZone(result.state, HUE, isArvnCube);
    assert.equal(saigonCount, 0, 'Saigon had no cubes, stays at 0');
    assert.equal(hueCount, 2, 'Hue: floor(3/3)=1 removed, 2 remain');
  });

  it('handles multiple spaces independently', () => {
    const troopsA = makeArvnTroops(6, 'saigon');
    const troopsB = makeArvnTroops(3, 'hue');
    const state = setupFailedAttemptState(def, {
      zoneTokens: {
        [SAIGON]: [...troopsA],
        [HUE]: [...troopsB],
      },
    });

    const result = runEvent(def, state, CARD_129, 'unshaded');
    const saigonCount = countTokensInZone(result.state, SAIGON, isArvnCube);
    const hueCount = countTokensInZone(result.state, HUE, isArvnCube);
    assert.equal(saigonCount, 4, 'Saigon: floor(6/3)=2 removed, 4 remain');
    assert.equal(hueCount, 2, 'Hue: floor(3/3)=1 removed, 2 remain');
  });

  it('removes from mixed troops and police', () => {
    const troops = makeArvnTroops(2, 'saigon');
    const police = makeArvnPolice(1, 'saigon');
    const state = setupFailedAttemptState(def, {
      zoneTokens: { [SAIGON]: [...troops, ...police] },
    });

    const result = runEvent(def, state, CARD_129, 'unshaded');
    const remaining = countTokensInZone(result.state, SAIGON, isArvnCube);
    assert.equal(remaining, 2, 'floor(3/3)=1 removed from mixed pool, 2 remain');
  });

  it('cubes go to available-ARVN:none', () => {
    const troops = makeArvnTroops(3, 'saigon');
    const state = setupFailedAttemptState(def, {
      zoneTokens: { [SAIGON]: [...troops] },
    });
    const availBefore = countTokensInZone(state, AVAILABLE_ARVN, isArvnCube);

    const result = runEvent(def, state, CARD_129, 'unshaded');
    const availAfter = countTokensInZone(result.state, AVAILABLE_ARVN, isArvnCube);
    assert.equal(availAfter - availBefore, 1, 'Removed cube appears in available-ARVN:none');
  });

  it('cancels Minh: activeLeader changes from minh to none', () => {
    const state = setupFailedAttemptState(def, {
      activeLeader: 'minh',
    });
    assert.equal(globalMarkerState(state, 'activeLeader'), 'minh');

    const result = runEvent(def, state, CARD_129, 'unshaded');
    assert.equal(
      globalMarkerState(result.state, 'activeLeader'),
      'none',
      'activeLeader should change from minh to none',
    );
  });

  it('does NOT cancel other leaders (Ky stays Ky)', () => {
    const state = setupFailedAttemptState(def, {
      activeLeader: 'ky',
    });
    assert.equal(globalMarkerState(state, 'activeLeader'), 'ky');

    const result = runEvent(def, state, CARD_129, 'unshaded');
    assert.equal(
      globalMarkerState(result.state, 'activeLeader'),
      'ky',
      'activeLeader should remain ky when not minh',
    );
  });

  it('leaderBoxCardCount increments by 1', () => {
    const state = setupFailedAttemptState(def, {
      leaderBoxCardCount: 0,
    });
    assert.equal(globalVarNumber(state, 'leaderBoxCardCount'), 0);

    const result = runEvent(def, state, CARD_129, 'unshaded');
    assert.equal(
      globalVarNumber(result.state, 'leaderBoxCardCount'),
      1,
      'leaderBoxCardCount should increment by 1',
    );
  });

  it('Minh +5 Aid no longer applies after cancellation (activeLeader is none)', () => {
    const state = setupFailedAttemptState(def, {
      activeLeader: 'minh',
    });

    const result = runEvent(def, state, CARD_129, 'unshaded');
    assert.equal(
      globalMarkerState(result.state, 'activeLeader'),
      'none',
      'After Failed Attempt, activeLeader is none — Minh +5 Aid bonus no longer triggers',
    );
  });

  it('card-129 and card-130 produce identical effects on identical state', () => {
    const troops = makeArvnTroops(6, 'qt');
    const makeState = (cardId: string) =>
      setupFitlEventState(def, {
        seed: 42,
        playerCount: 4,
        turnOrderMode: 'roundRobin',
        cardIdInDiscardZone: cardId,
        globalMarkers: { activeLeader: 'minh' },
        globalVars: { leaderBoxCardCount: 0 },
        zoneTokens: { [QUANG_TRI]: [...troops] },
      });

    const state129 = makeState(CARD_129);
    const state130 = makeState(CARD_130);

    const result129 = runEvent(def, state129, CARD_129, 'unshaded');
    const result130 = runEvent(def, state130, CARD_130, 'unshaded');

    assert.equal(
      countTokensInZone(result129.state, QUANG_TRI, isArvnCube),
      countTokensInZone(result130.state, QUANG_TRI, isArvnCube),
      'Both cards should remove the same number of cubes',
    );
    assert.equal(
      globalMarkerState(result129.state, 'activeLeader'),
      globalMarkerState(result130.state, 'activeLeader'),
      'Both cards should cancel Minh identically',
    );
    assert.equal(
      globalVarNumber(result129.state, 'leaderBoxCardCount'),
      globalVarNumber(result130.state, 'leaderBoxCardCount'),
      'Both cards should increment leaderBoxCardCount identically',
    );
  });
});
