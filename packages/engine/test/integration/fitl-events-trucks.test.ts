import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import {
  asPlayerId,
  asTokenId,
  initialState,
  legalChoicesEvaluate,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';

const CARD_ID = 'card-55';
const CENTRAL_LAOS = 'central-laos:none';
const SOUTHERN_LAOS = 'southern-laos:none';
const NORTHEAST_CAMBODIA = 'northeast-cambodia:none';
const PARROTS_BEAK = 'the-parrots-beak:none';
const STAGING_ZONE = 'trucks-base-staging:none';

const makeToken = (
  id: string,
  type: string,
  faction: string,
  extras: Readonly<Record<string, string | number | boolean>> = {},
): Token => ({
  id: asTokenId(id),
  type,
  props: {
    faction,
    type,
    ...extras,
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
  options: {
    readonly globalVars?: Partial<GameState['globalVars']>;
    readonly zones?: Readonly<Record<string, readonly Token[]>>;
  } = {},
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected FITL event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  const globalVars: Record<string, number | boolean> = { ...base.globalVars };
  for (const [name, value] of Object.entries(options.globalVars ?? {})) {
    if (value !== undefined) {
      globalVars[name] = value;
    }
  }

  return {
    ...base,
    activePlayer: asPlayerId(2),
    turnOrderState: { type: 'roundRobin' },
    globalVars,
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...(options.zones ?? {}),
    },
  };
};

const findCard55Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const zoneHas = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => String((token as Token).id) === tokenId);

const zoneTokenIds = (state: GameState, zone: string): string[] =>
  (state.zones[zone] ?? []).map((token) => String((token as Token).id));

const countFactionBases = (state: GameState, zone: string, faction: string): number =>
  (state.zones[zone] ?? []).filter(
    (token) => (token as Token).props.faction === faction && (token as Token).type === 'base',
  ).length;

const findTokenZone = (state: GameState, tokenId: string, candidateZones: readonly string[]): string | null => {
  for (const zone of candidateZones) {
    if (zoneHas(state, zone, tokenId)) {
      return zone;
    }
  }
  return null;
};

const findDeep = (node: unknown, predicate: (value: Record<string, unknown>) => boolean): Record<string, unknown>[] => {
  const matches: Record<string, unknown>[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (predicate(record)) {
        matches.push(record);
      }
      for (const nested of Object.values(record)) {
        visit(nested);
      }
    }
  };
  visit(node);
  return matches;
};

describe('FITL card-55 Trucks', () => {
  it('encodes exact text, metadata, exact-per-country unshaded removal, and shaded staging redeploy structure', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-55 in production deck');
    assert.equal(card?.title, 'Trucks');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1964');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'US', 'ARVN']);
    assert.equal(
      card?.unshaded?.text,
      'Degrade Trail 2 boxes. NVA selects and removes 4 of its pieces each from Laos and Cambodia.',
    );
    assert.equal(
      card?.shaded?.text,
      'Add twice Trail value to each NVA and VC Resources. NVA moves its unTunneled Bases anywhere within Laos/Cambodia.',
    );

    const unshadedChooseN = findDeep(card?.unshaded?.effects ?? [], (node) => typeof node.chooseN === 'object');
    assert.equal(unshadedChooseN.length, 2, 'Unshaded should prompt once for Laos and once for Cambodia');
    assert.deepEqual(
      unshadedChooseN.map((effect) => (effect.chooseN as { bind: string }).bind),
      ['$nvaLaosPieces', '$nvaCambodiaPieces'],
    );
    assert.equal(
      findDeep(
        card?.shaded?.effects ?? [],
        (node) => node.forEach !== undefined
          && (node.forEach as { over?: { query?: string } }).over?.query === 'tokensInZone',
      ).length > 0,
      true,
      'Shaded should redeploy via a staging-zone iteration after removing all untunneled bases from the map',
    );
  });

  it('unshaded requires exactly 4 removals per country when available, degrades Trail with floor at 0, and moves selected pieces to Available', () => {
    const def = compileDef();
    const setup = setupState(def, 55001, {
      globalVars: { trail: 1 },
      zones: {
        [CENTRAL_LAOS]: [
          makeToken('laos-1', 'troops', 'NVA'),
          makeToken('laos-2', 'troops', 'NVA'),
          makeToken('laos-3', 'guerrilla', 'NVA', { activity: 'active' }),
          makeToken('laos-4', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeToken('laos-5', 'base', 'NVA', { tunnel: 'tunneled' }),
        ],
        [NORTHEAST_CAMBODIA]: [
          makeToken('cam-1', 'troops', 'NVA'),
          makeToken('cam-2', 'troops', 'NVA'),
          makeToken('cam-3', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('cam-4', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeToken('cam-5', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
      },
    });

    const move = findCard55Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Trucks unshaded event move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending Laos removal choice for Trucks unshaded.');
    }
    assert.equal(firstPending.type, 'chooseN');
    assert.equal(firstPending.min, 4);
    assert.equal(firstPending.max, 4);

    assert.throws(
      () => applyMoveWithResolvedDecisionIds(def, setup, move!, {
        overrides: [
          {
            when: (request) => request.name === '$nvaLaosPieces',
            value: ['laos-1', 'laos-2', 'laos-3'],
          },
        ],
      }),
      /chooseN selection cardinality mismatch/u,
      'Laos removal should be mandatory up to 4 when 4+ pieces are available',
    );

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$nvaLaosPieces',
          value: ['laos-1', 'laos-2', 'laos-3', 'laos-5'],
        },
        {
          when: (request) => request.name === '$nvaCambodiaPieces',
          value: ['cam-1', 'cam-2', 'cam-3', 'cam-4'],
        },
      ],
    }).state;

    assert.equal(final.globalVars.trail, 0, 'Trail should degrade by 2 but respect the 0 floor');
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'laos-4'), true, 'Exactly one Laos piece should remain');
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'laos-5'), false, 'Selected tunneled base should be removable by owner choice');
    assert.equal(zoneHas(final, NORTHEAST_CAMBODIA, 'cam-5'), true, 'Exactly one Cambodia piece should remain');
    assert.deepEqual(
      zoneTokenIds(final, 'available-NVA:none').sort(),
      ['cam-1', 'cam-2', 'cam-3', 'cam-4', 'laos-1', 'laos-2', 'laos-3', 'laos-5'].sort(),
    );
  });

  it('unshaded removes all available NVA pieces in a country when fewer than 4 exist', () => {
    const def = compileDef();
    const setup = setupState(def, 55002, {
      globalVars: { trail: 4 },
      zones: {
        [CENTRAL_LAOS]: [
          makeToken('few-laos-1', 'troops', 'NVA'),
          makeToken('few-laos-2', 'base', 'NVA', { tunnel: 'tunneled' }),
        ],
        [NORTHEAST_CAMBODIA]: [
          makeToken('few-cam-1', 'troops', 'NVA'),
          makeToken('few-cam-2', 'troops', 'NVA'),
          makeToken('few-cam-3', 'guerrilla', 'NVA', { activity: 'active' }),
        ],
      },
    });

    const move = findCard55Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Trucks unshaded event move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending Laos removal choice for Trucks unshaded.');
    }
    assert.equal(firstPending.min, 2);
    assert.equal(firstPending.max, 2);

    const secondPending = legalChoicesEvaluate(def, setup, {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionId]: ['few-laos-1', 'few-laos-2'],
      },
    });
    assert.equal(secondPending.kind, 'pending');
    if (secondPending.kind !== 'pending') {
      throw new Error('Expected pending Cambodia removal choice for Trucks unshaded.');
    }
    assert.equal(secondPending.min, 3);
    assert.equal(secondPending.max, 3);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name === '$nvaLaosPieces',
          value: ['few-laos-1', 'few-laos-2'],
        },
        {
          when: (request) => request.name === '$nvaCambodiaPieces',
          value: ['few-cam-1', 'few-cam-2', 'few-cam-3'],
        },
      ],
    }).state;

    assert.equal((final.zones[CENTRAL_LAOS] ?? []).length, 0);
    assert.equal((final.zones[NORTHEAST_CAMBODIA] ?? []).length, 0);
    assert.equal((final.zones['available-NVA:none'] ?? []).length, 5);
  });

  it('shaded adds twice Trail to both insurgent resources with caps and redeploys only untunneled NVA bases via staging', () => {
    const def = compileDef();
    const setup = setupState(def, 55003, {
      globalVars: {
        trail: 4,
        nvaResources: 73,
        vcResources: 74,
      },
      zones: {
        [CENTRAL_LAOS]: [
          makeToken('laos-moving-base', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeToken('laos-fixed-vc-base', 'base', 'VC', { tunnel: 'untunneled' }),
        ],
        [SOUTHERN_LAOS]: [
          makeToken('south-moving-base', 'base', 'NVA', { tunnel: 'untunneled' }),
          makeToken('south-fixed-tunneled-base', 'base', 'NVA', { tunnel: 'tunneled' }),
        ],
        [PARROTS_BEAK]: [
          makeToken('parrots-vc-guerrilla', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const move = findCard55Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Trucks shaded event move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending first Trucks shaded redeploy choice.');
    }
    assert.equal(firstPending.type, 'chooseOne');
    assert.deepEqual(
      firstPending.options.map((option) => String(option.value)).sort(),
      [CENTRAL_LAOS, NORTHEAST_CAMBODIA, PARROTS_BEAK, SOUTHERN_LAOS, 'sihanoukville:none', 'the-fishhook:none'].sort(),
      'After staging both moving bases, all Laos/Cambodia spaces with fewer than 2 current bases should be legal',
    );

    const firstChoiceMove: Move = {
      ...move!,
      params: {
        ...move!.params,
        [firstPending.decisionId]: SOUTHERN_LAOS,
      },
    };
    const secondPending = legalChoicesEvaluate(def, setup, firstChoiceMove);
    assert.equal(secondPending.kind, 'pending');
    if (secondPending.kind !== 'pending') {
      throw new Error('Expected pending second Trucks shaded redeploy choice.');
    }
    assert.equal(secondPending.type, 'chooseOne');
    assert.equal(
      secondPending.options.some((option) => String(option.value) === SOUTHERN_LAOS),
      false,
      'Second redeploy choice must exclude destinations that became full after the first redeploy',
    );

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$trucksBaseDestination',
        value: () => {
          if (requestCounter === 0) {
            requestCounter += 1;
            return SOUTHERN_LAOS;
          }
          requestCounter += 1;
          return CENTRAL_LAOS;
        },
      },
    ];
    let requestCounter = 0;
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;
    const selectedDestinations = [CENTRAL_LAOS, SOUTHERN_LAOS] as const;

    assert.equal(final.globalVars.nvaResources, 75, 'NVA resources should cap at 75');
    assert.equal(final.globalVars.vcResources, 75, 'VC resources should cap at 75');
    assert.equal(countFactionBases(final, CENTRAL_LAOS, 'NVA'), 1, 'Central Laos should end with exactly one NVA base after redeploy');
    assert.equal(countFactionBases(final, SOUTHERN_LAOS, 'NVA'), 2, 'Southern Laos should end with the tunneled base plus one redeployed untunneled base');
    assert.notEqual(
      findTokenZone(final, 'laos-moving-base', selectedDestinations),
      null,
      'Laos moving base should redeploy to one of the explicitly selected destinations',
    );
    assert.notEqual(
      findTokenZone(final, 'south-moving-base', selectedDestinations),
      null,
      'Southern Laos moving base should redeploy to one of the explicitly selected destinations',
    );
    assert.equal(zoneHas(final, SOUTHERN_LAOS, 'south-fixed-tunneled-base'), true, 'Tunneled base must remain in place');
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'laos-fixed-vc-base'), true, 'Non-NVA base must remain in place');
    assert.equal((final.zones[STAGING_ZONE] ?? []).length, 0, 'Staging zone should be empty after redeploy resolves');
  });
});
