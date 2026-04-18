// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-35';

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupState = (
  def: GameDef,
  overrides?: {
    readonly nvaResources?: number;
    readonly trail?: number;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');
  const base = clearAllZones(initialState(def, 35001, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(2),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      ...(overrides?.nvaResources === undefined ? {} : { nvaResources: overrides.nvaResources }),
      ...(overrides?.trail === undefined ? {} : { trail: overrides.trail }),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
    },
  };
};

const findThanhHoaMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

describe('FITL card-35 Thanh Hoa', () => {
  it('offers both unshaded and shaded event moves with the exact card text', () => {
    const def = compileDef();
    const state = setupState(def);
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(findThanhHoaMove(def, state, 'unshaded'), undefined, 'Expected unshaded Thanh Hoa move');
    assert.notEqual(findThanhHoaMove(def, state, 'shaded'), undefined, 'Expected shaded Thanh Hoa move');
    assert.equal(card?.unshaded?.text, 'Degrade the Trail by 3 boxes.');
    assert.equal(card?.shaded?.text, 'Improve Trail by 1 box. Then add three times Trail value to NVA Resources.');
  });

  it('unshaded degrades Trail by exactly 3 boxes, including the playbook case of 4 -> 1', () => {
    const def = compileDef();
    const state = setupState(def, { trail: 4 });
    const move = findThanhHoaMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-35 unshaded move');

    const after = applyMove(def, state, move!).state;
    assert.equal(after.globalVars.trail, 1, 'Unshaded should degrade Trail from 4 to 1');
    assert.equal(after.globalVars.nvaResources, state.globalVars.nvaResources, 'Unshaded should not change NVA resources');
  });

  it('unshaded clamps Trail at 0 when fewer than 3 boxes remain', () => {
    const def = compileDef();
    const state = setupState(def, { trail: 2, nvaResources: 11 });
    const move = findThanhHoaMove(def, state, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-35 unshaded move');

    const after = applyMove(def, state, move!).state;
    assert.equal(after.globalVars.trail, 0, 'Unshaded should not reduce Trail below 0');
    assert.equal(after.globalVars.nvaResources, 11, 'Unshaded should leave NVA resources unchanged');
  });

  it('shaded improves Trail first, then adds 3 times the improved Trail value to NVA resources', () => {
    const def = compileDef();
    const state = setupState(def, { trail: 2, nvaResources: 5 });
    const move = findThanhHoaMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-35 shaded move');

    const after = applyMove(def, state, move!).state;
    assert.equal(after.globalVars.trail, 3, 'Shaded should improve Trail by 1 before the resource calculation');
    assert.equal(after.globalVars.nvaResources, 14, 'Shaded should add 3 times the improved Trail value');
  });

  it('shaded uses the capped post-improvement Trail value and clamps NVA resources at 75', () => {
    const def = compileDef();
    const state = setupState(def, { trail: 4, nvaResources: 70 });
    const move = findThanhHoaMove(def, state, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-35 shaded move');

    const after = applyMove(def, state, move!).state;
    assert.equal(after.globalVars.trail, 4, 'Shaded should keep Trail capped at 4');
    assert.equal(after.globalVars.nvaResources, 75, 'Shaded should add 12 resources using capped Trail 4, then clamp at 75');
  });
});
