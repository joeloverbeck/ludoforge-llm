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

const CARD_ID = 'card-58';
const NORTH_VIETNAM = 'north-vietnam:none';
const CENTRAL_LAOS = 'central-laos:none';
const SOUTHERN_LAOS = 'southern-laos:none';
const NORTHEAST_CAMBODIA = 'northeast-cambodia:none';
const SAIGON = 'saigon:none';
const QUANG_NAM = 'quang-nam:none';
const QUANG_TRI_THUA_THIEN = 'quang-tri-thua-thien:none';
const HUE_DA_NANG_LOC = 'loc-hue-da-nang:none';

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

const findCard58Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
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

const countFactionType = (state: GameState, zone: string, faction: string, type: string): number =>
  (state.zones[zone] ?? []).filter(
    (token) => (token as Token).props.faction === faction && (token as Token).props.type === type,
  ).length;

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

describe('FITL card-58 Pathet Lao', () => {
  it('encodes exact text, metadata, total-removal unshaded structure, and Laos-cube shaded branch', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-58 in production deck');
    assert.equal(card?.title, 'Pathet Lao');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'ARVN', 'US']);
    assert.equal(card?.unshaded?.text, 'NVA removes 6 of its pieces total from North Vietnam and Laos.');
    assert.equal(
      card?.shaded?.text,
      'If no COIN cubes in Laos, Improve Trail 2 boxes. If there are, US and ARVN Redeploy them to Vietnam.',
    );

    const unshadedChooseN = findDeep(card?.unshaded?.effects ?? [], (node) => typeof node.chooseN === 'object');
    assert.equal(unshadedChooseN.length, 1, 'Unshaded should use a single total-removal selector');
    assert.equal(
      (unshadedChooseN[0]?.chooseN as { bind?: string })?.bind,
      '$nvaPiecesToRemove',
      'Unshaded should bind a single combined North Vietnam/Laos piece set',
    );

    const shadedIfs = findDeep(card?.shaded?.effects ?? [], (node) => typeof node.if === 'object');
    assert.equal(shadedIfs.length >= 1, true, 'Shaded should branch on Laos COIN-cube presence');
    const shadedMoves = findDeep(card?.shaded?.effects ?? [], (node) => typeof node.moveToken === 'object');
    assert.equal(shadedMoves.length >= 1, true, 'Shaded should include explicit redeploy moves for Laos cubes');
  });

  it('unshaded removes exactly 6 NVA pieces total from North Vietnam and Laos, including bases', () => {
    const def = compileDef();
    const setup = setupState(def, 58001, {
      zones: {
        [NORTH_VIETNAM]: [
          makeToken('nv-t-1', 'troops', 'NVA'),
          makeToken('nv-t-2', 'troops', 'NVA'),
          makeToken('nv-g-1', 'guerrilla', 'NVA', { activity: 'active' }),
          makeToken('nv-b-1', 'base', 'NVA', { tunnel: 'untunneled' }),
        ],
        [CENTRAL_LAOS]: [
          makeToken('laos-t-1', 'troops', 'NVA'),
          makeToken('laos-g-1', 'guerrilla', 'NVA', { activity: 'underground' }),
          makeToken('laos-b-1', 'base', 'NVA', { tunnel: 'tunneled' }),
        ],
        [SOUTHERN_LAOS]: [
          makeToken('slaos-t-1', 'troops', 'NVA'),
        ],
      },
    });

    const move = findCard58Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Pathet Lao unshaded move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending combined removal choice for Pathet Lao unshaded.');
    }
    assert.equal(firstPending.type, 'chooseN');
    assert.equal(firstPending.min, 6);
    assert.equal(firstPending.max, 6);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [{
        when: (request) => request.name === '$nvaPiecesToRemove' || request.decisionId.includes('nvaPiecesToRemove'),
        value: ['nv-t-1', 'nv-g-1', 'nv-b-1', 'laos-t-1', 'laos-g-1', 'laos-b-1'],
      }],
    }).state;

    assert.equal(zoneHas(final, NORTH_VIETNAM, 'nv-t-2'), true, 'One North Vietnam piece should remain');
    assert.equal(zoneHas(final, SOUTHERN_LAOS, 'slaos-t-1'), true, 'One Laos piece should remain');
    assert.equal(zoneHas(final, NORTH_VIETNAM, 'nv-b-1'), false, 'Selected base should be removable');
    assert.deepEqual(
      zoneTokenIds(final, 'available-NVA:none').sort(),
      ['laos-b-1', 'laos-g-1', 'laos-t-1', 'nv-b-1', 'nv-g-1', 'nv-t-1'].sort(),
    );
  });

  it('unshaded removes all eligible NVA pieces when fewer than 6 exist', () => {
    const def = compileDef();
    const setup = setupState(def, 58002, {
      zones: {
        [NORTH_VIETNAM]: [
          makeToken('few-nv-1', 'troops', 'NVA'),
          makeToken('few-nv-2', 'base', 'NVA', { tunnel: 'tunneled' }),
        ],
        [CENTRAL_LAOS]: [
          makeToken('few-laos-1', 'guerrilla', 'NVA', { activity: 'active' }),
          makeToken('few-laos-2', 'troops', 'NVA'),
        ],
      },
    });

    const move = findCard58Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Pathet Lao unshaded move');

    const firstPending = legalChoicesEvaluate(def, setup, move!);
    assert.equal(firstPending.kind, 'pending');
    if (firstPending.kind !== 'pending') {
      throw new Error('Expected pending combined removal choice for Pathet Lao unshaded.');
    }
    assert.equal(firstPending.min, 4);
    assert.equal(firstPending.max, 4);

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.deepEqual(zoneTokenIds(final, NORTH_VIETNAM), []);
    assert.deepEqual(zoneTokenIds(final, CENTRAL_LAOS), []);
    assert.deepEqual(zoneTokenIds(final, 'available-NVA:none').sort(), ['few-laos-1', 'few-laos-2', 'few-nv-1', 'few-nv-2']);
  });

  it('shaded improves Trail by 2 when Laos has no COIN cubes, ignoring non-cube COIN pieces there and cubes in Cambodia', () => {
    const def = compileDef();
    const setup = setupState(def, 58003, {
      globalVars: { trail: 3 },
      zones: {
        [CENTRAL_LAOS]: [
          makeToken('us-base-laos', 'base', 'US'),
          makeToken('arvn-ranger-laos', 'ranger', 'ARVN'),
        ],
        [NORTHEAST_CAMBODIA]: [
          makeToken('us-t-cam', 'troops', 'US'),
          makeToken('arvn-p-cam', 'police', 'ARVN'),
        ],
      },
    });

    const move = findCard58Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Pathet Lao shaded move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;

    assert.equal(final.globalVars.trail, 4, 'Trail should improve by 2 with the 4-box cap');
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'us-base-laos'), true, 'Non-cube COIN pieces in Laos should not trigger redeploy');
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'arvn-ranger-laos'), true, 'Rangers in Laos should remain in place');
    assert.equal(zoneHas(final, NORTHEAST_CAMBODIA, 'us-t-cam'), true, 'Cambodia cubes should not affect the Laos branch');
    assert.equal(zoneHas(final, NORTHEAST_CAMBODIA, 'arvn-p-cam'), true, 'Cambodia cubes should not redeploy via this event');
  });

  it('shaded redeploys only Laos COIN cubes to Vietnam using faction-specific destination rules', () => {
    const def = compileDef();
    const setup = setupState(def, 58004, {
      globalVars: { trail: 1 },
      zones: {
        [CENTRAL_LAOS]: [
          makeToken('us-t-laos', 'troops', 'US'),
          makeToken('arvn-t-laos', 'troops', 'ARVN'),
          makeToken('arvn-p-laos', 'police', 'ARVN'),
          makeToken('arvn-r-laos', 'ranger', 'ARVN'),
          makeToken('us-b-laos', 'base', 'US'),
        ],
        [SOUTHERN_LAOS]: [
          makeToken('us-t-laos-2', 'troops', 'US'),
        ],
        [NORTHEAST_CAMBODIA]: [
          makeToken('us-t-cam-edge', 'troops', 'US'),
        ],
        [QUANG_NAM]: [
          makeToken('us-b-quang-nam', 'base', 'US'),
          makeToken('nva-t-quang-nam', 'troops', 'NVA'),
        ],
        [QUANG_TRI_THUA_THIEN]: [
          makeToken('vc-g-quang-tri-1', 'guerrilla', 'VC', { activity: 'active' }),
          makeToken('vc-g-quang-tri-2', 'guerrilla', 'VC', { activity: 'underground' }),
        ],
        [SAIGON]: [
          makeToken('nva-t-saigon', 'troops', 'NVA'),
        ],
      },
    });

    const move = findCard58Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Pathet Lao shaded move');

    let usDestinationDecisions = 0;
    let policeDestinationOptions: string[] = [];
    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) =>
          request.name.includes('pathetLaoUsDestination') || request.decisionId.includes('pathetLaoUsDestination'),
        value: (request) => {
          usDestinationDecisions += 1;
          const preferredDestination = usDestinationDecisions === 1 ? HUE_DA_NANG_LOC : SAIGON;
          return request.options.some((option) => option.value === preferredDestination) ? preferredDestination : undefined;
        },
      },
      {
        when: (request) =>
          (request.name.includes('pathetLaoArvnTroopDestination') || request.decisionId.includes('pathetLaoArvnTroopDestination'))
          && request.options.some((option) => option.value === QUANG_NAM),
        value: QUANG_NAM,
      },
      {
        when: (request) =>
          (request.name.includes('pathetLaoArvnPoliceDestination') || request.decisionId.includes('pathetLaoArvnPoliceDestination'))
          && request.options.some((option) => option.value === HUE_DA_NANG_LOC),
        value: (request) => {
          policeDestinationOptions = request.options.map((option) => String(option.value));
          return HUE_DA_NANG_LOC;
        },
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(final.globalVars.trail, 1, 'Trail should not improve when Laos contains COIN cubes');

    assert.equal(policeDestinationOptions.includes(HUE_DA_NANG_LOC), true, 'ARVN Police should still be able to redeploy to a South Vietnam LoC');
    assert.equal(policeDestinationOptions.includes(QUANG_NAM), true, 'ARVN Police should still be able to redeploy to a US/ARVN-controlled South Vietnam space');
    assert.equal(
      policeDestinationOptions.includes(QUANG_TRI_THUA_THIEN),
      false,
      'ARVN Police must not be offered South Vietnam spaces controlled only by VC',
    );
    assert.equal(countFactionType(final, HUE_DA_NANG_LOC, 'US', 'troops'), 1, 'US troops may redeploy to a South Vietnam LoC');
    assert.equal(zoneHas(final, QUANG_NAM, 'arvn-t-laos'), true, 'ARVN troops may redeploy to a South Vietnam space with a COIN base');
    assert.equal(zoneHas(final, HUE_DA_NANG_LOC, 'arvn-p-laos'), true, 'ARVN police may redeploy to a South Vietnam LoC');
    assert.equal(zoneHas(final, SAIGON, 'us-t-laos-2'), true, 'A second US troop should also redeploy into South Vietnam');

    assert.equal(zoneHas(final, CENTRAL_LAOS, 'arvn-r-laos'), true, 'ARVN Rangers are not COIN cubes and should remain in Laos');
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'us-b-laos'), true, 'US bases are not COIN cubes and should remain in Laos');
    assert.equal(zoneHas(final, NORTHEAST_CAMBODIA, 'us-t-cam-edge'), true, 'Cambodia cubes should not redeploy via this event');
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'us-t-laos'), false);
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'arvn-t-laos'), false);
    assert.equal(zoneHas(final, CENTRAL_LAOS, 'arvn-p-laos'), false);
    assert.equal(zoneHas(final, SOUTHERN_LAOS, 'us-t-laos-2'), false);
  });
});
