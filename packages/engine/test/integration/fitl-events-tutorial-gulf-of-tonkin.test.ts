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
  type ZoneDef,
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

const countFactionTokens = (state: GameState, zoneId: string, faction: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => token.props.faction === faction).length;

describe('FITL tutorial Gulf of Tonkin event-card production spec', () => {
  it('compiles card 1 (Gulf of Tonkin) with free Air Strike grant and casualty-scaled aid penalty', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-1');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Gulf of Tonkin');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.factionOrder, ['US', 'NVA', 'ARVN', 'VC']);

    assert.equal(typeof card?.unshaded?.text, 'string');
    assert.equal(typeof card?.shaded?.text, 'string');
    assert.deepEqual(card?.unshaded?.freeOperationGrants, [
      {
        faction: '0',
        sequence: { chain: 'gulf-of-tonkin-us-airstrike', step: 0 },
        operationClass: 'operation',
        actionIds: ['airStrike'],
      },
    ]);
    const unshadedForEach = card?.unshaded?.effects?.find((effect) => 'forEach' in effect);
    assert.notEqual(unshadedForEach, undefined);

    const shadedAid = card?.shaded?.effects?.find((effect) => 'addVar' in effect);
    assert.notEqual(shadedAid, undefined);
    assert.deepEqual(shadedAid, {
      addVar: {
        scope: 'global',
        var: 'aid',
        delta: {
          op: '*',
          left: {
            aggregate: {
              op: 'count',
              query: {
                query: 'tokensInZone',
                zone: 'casualties-US:none',
                filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
              },
            },
          },
          right: -1,
        },
      },
    });

    const shadedMoveAll = card?.shaded?.effects?.find((effect) => 'moveAll' in effect);
    assert.deepEqual(shadedMoveAll, {
      moveAll: {
        from: 'casualties-US:none',
        to: 'out-of-play-US:none',
      },
    });
  });

  it('executes card 1 unshaded by moving up to 6 US out-of-play pieces into cities', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');
    const cityZoneIds = def.zones.filter((zone: ZoneDef) => zone.category === 'city').map((zone: ZoneDef) => zone.id);
    assert.ok(cityZoneIds.length > 0, 'Expected at least one city zone');

    const baseState = clearAllZones(initialState(def, 1301, 2));
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'out-of-play-US:none': Array.from({ length: 8 }, (_unused, index) =>
          makeToken(`us-oop-${index}`, 'troops', 'US'),
        ),
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    assert.ok(eventMoves.length > 0, 'Expected legal event moves for current card');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded event move');

    const usInCitiesBefore = cityZoneIds.reduce((sum: number, zoneId: string) => sum + countFactionTokens(setup, zoneId, 'US'), 0);
    const outOfPlayBefore = countFactionTokens(setup, 'out-of-play-US:none', 'US');
    const result = applyMove(def, setup, unshadedMove!).state;

    const usInCitiesAfter = cityZoneIds.reduce((sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'), 0);
    const outOfPlayAfter = countFactionTokens(result, 'out-of-play-US:none', 'US');

    assert.equal(outOfPlayBefore - outOfPlayAfter, 6, 'Expected exactly 6 US pieces moved out of out-of-play');
    assert.equal(usInCitiesAfter - usInCitiesBefore, 6, 'Expected exactly 6 US pieces added to city spaces');
  });
});
