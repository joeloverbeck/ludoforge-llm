// @test-class: architectural-invariant
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
  legalMoves,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';

const CARD_ID = 'card-90';

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
  zoneTokens: Readonly<Record<string, readonly Token[]>>,
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const base = clearAllZones(initialState(def, seed, 4).state);
  return {
    ...base,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zoneTokens,
    },
  };
};

const findRostowMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

const countTokens = (
  state: GameState,
  zone: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zone] ?? []).filter((token) => predicate(token)).length;

const zoneHas = (state: GameState, zone: string, tokenId: string): boolean =>
  (state.zones[zone] ?? []).some((token) => token.id === asTokenId(tokenId));

describe('FITL card-90 Walt Rostow', () => {
  it('unshaded moves up to 2 selected ARVN pieces from anywhere into COIN-controlled spaces', () => {
    const def = compileDef();
    const setup = setupState(def, 90001, {
      'quang-nam:none': [makeToken('rostow-arvn-base-map', 'base', 'ARVN', { tunnel: 'untunneled' })],
      'available-ARVN:none': [makeToken('rostow-arvn-police-av', 'police', 'ARVN')],
      'out-of-play-ARVN:none': [makeToken('rostow-arvn-trp-oop', 'troops', 'ARVN')],
      'da-nang:none': [makeToken('rostow-us-da-nang', 'troops', 'US')],
      'hue:none': [makeToken('rostow-us-hue', 'troops', 'US')],
    });

    const move = findRostowMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-90 unshaded move');

    const destinations = ['da-nang:none', 'hue:none'];
    let destinationIndex = 0;
    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$rostowArvnPieces',
        value: [asTokenId('rostow-arvn-base-map'), asTokenId('rostow-arvn-trp-oop')],
      },
      {
        when: (request) => request.name.includes('$rostowCoinControlDestination'),
        value: () => {
          const value = destinations[destinationIndex] ?? 'da-nang:none';
          destinationIndex += 1;
          return value;
        },
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(zoneHas(final, 'da-nang:none', 'rostow-arvn-base-map'), true);
    assert.equal(zoneHas(final, 'hue:none', 'rostow-arvn-trp-oop'), true);
    assert.equal(zoneHas(final, 'quang-nam:none', 'rostow-arvn-base-map'), false);
    assert.equal(zoneHas(final, 'out-of-play-ARVN:none', 'rostow-arvn-trp-oop'), false);
    assert.equal(
      zoneHas(final, 'available-ARVN:none', 'rostow-arvn-police-av'),
      true,
      'Unselected ARVN piece should remain in source pool',
    );
  });

  it('unshaded gracefully resolves as no-op when no COIN-controlled destination exists', () => {
    const def = compileDef();
    const setup = setupState(def, 90002, {
      'out-of-play-ARVN:none': [makeToken('rostow2-arvn-trp-oop', 'troops', 'ARVN')],
    });

    const move = findRostowMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-90 unshaded move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!).state;
    assert.deepEqual(final.zones, setup.zones);
  });

  it('shaded places guerrillas per ARVN province and redeploys ARVN troops from Provinces/LoCs as if no Bases', () => {
    const def = compileDef();
    const setup = setupState(def, 90003, {
      'quang-nam:none': [
        makeToken('rostow3-arvn-trp-qn', 'troops', 'ARVN'),
        makeToken('rostow3-arvn-pol-qn', 'police', 'ARVN'),
      ],
      'quang-tri-thua-thien:none': [makeToken('rostow3-arvn-trp-qttt', 'troops', 'ARVN')],
      'loc-hue-da-nang:none': [makeToken('rostow3-arvn-trp-loc', 'troops', 'ARVN')],
      'da-nang:none': [
        makeToken('rostow3-nva-dn-1', 'troops', 'NVA'),
        makeToken('rostow3-nva-dn-2', 'troops', 'NVA'),
      ],
      'hue:none': [
        makeToken('rostow3-nva-hue-1', 'troops', 'NVA'),
        makeToken('rostow3-nva-hue-2', 'troops', 'NVA'),
      ],
      'saigon:none': [makeToken('rostow3-nva-sai', 'troops', 'NVA')],
      'available-VC:none': [
        makeToken('rostow3-vc-g-1', 'guerrilla', 'VC', { activity: 'underground' }),
        makeToken('rostow3-vc-g-2', 'guerrilla', 'VC', { activity: 'underground' }),
      ],
    });

    const move = findRostowMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-90 shaded move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name.includes('$rostowRedeployDestination'),
          value: ['saigon:none'],
        },
      ],
    }).state;

    assert.equal(
      countTokens(final, 'quang-nam:none', (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      1,
      'Province with ARVN should receive one guerrilla',
    );
    assert.equal(
      countTokens(final, 'quang-tri-thua-thien:none', (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      1,
      'Each ARVN province should receive one guerrilla',
    );

    assert.equal(countTokens(final, 'quang-nam:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 0);
    assert.equal(countTokens(final, 'quang-tri-thua-thien:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 0);
    assert.equal(countTokens(final, 'loc-hue-da-nang:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'), 0);
    assert.equal(
      countTokens(final, 'saigon:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      3,
      'All redeployed ARVN troops should move immediately to legal destinations even when only Saigon is legal',
    );
    assert.equal(
      countTokens(final, 'quang-nam:none', (token) => token.props.faction === 'ARVN' && token.type === 'police'),
      1,
      'Only ARVN troops redeploy; ARVN police remain',
    );
  });

  it('shaded handles constrained guerrilla supply and provinces with ARVN non-troop pieces', () => {
    const def = compileDef();
    const setup = setupState(def, 90004, {
      'quang-nam:none': [makeToken('rostow4-arvn-pol-qn', 'police', 'ARVN')],
      'quang-tri-thua-thien:none': [makeToken('rostow4-arvn-base-qttt', 'base', 'ARVN', { tunnel: 'untunneled' })],
      'quang-tin-quang-ngai:none': [makeToken('rostow4-arvn-trp-th', 'troops', 'ARVN')],
      'saigon:none': [makeToken('rostow4-us-sai', 'troops', 'US')],
      'available-NVA:none': [makeToken('rostow4-nva-g-1', 'guerrilla', 'NVA', { activity: 'underground' })],
    });

    const move = findRostowMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-90 shaded move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: (request) => request.name.includes('$rostowRedeployDestination'),
          value: ['saigon:none'],
        },
      ],
    }).state;

    const placedGuerrillas =
      countTokens(final, 'quang-nam:none', (token) => token.type === 'guerrilla')
      + countTokens(final, 'quang-tri-thua-thien:none', (token) => token.type === 'guerrilla')
      + countTokens(final, 'quang-tin-quang-ngai:none', (token) => token.type === 'guerrilla');
    assert.equal(placedGuerrillas, 1, 'Placement should cap at available guerrilla supply');
    assert.equal(
      countTokens(final, 'available-NVA:none', (token) => token.type === 'guerrilla'),
      0,
      'Available guerrilla supply should be consumed exactly once',
    );

    assert.equal(
      countTokens(final, 'quang-tin-quang-ngai:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      0,
    );
    assert.equal(
      countTokens(final, 'saigon:none', (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      1,
      'ARVN troops redeploy even when other ARVN piece types are merely placement qualifiers',
    );
  });
});
