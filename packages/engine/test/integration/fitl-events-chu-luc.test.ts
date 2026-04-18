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
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-47';
const DOUBLING_SPACE = 'saigon:none';
const SECOND_ASSAULT_SPACE = 'hue:none';
const UNDERGROUND_ONLY_SPACE = 'quang-tri-thua-thien:none';
const NORTH_VIETNAM = 'north-vietnam:none';
const CENTRAL_LAOS = 'central-laos:none';
const NORTH_BORDER_LOC = 'loc-hue-khe-sanh:none';

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

const setupState = (def: GameDef, seed: number, zones: Readonly<Record<string, readonly Token[]>>): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  assert.equal(base.turnOrderState.type, 'cardDriven');
  const runtime = requireCardDrivenRuntime(base);
  return {
    ...base,
    activePlayer: asPlayerId(2),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible: 'nva',
          secondEligible: 'arvn',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      'played:none': [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
  };
};

const findCard47Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countMatching = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

describe('FITL card-47 Chu Luc', () => {
  it('encodes exact card text plus executable unshaded doubling/targeted-assault and shaded border placement payloads', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef!.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    const parsedCard = parsed.doc.eventDecks?.[0]?.cards?.find((entry) => entry.id === CARD_ID);

    assert.notEqual(card, undefined, 'Expected card-47 in production deck');
    assert.equal(card?.unshaded?.text, 'Add ARVN Troops to double the ARVN pieces in a space with NVA. All ARVN free Assault NVA.');
    assert.equal(card?.shaded?.text, 'Place up to 10 NVA Troops anywhere within 1 space of North Vietnam.');
    assert.equal(typeof (card?.unshaded?.effects?.[0] as { if?: unknown } | undefined)?.if, 'object');
    assert.equal(typeof (card?.unshaded?.effects?.[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.equal((card?.shaded?.effects?.[0] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$nvaTroopsToPlace');
    assert.equal(typeof (card?.shaded?.effects?.[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.equal(card?.unshaded?.freeOperationGrants, undefined, 'Chu Luc unshaded should resolve via event effects, not generic assault grants');
    const serializedUnshaded = JSON.stringify(card?.unshaded?.effects ?? []);
    const serializedParsedUnshaded = JSON.stringify(parsedCard?.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /coin-assault-removal-order/, 'Chu Luc unshaded should use the shared assault removal helper');
    assert.doesNotMatch(serializedUnshaded, /coin-assault-removal-order-single-faction/, 'Chu Luc unshaded should not depend on the removed single-faction helper');
    assert.match(serializedParsedUnshaded, /targetFactions/, 'Chu Luc unshaded should specify targeted shared-assault factions explicitly in authored data');
    assert.doesNotMatch(serializedParsedUnshaded, /chooseTargetFactionFirst/, 'Chu Luc unshaded should derive first-faction handling from targetFactions alone');
    assert.doesNotMatch(serializedParsedUnshaded, /fixedTargetFactionFirst/, 'Chu Luc unshaded should not retain fixed first-faction control arguments');
    assert.doesNotMatch(serializedParsedUnshaded, /targetFactionMode/, 'Chu Luc unshaded should not keep the legacy targetFactionMode alias');
  });

  it('unshaded doubles ARVN pieces in the chosen space, then assaults NVA only in every eligible space', () => {
    const def = compileDef();
    const setup = setupState(def, 47001, {
      [DOUBLING_SPACE]: [
        makeToken('arvn-base-sai', 'base', 'ARVN', { tunnel: 'untunneled' }),
        makeToken('arvn-t-sai', 'troops', 'ARVN'),
        makeToken('arvn-p-sai', 'police', 'ARVN'),
        makeToken('arvn-r-sai', 'ranger', 'ARVN', { activity: 'underground' }),
        makeToken('nva-t-sai', 'troops', 'NVA'),
        makeToken('nva-g-sai', 'guerrilla', 'NVA', { activity: 'active' }),
        makeToken('nva-b-sai', 'base', 'NVA', { tunnel: 'untunneled' }),
        makeToken('vc-g-sai', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
      [SECOND_ASSAULT_SPACE]: [
        makeToken('arvn-t-hue', 'troops', 'ARVN'),
        makeToken('arvn-p-hue', 'police', 'ARVN'),
        makeToken('nva-t-hue', 'troops', 'NVA'),
        makeToken('vc-g-hue', 'guerrilla', 'VC', { activity: 'active' }),
      ],
      [UNDERGROUND_ONLY_SPACE]: [
        makeToken('arvn-t-qt', 'troops', 'ARVN'),
        makeToken('nva-g-qt', 'guerrilla', 'NVA', { activity: 'underground' }),
      ],
      'available-ARVN:none': [
        makeToken('arvn-avail-1', 'troops', 'ARVN'),
        makeToken('arvn-avail-2', 'troops', 'ARVN'),
        makeToken('arvn-avail-3', 'troops', 'ARVN'),
        makeToken('arvn-avail-4', 'troops', 'ARVN'),
        makeToken('arvn-avail-5', 'troops', 'ARVN'),
        makeToken('arvn-avail-6', 'troops', 'ARVN'),
      ],
    });

    const move = findCard47Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-47 unshaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (req) => req.name === '$doublingSpace', value: DOUBLING_SPACE },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countMatching(final, DOUBLING_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      5,
      'Chosen space should gain 4 ARVN troops because all ARVN pieces there, including Base and Ranger, count for doubling',
    );
    assert.equal(
      countMatching(final, 'available-ARVN:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      2,
      'Exactly 4 ARVN troops should move from Available to the doubling space',
    );
    assert.equal(
      countMatching(final, DOUBLING_SPACE, (token) => token.id === asTokenId('nva-t-sai')),
      0,
      'Chosen space Assault should remove NVA troops first',
    );
    assert.equal(
      countMatching(final, DOUBLING_SPACE, (token) => token.id === asTokenId('nva-g-sai')),
      0,
      'Chosen space Assault should then remove active NVA guerrillas',
    );
    assert.equal(
      countMatching(final, DOUBLING_SPACE, (token) => token.id === asTokenId('nva-b-sai')),
      1,
      'Underground VC guerrillas should still block NVA base removal during Chu Luc Assault',
    );
    assert.equal(
      countMatching(final, DOUBLING_SPACE, (token) => token.id === asTokenId('vc-g-sai')),
      1,
      'Chu Luc unshaded must not remove VC pieces while assaulting NVA only',
    );
    assert.equal(
      countMatching(final, SECOND_ASSAULT_SPACE, (token) => token.id === asTokenId('nva-t-hue')),
      0,
      'Each eligible ARVN+exposed-NVA space should also resolve the NVA-only Assault',
    );
    assert.equal(
      countMatching(final, SECOND_ASSAULT_SPACE, (token) => token.id === asTokenId('vc-g-hue')),
      1,
      'Non-target VC pieces in other assaulted spaces must remain untouched',
    );
    assert.equal(
      countMatching(final, UNDERGROUND_ONLY_SPACE, (token) => token.id === asTokenId('nva-g-qt')),
      1,
      'Spaces with only underground NVA should not be assaulted by Chu Luc',
    );
  });

  it('unshaded caps troop placement by ARVN availability', () => {
    const def = compileDef();
    const setup = setupState(def, 47002, {
      [DOUBLING_SPACE]: [
        makeToken('arvn-base-sai', 'base', 'ARVN'),
        makeToken('arvn-t-sai', 'troops', 'ARVN'),
        makeToken('arvn-p-sai', 'police', 'ARVN'),
        makeToken('arvn-r-sai', 'ranger', 'ARVN', { activity: 'underground' }),
        makeToken('nva-t-sai', 'troops', 'NVA'),
      ],
      'available-ARVN:none': [
        makeToken('arvn-avail-1', 'troops', 'ARVN'),
        makeToken('arvn-avail-2', 'troops', 'ARVN'),
      ],
    });

    const move = findCard47Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-47 unshaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [{ when: (req) => req.name === '$doublingSpace', value: DOUBLING_SPACE }],
    }).state;

    assert.equal(
      countMatching(final, DOUBLING_SPACE, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      3,
      'Doubling should place only the available ARVN troops when fewer than the required count exist',
    );
    assert.equal(
      countMatching(final, 'available-ARVN:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      0,
      'All available ARVN troops should be exhausted when the doubling demand exceeds availability',
    );
  });

  it('unshaded is a legal no-op when no space has both ARVN and NVA', () => {
    const def = compileDef();
    const setup = setupState(def, 47003, {
      [DOUBLING_SPACE]: [makeToken('arvn-only', 'troops', 'ARVN')],
      [SECOND_ASSAULT_SPACE]: [makeToken('nva-only', 'troops', 'NVA')],
      'available-ARVN:none': [makeToken('arvn-avail-1', 'troops', 'ARVN')],
    });

    const move = findCard47Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-47 unshaded move even with no eligible shared space');

    const final = applyMove(def, setup, move!).state;
    assert.deepEqual(final.zones, setup.zones, 'Chu Luc unshaded should no-op when no shared ARVN+NVA space exists');
  });

  it('shaded places up to 10 NVA troops only in North Vietnam and adjacent spaces', () => {
    const def = compileDef();
    const setup = setupState(def, 47004, {
      'available-NVA:none': Array.from({ length: 12 }, (_, idx) => makeToken(`nva-avail-${idx + 1}`, 'troops', 'NVA')),
      [SECOND_ASSAULT_SPACE]: [makeToken('marker-hue', 'troops', 'ARVN')],
    });

    const move = findCard47Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-47 shaded event move');

    const selectedIds = Array.from({ length: 10 }, (_, idx) => asTokenId(`nva-avail-${idx + 1}`));
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        { when: (req) => req.name === '$nvaTroopsToPlace', value: selectedIds },
        {
          when: (req) => req.name.startsWith('$chuLucDestination@'),
          value: (req) => {
            const tokenId = req.name.slice('$chuLucDestination@'.length);
            if (tokenId.endsWith('1') || tokenId.endsWith('2') || tokenId.endsWith('3') || tokenId.endsWith('4')) {
              return NORTH_VIETNAM;
            }
            if (tokenId.endsWith('5') || tokenId.endsWith('6') || tokenId.endsWith('7')) {
              return CENTRAL_LAOS;
            }
            if (tokenId.endsWith('8') || tokenId.endsWith('9')) {
              return UNDERGROUND_ONLY_SPACE;
            }
            return NORTH_BORDER_LOC;
          },
        },
      ],
    }).state;

    assert.equal(
      countMatching(final, NORTH_VIETNAM, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      4,
      'Shaded should allow placement directly into North Vietnam',
    );
    assert.equal(
      countMatching(final, CENTRAL_LAOS, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      3,
      'Shaded should allow placement into Central Laos',
    );
    assert.equal(
      countMatching(final, UNDERGROUND_ONLY_SPACE, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      2,
      'Shaded should allow placement into Quang Tri',
    );
    assert.equal(
      countMatching(final, NORTH_BORDER_LOC, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      1,
      'Shaded should allow placement onto the North Vietnam border LoC',
    );
    assert.equal(
      countMatching(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      2,
      'Shaded should place at most 10 troops from Available',
    );
    assert.equal(
      countMatching(final, SECOND_ASSAULT_SPACE, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      0,
      'Shaded must not place troops outside the North Vietnam one-space border arc',
    );
  });

  it('shaded places all available NVA troops when fewer than 10 exist', () => {
    const def = compileDef();
    const setup = setupState(def, 47005, {
      'available-NVA:none': [
        makeToken('nva-avail-1', 'troops', 'NVA'),
        makeToken('nva-avail-2', 'troops', 'NVA'),
        makeToken('nva-avail-3', 'troops', 'NVA'),
      ],
    });

    const move = findCard47Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-47 shaded event move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (req) => req.name === '$nvaTroopsToPlace',
          value: [asTokenId('nva-avail-1'), asTokenId('nva-avail-2'), asTokenId('nva-avail-3')],
        },
        {
          when: (req) => req.name.startsWith('$chuLucDestination@'),
          value: NORTH_VIETNAM,
        },
      ],
    }).state;

    assert.equal(
      countMatching(final, NORTH_VIETNAM, (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      3,
      'Shaded should place every available troop when fewer than 10 exist',
    );
    assert.equal(
      countMatching(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      0,
      'No NVA troops should remain in Available after placing the full smaller pool',
    );
  });
});
