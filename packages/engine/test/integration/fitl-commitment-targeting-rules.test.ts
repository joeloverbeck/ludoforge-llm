import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  asZoneId,
  createRng,
  initialState,
  legalChoicesEvaluate,
  legalChoicesDiscover,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
  type ZoneDef,
} from '../../src/kernel/index.js';
import { completeTemplateMove } from '../../src/kernel/move-completion.js';
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

const completeIfPending = (
  def: GameDef,
  state: GameState,
  move: Move,
  seed: bigint,
): Move => {
  const probe = legalChoicesEvaluate(def, state, move);
  if (probe.kind === 'complete') {
    return move;
  }
  assert.equal(probe.kind, 'pending', 'Expected event move to be complete or pending');
  const completed = completeTemplateMove(def, state, move, createRng(seed));
  assert.notEqual(completed, null, 'Expected pending event template to be completable');
  return completed!.move;
};

describe('FITL commitment targeting rules', () => {
  it('only allows LoCs, Saigon, or COIN-controlled province/city destinations', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const baseState = clearAllZones(initialState(def, 7302, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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

    const inCommitment = applyMove(def, setup, completeIfPending(def, setup, unshadedMove!, 7302n)).state;
    assert.equal(inCommitment.currentPhase, 'commitment');

    const commitmentMove = legalMoves(def, inCommitment).find((move) => String(move.actionId) === 'resolveCommitment');
    assert.notEqual(commitmentMove, undefined, 'Expected resolveCommitment move');

    const firstChoice = legalChoicesDiscover(def, inCommitment, commitmentMove!);
    assert.equal(firstChoice.kind, 'pending');
    assert.equal(firstChoice.type, 'chooseN');

    const withSelectedTroop: Move = {
      ...commitmentMove!,
      params: {
        ...commitmentMove!.params,
        [firstChoice.decisionId]: ['us-av-troop-1'],
      },
    };

    const destinationChoice = legalChoicesDiscover(def, inCommitment, withSelectedTroop);
    assert.equal(destinationChoice.kind, 'pending');
    assert.equal(destinationChoice.type, 'chooseOne');

    const options = destinationChoice.options.map((option) => String(option.value));
    assert.ok(options.includes('saigon:none'), 'Saigon must be a legal commitment destination');
    assert.ok(options.includes('loc-saigon-cam-ranh:none'), 'LoC must be a legal commitment destination');
    assert.ok(options.includes('hue:none'), 'COIN-controlled city must be a legal commitment destination');
    assert.equal(options.includes('quang-nam:none'), false, 'Non-COIN-controlled province must be illegal');

    const mapById = new Map(def.zones.filter((z: ZoneDef) => z.category !== undefined).map((z: ZoneDef) => [z.id, z] as const));
    for (const option of options) {
      const zone = mapById.get(asZoneId(option));
      assert.notEqual(zone, undefined, `Destination option ${option} must be a declared map space`);
      const allowed =
        zone!.category === 'loc' ||
        option === 'saigon:none' ||
        ((zone!.category === 'province' || zone!.category === 'city') && isCoinControlled(inCommitment, option));
      assert.equal(allowed, true, `Illegal commitment destination leaked into options: ${option}`);
    }
  });
});
