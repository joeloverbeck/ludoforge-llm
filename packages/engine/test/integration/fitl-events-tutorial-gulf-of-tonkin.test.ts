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

const countFactionTokens = (state: GameState, zoneId: string, faction: string): number =>
  (state.zones[zoneId] ?? []).filter((token) => token.props.faction === faction).length;

const decisionEntries = (move: Move): Array<[string, Move['params'][string]]> =>
  Object.entries(move.params).filter(([key]) => key.startsWith('decision:')) as Array<
    [string, Move['params'][string]]
  >;

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

  it('legalChoicesEvaluate returns first pending chooseOne over all city options for unshaded template', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id)
      .sort();

    const baseState = clearAllZones(initialState(def, 2401, 2).state);
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

    const template = legalMoves(def, setup).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded',
    );
    assert.notEqual(template, undefined, 'Expected unshaded event template');

    const pending = legalChoicesEvaluate(def, setup, template!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected pending choice request for unshaded event template.');
    }
    assert.equal(pending.type, 'chooseOne');
    assert.equal(pending.decisionId.includes('$targetCity'), true);
    const optionIds = pending.options.map((option) => String(option.value)).sort();
    assert.deepEqual(optionIds, cityZoneIds);
  });

  it('completeTemplateMove resolves exactly 6 city decision params for unshaded Gulf of Tonkin', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = new Set<string>(
      def.zones.filter((zone: ZoneDef) => zone.category === 'city').map((zone: ZoneDef) => zone.id),
    );

    const baseState = clearAllZones(initialState(def, 2402, 2).state);
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

    const template = legalMoves(def, setup).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded',
    );
    assert.notEqual(template, undefined, 'Expected unshaded event template');

    const completion = completeTemplateMove(def, setup, template!, createRng(2402n));
    assert.notEqual(completion, null, 'Expected template to complete');
    const completed = completion!.move;
    const choices = decisionEntries(completed);
    assert.equal(choices.length, 6, 'Expected one decision per moved piece');
    for (const [, value] of choices) {
      assert.equal(typeof value, 'string');
      assert.equal(cityZoneIds.has(value as string), true, `Expected city id, received ${String(value)}`);
    }
    assert.doesNotThrow(() => applyMove(def, setup, completed));
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

  it('treats Gulf of Tonkin shaded side as complete (no chooseOne required)', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const baseState = clearAllZones(initialState(def, 2403, 2).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'casualties-US:none': [makeToken('us-cas-0', 'troops', 'US')],
      },
    };

    const shadedTemplate = legalMoves(def, setup).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'shaded',
    );
    assert.notEqual(shadedTemplate, undefined, 'Expected shaded event move');
    assert.equal(legalChoicesEvaluate(def, setup, shadedTemplate!).kind, 'complete');
    assert.equal(decisionEntries(shadedTemplate!).length, 0);
    assert.doesNotThrow(() => applyMove(def, setup, shadedTemplate!));
  });

  it('excludes an event side when chooseOne options are unsatisfiable', () => {
    const source = compileDef();
    const def = structuredClone(source);
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const card = eventDeck!.cards.find((entry) => entry.id === 'card-1');
    assert.notEqual(card, undefined);
    const findFirstChooseOne = (value: unknown): Record<string, unknown> | null => {
      if (Array.isArray(value)) {
        for (const item of value) {
          const nested = findFirstChooseOne(item);
          if (nested !== null) {
            return nested;
          }
        }
        return null;
      }
      if (value === null || typeof value !== 'object') {
        return null;
      }
      if (Object.prototype.hasOwnProperty.call(value, 'chooseOne')) {
        return value as Record<string, unknown>;
      }
      for (const nested of Object.values(value as Record<string, unknown>)) {
        const result = findFirstChooseOne(nested);
        if (result !== null) {
          return result;
        }
      }
      return null;
    };

    const chooseOneHolder = findFirstChooseOne(card!.unshaded?.effects ?? []);
    assert.notEqual(chooseOneHolder, null, 'Expected to locate a chooseOne effect in card-1 unshaded');
    (
      chooseOneHolder as {
        chooseOne: {
          options: { query: string; values?: readonly string[] };
        };
      }
    ).chooseOne.options = { query: 'enums', values: [] };

    const baseState = clearAllZones(initialState(def, 2404, 2).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'out-of-play-US:none': [makeToken('us-oop-0', 'troops', 'US')],
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshaded = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.equal(unshaded, undefined, 'Expected unsatisfiable unshaded side to be excluded from legalMoves');
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
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

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

    const resolvedState = applyMove(def, setup, selected).state;
    const citiesWithUs = cityZoneIds.filter(
      (zoneId) => countFactionTokens(resolvedState, zoneId, 'US') > 0,
    );
    assert.ok(
      citiesWithUs.length >= 2,
      `Expected RandomAgent completion to distribute US pieces across at least 2 cities, found: ${citiesWithUs.join(', ')}`,
    );
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
