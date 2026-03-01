import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asPlayerId,
  asTokenId,
  createRng,
  ILLEGAL_MOVE_REASONS,
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

const compileDefWithoutCard1Grants = (): GameDef => {
  const def = structuredClone(compileDef());
  const card1 = def.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-1') as
    | { unshaded?: { freeOperationGrants?: unknown[]; effectTiming?: string } }
    | undefined;
  assert.notEqual(card1, undefined, 'Expected card-1 in first event deck');
  if (card1?.unshaded !== undefined) {
    card1.unshaded.freeOperationGrants = [];
    card1.unshaded.effectTiming = 'beforeGrants';
  }
  return def;
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
        seat: 'NVA',
        executeAsSeat: 'US',
        sequence: { chain: 'gulf-of-tonkin-us-airstrike', step: 0 },
        operationClass: 'operation',
        actionIds: ['airStrike'],
      },
    ]);
    assert.equal(card?.unshaded?.effectTiming, 'afterGrants');
    assert.equal((card?.unshaded?.effects ?? []).length > 0, true, 'Expected unshaded effects to be present');

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

  it('routes Gulf of Tonkin free Air Strike through seat grant consumption and executeAs delegation at runtime', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const baseState = initialState(def, 4501, 4).state;
    assert.equal(baseState.turnOrderState.type, 'cardDriven');
    if (baseState.turnOrderState.type !== 'cardDriven') {
      throw new Error('Expected card-driven turn order state');
    }
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...baseState.turnOrderState.runtime,
          currentCard: {
            ...baseState.turnOrderState.runtime.currentCard,
            firstEligible: 'US',
            secondEligible: 'NVA',
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
      },
    };

    const unshadedEvent = legalMoves(def, setup).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded',
    );
    assert.notEqual(unshadedEvent, undefined, 'Expected unshaded Gulf of Tonkin event move');

    const afterEvent = applyMove(def, setup, completeForApply(def, setup, unshadedEvent!, 4501n)).state;
    assert.equal(afterEvent.turnOrderState.type, 'cardDriven');
    if (afterEvent.turnOrderState.type !== 'cardDriven') {
      throw new Error('Expected card-driven turn order state');
    }
    const pending = afterEvent.turnOrderState.runtime.pendingFreeOperationGrants ?? [];
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.seat, 'NVA');
    assert.equal(pending[0]?.executeAsSeat, 'US');

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(2),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...afterEvent.turnOrderState.runtime,
          currentCard: {
            ...afterEvent.turnOrderState.runtime.currentCard,
            firstEligible: 'NVA',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeAirStrikeMove = legalMoves(def, grantReadyState).find(
      (move) => String(move.actionId) === 'airStrike' && move.freeOperation === true,
    );
    assert.notEqual(freeAirStrikeMove, undefined, 'Expected free Air Strike move from pending grant');

    const afterFreeAirStrike = applyMove(
      def,
      grantReadyState,
      completeForApply(def, grantReadyState, freeAirStrikeMove!, 4502n),
    ).state;
    assert.equal(afterFreeAirStrike.turnOrderState.type, 'cardDriven');
    if (afterFreeAirStrike.turnOrderState.type !== 'cardDriven') {
      throw new Error('Expected card-driven turn order state');
    }
    assert.deepEqual(afterFreeAirStrike.turnOrderState.runtime.pendingFreeOperationGrants ?? [], []);

    assert.throws(
      () =>
        applyMove(def, afterFreeAirStrike, {
          actionId: freeAirStrikeMove!.actionId,
          params: freeAirStrikeMove!.params,
          freeOperation: true,
        }),
      (error: unknown) => {
        if (!(error instanceof Error) || !('reason' in error)) return false;
        const details = error as Error & { reason?: string; context?: { freeOperationDenial?: { cause?: string } } };
        return details.reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED
          && details.context?.freeOperationDenial?.cause === 'noActiveSeatGrant';
      },
    );
  });

  it('moves mixed piece types (troops, bases, irregulars) from out-of-play', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

    const baseState = clearAllZones(initialState(def, 2001, 4).state);
    const mixedPieces = [
      ...Array.from({ length: 3 }, (_, i) => makeToken(`us-trp-${i}`, 'troops', 'US')),
      ...Array.from({ length: 2 }, (_, i) => makeToken(`us-bas-${i}`, 'base', 'US')),
      ...Array.from({ length: 3 }, (_, i) => makeToken(`us-irr-${i}`, 'irregular', 'US')),
    ];
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);
    assert.ok(cityZoneIds.length >= 2, 'Need at least 2 city zones for this test');

    const baseState = clearAllZones(initialState(def, 42, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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
      let selection: string | string[];
      if (choices.type === 'chooseN') {
        selection = Array.from({ length: 6 }, (_unused, idx) => `us-oop-${idx}`);
      } else {
        const choice = cityZoneIds[filledDecisions % cityZoneIds.length];
        assert.notEqual(choice, undefined);
        selection = choice as string;
      }
      distributedMove = {
        ...distributedMove,
        params: {
          ...distributedMove.params,
          [choices.decisionId]: selection,
        },
      };
      filledDecisions += 1;
    }
    assert.equal(filledDecisions, 7, 'Expected chooseN plus 6 chooseOne decisions');

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

  it('legalChoicesEvaluate returns chooseN first for unshaded template', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id)
      .sort();

    const baseState = clearAllZones(initialState(def, 2401, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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
    assert.equal(pending.type, 'chooseN');
    const optionIds = pending.options.map((option) => String(option.value)).sort();
    assert.deepEqual(optionIds, Array.from({ length: 8 }, (_unused, idx) => `us-oop-${idx}`));

    const withSelection: Move = {
      ...template!,
      params: {
        ...template!.params,
        [pending.decisionId]: Array.from({ length: 6 }, (_unused, idx) => `us-oop-${idx}`),
      },
    };
    const nextPending = legalChoicesEvaluate(def, setup, withSelection);
    assert.equal(nextPending.kind, 'pending');
    if (nextPending.kind !== 'pending') {
      throw new Error('Expected chooseOne after chooseN selection.');
    }
    assert.equal(nextPending.type, 'chooseOne');
    assert.equal(nextPending.decisionId.includes('.chooseDestination'), true);
    const cityOptionIds = nextPending.options.map((option) => String(option.value)).sort();
    assert.deepEqual(cityOptionIds, cityZoneIds);
  });

  it('completeTemplateMove resolves chooseN plus per-piece city decision params for unshaded Gulf of Tonkin', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const baseState = clearAllZones(initialState(def, 2402, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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
    const chooseNEntry = choices.find((entry) => Array.isArray(entry[1]));
    assert.notEqual(chooseNEntry, undefined, 'Expected chooseN decision entry');
    assert.equal(Array.isArray(chooseNEntry![1]), true);
    const selectedCount = (chooseNEntry![1] as unknown[]).length;
    assert.equal(selectedCount >= 0 && selectedCount <= 6, true, 'Expected chooseN selected count in [0, 6]');
    assert.equal(choices.length, 1 + selectedCount, 'Expected one city decision per selected piece');

    for (const [decisionId, value] of choices) {
      if (decisionId.includes('$selectedPieces')) {
        continue;
      }
      assert.notEqual(value, undefined);
    }
    assert.doesNotThrow(() => applyMove(def, setup, completed));
  });

  it('allows unshaded side when fewer than 6 pieces exist in out-of-play', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

    const baseState = clearAllZones(initialState(def, 3001, 4).state);
    const fewerPieces = [
      makeToken('us-trp-0', 'troops', 'US'),
      makeToken('us-trp-1', 'troops', 'US'),
      makeToken('us-bas-0', 'base', 'US'),
      makeToken('us-bas-1', 'base', 'US'),
    ];
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'out-of-play-US:none': fewerPieces,
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded event move to remain legal when < 6 pieces exist');

    const pending = legalChoicesEvaluate(def, setup, unshadedMove!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected chooseN request when < 6 pieces exist.');
    }
    assert.equal(pending.type, 'chooseN');
    assert.equal(pending.options.length, 4, 'Expected 4 available options');
    assert.equal(pending.max, 4, 'Expected chooseN max to clamp to available options');

    let move: Move = {
      ...unshadedMove!,
      params: {
        ...unshadedMove!.params,
        [pending.decisionId]: pending.options.map((option) => String(option.value)),
      },
    };
    while (true) {
      const next = legalChoicesEvaluate(def, setup, move);
      if (next.kind === 'complete') {
        break;
      }
      assert.equal(next.kind, 'pending');
      assert.equal(next.type, 'chooseOne');
      move = {
        ...move,
        params: {
          ...move.params,
          [next.decisionId]: cityZoneIds[0]!,
        },
      };
    }

    const result = applyMove(def, setup, move).state;
    const outOfPlayAfter = countFactionTokens(result, 'out-of-play-US:none', 'US');
    assert.equal(outOfPlayAfter, 0, 'Expected all 4 available pieces to move out of out-of-play');
    const usInCities = cityZoneIds.reduce((sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'), 0);
    assert.equal(usInCities, 4, 'Expected all 4 available pieces to be placed into cities');
  });

  it('allows unshaded side when zero pieces exist in out-of-play and resolves as no-op', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

    const baseState = clearAllZones(initialState(def, 4001, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        // out-of-play-US:none is empty (from clearAllZones)
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshadedMove = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshadedMove, undefined, 'Expected unshaded event move to be legal when no pieces exist');

    const pending = legalChoicesEvaluate(def, setup, unshadedMove!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected chooseN request when no pieces exist.');
    }
    assert.equal(pending.type, 'chooseN');
    assert.equal(pending.options.length, 0);
    assert.equal(pending.max, 0);

    const zeroSelectionMove: Move = {
      ...unshadedMove!,
      params: {
        ...unshadedMove!.params,
        [pending.decisionId]: [],
      },
    };
    assert.equal(legalChoicesEvaluate(def, setup, zeroSelectionMove).kind, 'complete');

    const result = applyMove(def, setup, zeroSelectionMove).state;
    const usInCities = cityZoneIds.reduce((sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'), 0);
    assert.equal(usInCities, 0, 'Expected no US pieces in cities when out-of-play is empty');
  });

  it('allows explicit zero-token selection when chooseN options exist', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

    const baseState = clearAllZones(initialState(def, 4002, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'out-of-play-US:none': Array.from({ length: 8 }, (_, i) => makeToken(`us-oop-${i}`, 'troops', 'US')),
      },
    };

    const unshadedMove = legalMoves(def, setup).find(
      (move) => String(move.actionId) === 'event' && move.params.side === 'unshaded',
    );
    assert.notEqual(unshadedMove, undefined);

    const pending = legalChoicesEvaluate(def, setup, unshadedMove!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected initial chooseN request.');
    }
    assert.equal(pending.type, 'chooseN');

    const zeroSelectionMove: Move = {
      ...unshadedMove!,
      params: {
        ...unshadedMove!.params,
        [pending.decisionId]: [],
      },
    };
    assert.equal(legalChoicesEvaluate(def, setup, zeroSelectionMove).kind, 'complete');

    const result = applyMove(def, setup, zeroSelectionMove).state;
    const outOfPlayAfter = countFactionTokens(result, 'out-of-play-US:none', 'US');
    assert.equal(outOfPlayAfter, 8, 'Expected no pieces moved when zero tokens are selected');
    const usInCities = cityZoneIds.reduce((sum: number, zoneId: string) => sum + countFactionTokens(result, zoneId, 'US'), 0);
    assert.equal(usInCities, 0, 'Expected no city placements when zero tokens are selected');
  });

  it('treats Gulf of Tonkin shaded side as complete (no chooseOne required)', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const baseState = clearAllZones(initialState(def, 2403, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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

  it('keeps unshaded side legal when chooseOne options are unsatisfiable because zero selection remains valid', () => {
    const source = compileDefWithoutCard1Grants();
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

    const baseState = clearAllZones(initialState(def, 2404, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...baseState.zones,
        [eventDeck!.discardZone]: [makeToken('card-1', 'card', 'none')],
        'out-of-play-US:none': Array.from({ length: 6 }, (_, i) => makeToken(`us-oop-${i}`, 'troops', 'US')),
      },
    };

    const eventMoves = legalMoves(def, setup).filter((move) => String(move.actionId) === 'event');
    const unshaded = eventMoves.find((move) => move.params.side === 'unshaded');
    assert.notEqual(unshaded, undefined, 'Expected unshaded side to remain legal because chooseN can select zero');

    const pending = legalChoicesEvaluate(def, setup, unshaded!);
    assert.equal(pending.kind, 'pending');
    if (pending.kind !== 'pending') {
      throw new Error('Expected chooseN request.');
    }
    assert.equal(pending.type, 'chooseN');

    const zeroSelectionMove: Move = {
      ...unshaded!,
      params: {
        ...unshaded!.params,
        [pending.decisionId]: [],
      },
    };
    assert.equal(legalChoicesEvaluate(def, setup, zeroSelectionMove).kind, 'complete');
  });

  it('executes card 1 unshaded by moving up to 6 US out-of-play pieces into cities', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');
    const cityZoneIds = def.zones.filter((zone: ZoneDef) => zone.category === 'city').map((zone: ZoneDef) => zone.id);
    assert.ok(cityZoneIds.length > 0, 'Expected at least one city zone');

    const baseState = clearAllZones(initialState(def, 1301, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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

    const movedCount = outOfPlayBefore - outOfPlayAfter;
    const placedCount = usInCitiesAfter - usInCitiesBefore;
    assert.equal(movedCount >= 0 && movedCount <= 6, true, 'Expected moved count in [0, 6]');
    assert.equal(placedCount, movedCount, 'Expected city placements to match moved count');
  });

  it('RandomAgent completes an event template move that already has base params', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);
    const cityZoneIds = def.zones
      .filter((zone: ZoneDef) => zone.category === 'city')
      .map((zone: ZoneDef) => zone.id);

    const baseState = clearAllZones(initialState(def, 1302, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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
    const usInCities = cityZoneIds.reduce(
      (sum: number, zoneId: string) => sum + countFactionTokens(resolvedState, zoneId, 'US'),
      0,
    );
    assert.equal(usInCities >= 0 && usInCities <= 6, true, 'Expected RandomAgent completion to move between 0 and 6 US pieces');
  });

  it('GreedyAgent completes an event template move that already has base params', () => {
    const def = compileDefWithoutCard1Grants();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined);

    const baseState = clearAllZones(initialState(def, 1303, 4).state);
    const setup: GameState = {
      ...baseState,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
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
