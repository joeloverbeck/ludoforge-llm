import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  initialState,
  legalChoices,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

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

const isCoinControlled = (state: GameState, zoneId: string): boolean => {
  const tokens = state.zones[zoneId] ?? [];
  const coin = tokens.filter((token) => token.props.faction === 'US' || token.props.faction === 'ARVN').length;
  const insurgent = tokens.filter((token) => token.props.faction === 'NVA' || token.props.faction === 'VC').length;
  return coin > insurgent;
};

describe('FITL commitment targeting rules', () => {
  it('only allows LoCs, Saigon, or COIN-controlled province/city destinations', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = clearAllZones(initialState(def, 7302, 2));
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-73', 'card', 'none')],
        'available-US:none': [makeToken('us-av-troop-1', 'troops', 'US')],
        'hue:none': [makeToken('hue-us-1', 'troops', 'US')],
        'quang-nam:none': [makeToken('qn-us-1', 'troops', 'US'), makeToken('qn-vc-1', 'guerrilla', 'VC')],
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected card-73 unshaded event move');

    const inCommitment = applyMove(def, setup, unshadedMove!).state;
    assert.equal(inCommitment.currentPhase, 'commitment');

    const commitmentMove = legalMoves(def, inCommitment).find((move) => String(move.actionId) === 'resolveCommitment');
    assert.notEqual(commitmentMove, undefined, 'Expected resolveCommitment move');

    const firstChoice = legalChoices(def, inCommitment, commitmentMove!);
    assert.equal(firstChoice.kind, 'pending');
    assert.equal(firstChoice.type, 'chooseN');

    const withSelectedTroop: Move = {
      ...commitmentMove!,
      params: {
        ...commitmentMove!.params,
        [firstChoice.decisionId]: ['us-av-troop-1'],
      },
    };

    const destinationChoice = legalChoices(def, inCommitment, withSelectedTroop);
    assert.equal(destinationChoice.kind, 'pending');
    assert.equal(destinationChoice.type, 'chooseOne');

    const options = destinationChoice.options?.map((value) => String(value)) ?? [];
    assert.ok(options.includes('saigon:none'), 'Saigon must be a legal commitment destination');
    assert.ok(options.includes('loc-saigon-cam-ranh:none'), 'LoC must be a legal commitment destination');
    assert.ok(options.includes('hue:none'), 'COIN-controlled city must be a legal commitment destination');
    assert.equal(options.includes('quang-nam:none'), false, 'Non-COIN-controlled province must be illegal');

    const mapById = new Map((def.mapSpaces ?? []).map((space) => [space.id, space] as const));
    for (const option of options) {
      const space = mapById.get(option);
      assert.notEqual(space, undefined, `Destination option ${option} must be a declared map space`);
      const allowed =
        space!.spaceType === 'loc' ||
        option === 'saigon:none' ||
        ((space!.spaceType === 'province' || space!.spaceType === 'city') && isCoinControlled(inCommitment, option));
      assert.equal(allowed, true, `Illegal commitment destination leaked into options: ${option}`);
    }
  });
});
