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
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const CARD_ID = 'card-51';
const NORTH_VIETNAM = 'north-vietnam:none';
const CENTRAL_LAOS = 'central-laos:none';
const NE_CAMBODIA = 'northeast-cambodia:none';
const SOUTH_SPACE = 'quang-tri-thua-thien:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extraProps?: Readonly<Record<string, string | number | boolean>>,
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...(extraProps ?? {}),
  },
});

const compileDef = (): GameDef => {
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const setupState = (
  def: GameDef,
  seed: number,
  zones: Readonly<Record<string, readonly Token[]>>,
  globals?: Readonly<{
    trail?: number;
    nvaResources?: number;
  }>,
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected first event deck');

  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...base.globalVars,
      ...(globals?.trail === undefined ? {} : { trail: globals.trail }),
      ...(globals?.nvaResources === undefined ? {} : { nvaResources: globals.nvaResources }),
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
  };
};

const findCard51Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const zoneHas = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => token.id === asTokenId(tokenId));

const countFactionType = (state: GameState, zone: string, faction: string, type: string): number =>
  (state.zones[zone] ?? []).filter((token) => token.props.faction === faction && token.type === type).length;

describe('FITL card-51 301st Supply Bn', () => {
  it('unshaded removes exactly 6 selected non-base Insurgent pieces from outside South Vietnam and routes them by faction', () => {
    const def = compileDef();
    const setup = setupState(def, 5101, {
      [NORTH_VIETNAM]: [
        makeToken('nva-t-north-1', 'troops', 'NVA'),
        makeToken('nva-t-north-2', 'troops', 'NVA'),
        makeToken('nva-g-north', 'guerrilla', 'NVA', { activity: 'underground' }),
        makeToken('vc-g-north', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('nva-base-north', 'base', 'NVA'),
      ],
      [CENTRAL_LAOS]: [
        makeToken('nva-t-laos', 'troops', 'NVA'),
        makeToken('vc-g-laos', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('us-t-laos', 'troops', 'US'),
      ],
      [NE_CAMBODIA]: [
        makeToken('vc-g-cambodia', 'guerrilla', 'VC', { activity: 'active' }),
        makeToken('arvn-p-cambodia', 'police', 'ARVN'),
      ],
      [SOUTH_SPACE]: [
        makeToken('nva-t-south', 'troops', 'NVA'),
        makeToken('vc-g-south', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCard51Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-51 unshaded event move');

    const overrides: readonly DecisionOverrideRule[] = [{
      when: (request) => request.name === '$insurgentPiecesToRemove',
      value: [
        asTokenId('nva-t-north-1'),
        asTokenId('nva-t-north-2'),
        asTokenId('nva-g-north'),
        asTokenId('vc-g-north'),
        asTokenId('nva-t-laos'),
        asTokenId('vc-g-laos'),
      ],
    }];
    const after = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countFactionType(after, 'available-NVA:none', 'NVA', 'troops'), 3, 'All chosen NVA Troops should move to Available');
    assert.equal(countFactionType(after, 'available-NVA:none', 'NVA', 'guerrilla'), 1, 'Chosen NVA Guerrilla should move to Available');
    assert.equal(countFactionType(after, 'available-VC:none', 'VC', 'guerrilla'), 2, 'Chosen VC Guerrillas should move to Available');

    assert.equal(zoneHas(after, NE_CAMBODIA, 'vc-g-cambodia'), true, 'Unchosen eligible outside-South piece should remain');
    assert.equal(zoneHas(after, NORTH_VIETNAM, 'nva-base-north'), true, 'Bases must not be removed');
    assert.equal(zoneHas(after, CENTRAL_LAOS, 'us-t-laos'), true, 'COIN pieces must not be affected');
    assert.equal(zoneHas(after, NE_CAMBODIA, 'arvn-p-cambodia'), true, 'ARVN pieces must not be affected');
    assert.equal(zoneHas(after, SOUTH_SPACE, 'nva-t-south'), true, 'South Vietnam NVA pieces must not be removed');
    assert.equal(zoneHas(after, SOUTH_SPACE, 'vc-g-south'), true, 'South Vietnam VC pieces must not be removed');
  });

  it('unshaded removes all eligible pieces when fewer than 6 exist outside South Vietnam', () => {
    const def = compileDef();
    const setup = setupState(def, 5102, {
      [NORTH_VIETNAM]: [
        makeToken('nva-t-north-only', 'troops', 'NVA'),
      ],
      [CENTRAL_LAOS]: [
        makeToken('vc-g-laos-only', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      [NE_CAMBODIA]: [
        makeToken('nva-g-cambodia-only', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      [SOUTH_SPACE]: [
        makeToken('vc-g-south-stays', 'guerrilla', 'VC', { activity: 'active' }),
      ],
    });

    const move = findCard51Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-51 unshaded event move');

    const after = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [{
        when: (request) => request.name === '$insurgentPiecesToRemove',
        value: [
          asTokenId('nva-t-north-only'),
          asTokenId('vc-g-laos-only'),
          asTokenId('nva-g-cambodia-only'),
        ],
      }],
    }).state;

    assert.equal(zoneHas(after, NORTH_VIETNAM, 'nva-t-north-only'), false);
    assert.equal(zoneHas(after, CENTRAL_LAOS, 'vc-g-laos-only'), false);
    assert.equal(zoneHas(after, NE_CAMBODIA, 'nva-g-cambodia-only'), false);
    assert.equal(zoneHas(after, SOUTH_SPACE, 'vc-g-south-stays'), true, 'South Vietnam pieces must remain untouched');
    assert.equal(countFactionType(after, 'available-NVA:none', 'NVA', 'troops'), 1);
    assert.equal(countFactionType(after, 'available-NVA:none', 'NVA', 'guerrilla'), 1);
    assert.equal(countFactionType(after, 'available-VC:none', 'VC', 'guerrilla'), 1);
  });

  it('unshaded is a legal no-op when no outside-South non-base Insurgent pieces exist', () => {
    const def = compileDef();
    const setup = setupState(def, 5103, {
      [NORTH_VIETNAM]: [
        makeToken('nva-base-only', 'base', 'NVA'),
      ],
      [CENTRAL_LAOS]: [
        makeToken('us-t-only', 'troops', 'US'),
      ],
      [SOUTH_SPACE]: [
        makeToken('nva-t-south-only', 'troops', 'NVA'),
        makeToken('vc-g-south-only', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findCard51Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-51 unshaded move even without eligible removals');

    const after = applyMove(def, setup, move!).state;
    assert.deepEqual(after.zones, setup.zones, 'Unshaded should no-op when no eligible outside-South non-base Insurgents exist');
  });

  it('shaded improves Trail by 2 and adds a deterministic die roll of NVA Resources', () => {
    const def = compileDef();
    const setup = setupState(def, 5104, {}, { trail: 2, nvaResources: 9 });
    const duplicate = setupState(def, 5104, {}, { trail: 2, nvaResources: 9 });

    const move = findCard51Move(def, setup, 'shaded');
    const duplicateMove = findCard51Move(def, duplicate, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-51 shaded event move');
    assert.notEqual(duplicateMove, undefined, 'Expected duplicate card-51 shaded event move');

    const after = applyMove(def, setup, move!).state;
    const duplicateAfter = applyMove(def, duplicate, duplicateMove!).state;
    const resourceDelta = Number(after.globalVars.nvaResources) - 9;

    assert.equal(after.globalVars.trail, 4, 'Shaded should improve Trail by 2');
    assert.ok(resourceDelta >= 1 && resourceDelta <= 6, 'Shaded should add exactly one die roll of NVA Resources');
    assert.deepEqual(after.globalVars, duplicateAfter.globalVars, 'Shaded random gain should be deterministic for the same seeded state');
  });

  it('shaded respects Trail and NVA Resource caps', () => {
    const def = compileDef();
    const setup = setupState(def, 5105, {}, { trail: 4, nvaResources: 74 });

    const move = findCard51Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-51 shaded event move');

    const after = applyMove(def, setup, move!).state;

    assert.equal(after.globalVars.trail, 4, 'Trail should remain capped at 4');
    assert.equal(after.globalVars.nvaResources, 75, 'NVA Resources should remain capped at 75');
  });
});
