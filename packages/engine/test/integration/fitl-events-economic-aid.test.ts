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

const CARD_ID = 'card-43';

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
    readonly aid?: number;
    readonly arvnResources?: number;
    readonly nvaResources?: number;
    readonly trail?: number;
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');
  const base = clearAllZones(initialState(def, 43001, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      ...(overrides?.aid === undefined ? {} : { aid: overrides.aid }),
      ...(overrides?.arvnResources === undefined ? {} : { arvnResources: overrides.arvnResources }),
      ...(overrides?.nvaResources === undefined ? {} : { nvaResources: overrides.nvaResources }),
      ...(overrides?.trail === undefined ? {} : { trail: overrides.trail }),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...overrides?.zoneTokens,
    },
  };
};

const findCard43Move = (
  def: GameDef,
  state: GameState,
  side: 'unshaded' | 'shaded',
  branch: string,
) =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && move.params.branch === branch
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countZone = (state: GameState, zoneId: string, faction: string, type: string): number =>
  (state.zones[zoneId] ?? []).filter(
    (token) => token.props.faction === faction && token.type === type,
  ).length;

describe('FITL card-43 Economic Aid', () => {
  it('offers exactly two unshaded and two shaded branch moves', () => {
    const def = compileDef();
    const state = setupState(def);

    const eventMoves = legalMoves(def, state).filter(
      (move) =>
        String(move.actionId) === 'event'
        && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
    );
    const unshadedBranches = eventMoves
      .filter((move) => move.params.side === 'unshaded')
      .map((move) => String(move.params.branch))
      .sort();
    const shadedBranches = eventMoves
      .filter((move) => move.params.side === 'shaded')
      .map((move) => String(move.params.branch))
      .sort();

    assert.deepEqual(unshadedBranches, ['return-arvn-bases-and-resources', 'return-us-bases-and-aid']);
    assert.deepEqual(shadedBranches, ['improve-trail-and-add-resources', 'improve-trail-twice']);
  });

  it('unshaded US branch returns up to 2 US bases only and grants Aid +12 (clamped)', () => {
    const def = compileDef();
    const state = setupState(def, {
      aid: 70,
      zoneTokens: {
        'out-of-play-US:none': [
          makeToken('us-base-a', 'base', 'US'),
          makeToken('us-base-b', 'base', 'US'),
          makeToken('us-base-c', 'base', 'US'),
        ],
        'out-of-play-ARVN:none': [
          makeToken('arvn-base-a', 'base', 'ARVN'),
          makeToken('arvn-base-b', 'base', 'ARVN'),
        ],
      },
    });
    const move = findCard43Move(def, state, 'unshaded', 'return-us-bases-and-aid');
    assert.notEqual(move, undefined, 'Expected card-43 unshaded US branch');

    const after = applyMove(def, state, move!).state;
    assert.equal(after.globalVars.aid, 75, 'Aid should increase by 12 and clamp to 75');
    assert.equal(countZone(after, 'out-of-play-US:none', 'US', 'base'), 1, 'US out-of-play bases should decrease by 2');
    assert.equal(countZone(after, 'available-US:none', 'US', 'base'), 2, 'US available bases should increase by 2');
    assert.equal(countZone(after, 'out-of-play-ARVN:none', 'ARVN', 'base'), 2, 'ARVN out-of-play bases should be unchanged');
    assert.equal(countZone(after, 'available-ARVN:none', 'ARVN', 'base'), 0, 'ARVN available bases should be unchanged');
  });

  it('unshaded ARVN branch returns up to 2 ARVN bases only and grants ARVN Resources +6 (clamped)', () => {
    const def = compileDef();
    const state = setupState(def, {
      arvnResources: 73,
      zoneTokens: {
        'out-of-play-ARVN:none': [makeToken('arvn-base-a', 'base', 'ARVN')],
        'out-of-play-US:none': [
          makeToken('us-base-a', 'base', 'US'),
          makeToken('us-base-b', 'base', 'US'),
        ],
      },
    });
    const move = findCard43Move(def, state, 'unshaded', 'return-arvn-bases-and-resources');
    assert.notEqual(move, undefined, 'Expected card-43 unshaded ARVN branch');

    const after = applyMove(def, state, move!).state;
    assert.equal(after.globalVars.arvnResources, 75, 'ARVN Resources should increase by 6 and clamp to 75');
    assert.equal(countZone(after, 'out-of-play-ARVN:none', 'ARVN', 'base'), 0, 'ARVN out-of-play bases should decrease by 1');
    assert.equal(countZone(after, 'available-ARVN:none', 'ARVN', 'base'), 1, 'ARVN available bases should increase by 1');
    assert.equal(countZone(after, 'out-of-play-US:none', 'US', 'base'), 2, 'US out-of-play bases should be unchanged');
    assert.equal(countZone(after, 'available-US:none', 'US', 'base'), 0, 'US available bases should be unchanged');
  });

  it('unshaded still grants aid/resources even if matching out-of-play base pool is empty', () => {
    const def = compileDef();
    const state = setupState(def, {
      aid: 10,
      arvnResources: 8,
      zoneTokens: {
        'out-of-play-US:none': [],
        'out-of-play-ARVN:none': [],
      },
    });

    const usMove = findCard43Move(def, state, 'unshaded', 'return-us-bases-and-aid');
    assert.notEqual(usMove, undefined, 'Expected card-43 unshaded US branch');
    const usAfter = applyMove(def, state, usMove!).state;
    assert.equal(usAfter.globalVars.aid, 22, 'US branch should still grant Aid +12 with zero US bases out of play');
    assert.equal(countZone(usAfter, 'available-US:none', 'US', 'base'), 0);

    const arvnMove = findCard43Move(def, state, 'unshaded', 'return-arvn-bases-and-resources');
    assert.notEqual(arvnMove, undefined, 'Expected card-43 unshaded ARVN branch');
    const arvnAfter = applyMove(def, state, arvnMove!).state;
    assert.equal(arvnAfter.globalVars.arvnResources, 14, 'ARVN branch should still grant ARVN Resources +6 with zero ARVN bases out of play');
    assert.equal(countZone(arvnAfter, 'available-ARVN:none', 'ARVN', 'base'), 0);
  });

  it('shaded improve-trail-twice branch increases trail by 2 with max-track clamp', () => {
    const def = compileDef();
    const state = setupState(def, { trail: 3 });
    const move = findCard43Move(def, state, 'shaded', 'improve-trail-twice');
    assert.notEqual(move, undefined, 'Expected card-43 shaded improve-trail-twice branch');

    const after = applyMove(def, state, move!).state;
    assert.equal(after.globalVars.trail, 4, 'Trail should clamp at max 4 when improved twice from 3');
  });

  it('shaded trail+resources branch improves trail by 1 and adds +10 NVA resources (both clamped)', () => {
    const def = compileDef();
    const state = setupState(def, { trail: 4, nvaResources: 70 });
    const move = findCard43Move(def, state, 'shaded', 'improve-trail-and-add-resources');
    assert.notEqual(move, undefined, 'Expected card-43 shaded trail+resources branch');

    const after = applyMove(def, state, move!).state;
    assert.equal(after.globalVars.trail, 4, 'Trail should remain at max 4');
    assert.equal(after.globalVars.nvaResources, 75, 'NVA Resources should increase by 10 and clamp to 75');
  });
});
