import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  createRng,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
  type ZoneDef,
} from '../../src/kernel/index.js';
import { GreedyAgent } from '../../src/agents/greedy-agent.js';
import { RandomAgent } from '../../src/agents/random-agent.js';
import { completeTemplateMove } from '../../src/agents/template-completion.js';
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

const completeForApply = (
  def: GameDef,
  state: GameState,
  move: Move,
  seed: bigint,
) => {
  const probe = legalChoicesEvaluate(def, state, move);
  if (probe.kind === 'complete') {
    return move;
  }
  assert.equal(probe.kind, 'pending', 'Expected event move to be complete or pending');
  const completed = completeTemplateMove(def, state, move, createRng(seed));
  assert.notEqual(completed, null, 'Expected pending event template to be completeable');
  return completed!.move;
};

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
    assert.deepEqual(card?.metadata?.seatOrder, ['US', 'NVA', 'ARVN', 'VC']);

    assert.equal(typeof card?.unshaded?.text, 'string');
    assert.equal(typeof card?.shaded?.text, 'string');
    assert.deepEqual(card?.unshaded?.freeOperationGrants, [
      {
        seat: '0',
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

  it('moves mixed piece types (troops, bases, irregulars) from out-of-play', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

    const baseState = clearAllZones(initialState(def, 2001, 2).state);
    const mixedPieces = [
      ...Array.from({ length: 3 }, (_, i) => makeToken(`us-trp-${i}`, 'troops', 'US')),
      ...Array.from({ length: 2 }, (_, i) => makeToken(`us-bas-${i}`, 'base', 'US')),
      ...Array.from({ length: 3 }, (_, i) => makeToken(`us-irr-${i}`, 'irregular', 'US')),
    ];
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'out-of-play-US:none': mixedPieces,
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded event move');
    assert.equal(
      Object.keys(unshadedMove!.params).some((key) => key.startsWith('decision:')),
      false,
      'Expected base event template params only from legalMoves',
    );

    const result = applyMove(def, setup, completeForApply(def, setup, unshadedMove!, 1101n)).state;

    const outOfPlayAfter = countFactionTokens(result, 'out-of-play-US:none', 'US');
    assert.equal(outOfPlayAfter, 2, 'Expected 2 pieces remaining in out-of-play');

    const usInCities = cityZoneIds.reduce(
      (sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'),
      0,
    );
    assert.equal(usInCities, 6, 'Expected 6 pieces moved to cities');

    const typesInCities = new Set<string>();
    for (const zoneId of cityZoneIds) {
      for (const token of result.zones[zoneId] ?? []) {
        if (token.props.faction === 'US') {
          typesInCities.add(token.props.type as string);
        }
      }
    }
    assert.ok(
      typesInCities.size >= 2,
      `Expected at least 2 different token types in cities, got: ${[...typesInCities].join(', ')}`,
    );
  });

  it('distributes pieces across multiple cities when decisions specify different targets', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);
    assert.ok(cityZoneIds.length >= 2, 'Need at least 2 city zones for this test');

    const baseState = clearAllZones(initialState(def, 42, 2).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'out-of-play-US:none': Array.from({ length: 8 }, (_, i) =>
          makeToken(`us-oop-${i}`, 'troops', 'US'),
        ),
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded event move');
    assert.equal(
      Object.keys(unshadedMove!.params).some((key) => key.startsWith('decision:')),
      false,
      'Expected base event template params only from legalMoves',
    );

    // Fill choices incrementally to force multi-city distribution.
    let distributedMove = unshadedMove!;
    let filledDecisions = 0;
    while (true) {
      const choices = legalChoicesEvaluate(def, setup, distributedMove);
      if (choices.kind === 'complete') {
        break;
      }
      assert.equal(choices.kind, 'pending', 'Expected pending decisions until completion');
      const choice = cityZoneIds[filledDecisions % cityZoneIds.length];
      assert.notEqual(choice, undefined);
      const selectedCity = choice as string;
      distributedMove = {
        ...distributedMove,
        params: {
          ...distributedMove.params,
          [choices.decisionId]: selectedCity,
        },
      };
      filledDecisions += 1;
    }
    assert.equal(filledDecisions, 6, 'Expected 6 chooseOne decisions (one per moved piece)');

    const result = applyMove(def, setup, distributedMove).state;

    const citiesWithUs = cityZoneIds.filter(
      (zoneId) => countFactionTokens(result, zoneId, 'US') > 0,
    );
    assert.ok(
      citiesWithUs.length >= 2,
      `Expected pieces in at least 2 cities, found in: ${citiesWithUs.join(', ')}`,
    );

    const usInCities = cityZoneIds.reduce(
      (sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'),
      0,
    );
    assert.equal(usInCities, 6, 'Expected 6 pieces total across cities');
  });

  it('moves all available pieces when fewer than 6 exist in out-of-play', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

    const baseState = clearAllZones(initialState(def, 3001, 2).state);
    const fewerPieces = [
      makeToken('us-trp-0', 'troops', 'US'),
      makeToken('us-trp-1', 'troops', 'US'),
      makeToken('us-bas-0', 'base', 'US'),
      makeToken('us-bas-1', 'base', 'US'),
    ];
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'out-of-play-US:none': fewerPieces,
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded event move');
    assert.equal(
      Object.keys(unshadedMove!.params).some((key) => key.startsWith('decision:')),
      false,
      'Expected base event template params only from legalMoves',
    );

    const result = applyMove(def, setup, completeForApply(def, setup, unshadedMove!, 1201n)).state;

    const outOfPlayAfter = countFactionTokens(result, 'out-of-play-US:none', 'US');
    assert.equal(outOfPlayAfter, 0, 'Expected 0 pieces remaining in out-of-play');

    const usInCities = cityZoneIds.reduce(
      (sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'),
      0,
    );
    assert.equal(usInCities, 4, 'Expected all 4 available pieces moved to cities');
  });

  it('handles zero pieces in out-of-play gracefully', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

    const baseState = clearAllZones(initialState(def, 4001, 2).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        // out-of-play-US:none is empty (from clearAllZones)
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded event move even with no pieces');
    assert.equal(
      Object.keys(unshadedMove!.params).some((key) => key.startsWith('decision:')),
      false,
      'Expected base event template params only from legalMoves',
    );
    assert.equal(legalChoicesEvaluate(def, setup, unshadedMove!).kind, 'complete');

    const result = applyMove(def, setup, unshadedMove!).state;

    const usInCities = cityZoneIds.reduce(
      (sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'),
      0,
    );
    assert.equal(usInCities, 0, 'Expected no US pieces in cities when out-of-play was empty');
  });

  it('executes card 1 unshaded by moving up to 6 US out-of-play pieces into cities', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');
    const cityZoneIds = def.zones.filter((zone: ZoneDef) => zone.category === 'city').map((zone: ZoneDef) => zone.id);
    assert.ok(cityZoneIds.length > 0, 'Expected at least one city zone');

    const baseState = clearAllZones(initialState(def, 1301, 2).state);
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
    assert.equal(
      Object.keys(unshadedMove!.params).some((key) => key.startsWith('decision:')),
      false,
      'Expected base event template params only from legalMoves',
    );

    const usInCitiesBefore = cityZoneIds.reduce((sum: number, zoneId: string) => sum + countFactionTokens(setup, zoneId, 'US'), 0);
    const outOfPlayBefore = countFactionTokens(setup, 'out-of-play-US:none', 'US');
    const result = applyMove(def, setup, completeForApply(def, setup, unshadedMove!, 1301n)).state;

    const usInCitiesAfter = cityZoneIds.reduce((sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'), 0);
    const outOfPlayAfter = countFactionTokens(result, 'out-of-play-US:none', 'US');

    assert.equal(outOfPlayBefore - outOfPlayAfter, 6, 'Expected exactly 6 US pieces moved out of out-of-play');
    assert.equal(usInCitiesAfter - usInCitiesBefore, 6, 'Expected exactly 6 US pieces added to city spaces');
  });

  it('RandomAgent completes an event template move that already has base params', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const baseState = clearAllZones(initialState(def, 1302, 2).state);
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

    const template = legalMoves(def, setup).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded',
    );
    assert.notEqual(template, undefined, 'Expected unshaded event template move');
    assert.equal(
      Object.keys(template!.params).some((key) => key.startsWith('decision:')),
      false,
      'Expected legalMoves to emit base event params only',
    );

    const agent = new RandomAgent();
    const selected = agent.chooseMove({
      def,
      state: setup,
      playerId: setup.activePlayer,
      legalMoves: [template!],
      rng: createRng(1302n),
    }).move;

    assert.equal(
      Object.keys(selected.params).some((key) => key.startsWith('decision:')),
      true,
      'Expected RandomAgent to complete event decisions before returning move',
    );
    assert.doesNotThrow(() => applyMove(def, setup, selected));
  });

  it('GreedyAgent completes an event template move that already has base params', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const baseState = clearAllZones(initialState(def, 1303, 2).state);
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

    const template = legalMoves(def, setup).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded',
    );
    assert.notEqual(template, undefined, 'Expected unshaded event template move');
    assert.equal(
      Object.keys(template!.params).some((key) => key.startsWith('decision:')),
      false,
      'Expected legalMoves to emit base event params only',
    );

    const agent = new GreedyAgent({ completionsPerTemplate: 2 });
    const selected = agent.chooseMove({
      def,
      state: setup,
      playerId: setup.activePlayer,
      legalMoves: [template!],
      rng: createRng(1303n),
    }).move;

    assert.equal(
      Object.keys(selected.params).some((key) => key.startsWith('decision:')),
      true,
      'Expected GreedyAgent to complete event decisions before returning move',
    );
    assert.doesNotThrow(() => applyMove(def, setup, selected));
  });
});
