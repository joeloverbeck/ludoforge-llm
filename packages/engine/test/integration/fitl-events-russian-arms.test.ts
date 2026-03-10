import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  type GameDef,
  type GameState,
  type Move,
  type Token,
} from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const CARD_ID = 'card-49';
const SAIGON = 'saigon:none';
const HUE = 'hue:none';
const QUANG_TRI = 'quang-tri-thua-thien:none';
const DA_NANG = 'da-nang:none';
const CENTRAL_LAOS = 'central-laos:none';

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

const countMatching = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter((token) => predicate(token as Token)).length;

const setupCardDrivenState = (
  def: GameDef,
  seed: number,
  activePlayer: number,
  firstEligible: 'us' | 'arvn' | 'nva' | 'vc',
  secondEligible: 'us' | 'arvn' | 'nva' | 'vc',
  zones: Readonly<Record<string, readonly Token[]>>,
): GameState => {
  const base = clearAllZones(initialState(def, seed, 4).state);
  const runtime = requireCardDrivenRuntime(base);
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected event deck');

  return {
    ...base,
    activePlayer: asPlayerId(activePlayer),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        currentCard: {
          ...runtime.currentCard,
          firstEligible,
          secondEligible,
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken(CARD_ID, 'card', 'none')],
      ...zones,
    },
  };
};

const findCardMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded'): Move | undefined =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === CARD_ID),
  );

describe('FITL card-49 Russian Arms', () => {
  it('encodes exact text, South Vietnam ARVN placement, and NVA-owned shaded free Bombard flow', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === CARD_ID);
    assert.notEqual(card, undefined);

    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'ARVN', 'VC', 'US']);
    assert.equal(card?.metadata?.flavorText, 'Soviet escalation matched.');
    assert.equal(card?.unshaded?.text, 'Place any 6 ARVN pieces anywhere in South Vietnam.');
    assert.equal(
      card?.shaded?.text,
      'NVA in any 3 spaces places enough Troops to double their number. It then free Bombards.',
    );
    assert.deepEqual(card?.shaded?.freeOperationGrants, [
      {
        seat: 'nva',
        sequence: { batch: 'russian-arms-nva-bombard', step: 0 },
        operationClass: 'operation',
        actionIds: ['bombard'],
      },
    ]);

    const unshadedText = JSON.stringify(card?.unshaded?.effects ?? []);
    assert.match(unshadedText, /"bind":"\$russianArmsArvnPieces"/);
    assert.match(unshadedText, /"country".*"southVietnam"/);
    assert.match(unshadedText, /"bind":"\$russianArmsDestination@\{\$arvnPiece\}"/);
    assert.match(unshadedText, /"type".*"base"/);
    assert.match(unshadedText, /"right":2/);

    const shadedText = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(shadedText, /"bind":"\$russianArmsShadedSpace1"/);
    assert.match(shadedText, /"bind":"\$russianArmsShadedSpace2"/);
    assert.match(shadedText, /"bind":"\$russianArmsShadedSpace3"/);
    assert.match(shadedText, /"chooser":\{"id":2\}/);
    assert.match(shadedText, /"available-NVA:none"/);
  });

  it('unshaded places exactly 6 chosen ARVN pieces from Available into South Vietnam and respects base stacking destinations', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 49001, 2, 'nva', 'arvn', {
      'available-ARVN:none': [
        makeToken('russian-arms-arvn-t-1', 'troops', 'ARVN'),
        makeToken('russian-arms-arvn-t-2', 'troops', 'ARVN'),
        makeToken('russian-arms-arvn-t-3', 'troops', 'ARVN'),
        makeToken('russian-arms-arvn-p-1', 'police', 'ARVN'),
        makeToken('russian-arms-arvn-r-1', 'ranger', 'ARVN', { activity: 'underground' }),
        makeToken('russian-arms-arvn-b-1', 'base', 'ARVN'),
        makeToken('russian-arms-arvn-extra', 'troops', 'ARVN'),
      ],
      [HUE]: [makeToken('russian-arms-existing-base', 'base', 'US')],
      [DA_NANG]: [
        makeToken('russian-arms-full-base-1', 'base', 'US'),
        makeToken('russian-arms-full-base-2', 'base', 'ARVN'),
      ],
      [CENTRAL_LAOS]: [makeToken('russian-arms-outside-south-marker', 'troops', 'NVA')],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Russian Arms unshaded event move');

    const selectedPieces = [
      asTokenId('russian-arms-arvn-t-1'),
      asTokenId('russian-arms-arvn-t-2'),
      asTokenId('russian-arms-arvn-t-3'),
      asTokenId('russian-arms-arvn-p-1'),
      asTokenId('russian-arms-arvn-r-1'),
      asTokenId('russian-arms-arvn-b-1'),
    ];

    const overrides: readonly DecisionOverrideRule[] = [
      { when: (req) => req.name === '$russianArmsArvnPieces', value: selectedPieces },
      { when: (req) => req.name === `$russianArmsDestination@${asTokenId('russian-arms-arvn-t-1')}`, value: SAIGON },
      { when: (req) => req.name === `$russianArmsDestination@${asTokenId('russian-arms-arvn-t-2')}`, value: SAIGON },
      { when: (req) => req.name === `$russianArmsDestination@${asTokenId('russian-arms-arvn-t-3')}`, value: QUANG_TRI },
      { when: (req) => req.name === `$russianArmsDestination@${asTokenId('russian-arms-arvn-p-1')}`, value: QUANG_TRI },
      { when: (req) => req.name === `$russianArmsDestination@${asTokenId('russian-arms-arvn-r-1')}`, value: HUE },
      { when: (req) => req.name === `$russianArmsDestination@${asTokenId('russian-arms-arvn-b-1')}`, value: HUE },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countMatching(final, 'available-ARVN:none', (token) => token.props.faction === 'ARVN'), 1);
    assert.equal(
      countMatching(final, 'available-ARVN:none', (token) => token.id === asTokenId('russian-arms-arvn-extra')),
      1,
      'Exactly one unselected ARVN piece should remain in Available',
    );
    assert.equal(countMatching(final, SAIGON, (token) => token.props.faction === 'ARVN'), 2);
    assert.equal(countMatching(final, QUANG_TRI, (token) => token.props.faction === 'ARVN'), 2);
    assert.equal(
      countMatching(final, HUE, (token) => token.props.faction === 'ARVN'),
      2,
      'Hue should receive the selected Ranger and Base',
    );
    assert.equal(
      countMatching(final, HUE, (token) => token.type === 'base'),
      2,
      'Base placement should only target South Vietnam spaces with room under the 2-base cap',
    );
    assert.equal(
      countMatching(final, DA_NANG, (token) => token.id === asTokenId('russian-arms-arvn-b-1')),
      0,
      'The selected ARVN Base must not enter a full 2-base space',
    );
    assert.equal(
      countMatching(final, CENTRAL_LAOS, (token) => token.props.faction === 'ARVN'),
      0,
      'Unshaded must not place ARVN pieces outside South Vietnam',
    );
  });

  it('unshaded places all available ARVN pieces when fewer than 6 exist', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 49002, 3, 'vc', 'us', {
      'available-ARVN:none': [
        makeToken('russian-arms-limited-1', 'troops', 'ARVN'),
        makeToken('russian-arms-limited-2', 'police', 'ARVN'),
        makeToken('russian-arms-limited-3', 'base', 'ARVN'),
        makeToken('russian-arms-limited-4', 'ranger', 'ARVN', { activity: 'underground' }),
      ],
      [SAIGON]: [],
    });

    const move = findCardMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected Russian Arms unshaded move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        { when: (req) => req.name === '$russianArmsArvnPieces', value: [
          asTokenId('russian-arms-limited-1'),
          asTokenId('russian-arms-limited-2'),
          asTokenId('russian-arms-limited-3'),
          asTokenId('russian-arms-limited-4'),
        ] },
        { when: (req) => req.name.startsWith('$russianArmsDestination@'), value: SAIGON },
      ],
    }).state;

    assert.equal(countMatching(final, 'available-ARVN:none', (token) => token.props.faction === 'ARVN'), 0);
    assert.equal(countMatching(final, SAIGON, (token) => token.props.faction === 'ARVN'), 4);
  });

  it('shaded lets NVA double up to 3 spaces exactly, then consume a free Bombard on a different legal space', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 49003, 1, 'arvn', 'vc', {
      'available-NVA:none': Array.from({ length: 8 }, (_, index) =>
        makeToken(`russian-arms-nva-avail-${index + 1}`, 'troops', 'NVA'),
      ),
      [SAIGON]: [makeToken('russian-arms-sai-nva-1', 'troops', 'NVA')],
      [HUE]: [
        makeToken('russian-arms-hue-nva-1', 'troops', 'NVA'),
        makeToken('russian-arms-hue-nva-2', 'troops', 'NVA'),
      ],
      [QUANG_TRI]: [
        makeToken('russian-arms-qt-nva-1', 'troops', 'NVA'),
        makeToken('russian-arms-qt-nva-2', 'troops', 'NVA'),
        makeToken('russian-arms-qt-nva-3', 'troops', 'NVA'),
      ],
      [DA_NANG]: [
        makeToken('russian-arms-da-nang-arvn-1', 'troops', 'ARVN'),
        makeToken('russian-arms-da-nang-arvn-2', 'troops', 'ARVN'),
        makeToken('russian-arms-da-nang-arvn-3', 'troops', 'ARVN'),
      ],
      'quang-nam:none': [
        makeToken('russian-arms-quang-nam-nva-1', 'troops', 'NVA'),
        makeToken('russian-arms-quang-nam-nva-2', 'troops', 'NVA'),
        makeToken('russian-arms-quang-nam-nva-3', 'troops', 'NVA'),
      ],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Russian Arms shaded event move');

    const afterEvent = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        { when: (req) => req.name === '$russianArmsShadedSpace1', value: [SAIGON] },
        { when: (req) => req.name === '$russianArmsShadedSpace2', value: [HUE] },
        { when: (req) => req.name === '$russianArmsShadedSpace3', value: [QUANG_TRI] },
      ],
    }).state;

    assert.equal(countMatching(afterEvent, SAIGON, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 2);
    assert.equal(countMatching(afterEvent, HUE, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 4);
    assert.equal(countMatching(afterEvent, QUANG_TRI, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 6);
    assert.equal(
      countMatching(afterEvent, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'),
      2,
      'Doubling 1 + 2 + 3 troops should spend 6 from Available',
    );

    const pending = requireCardDrivenRuntime(afterEvent).pendingFreeOperationGrants ?? [];
    assert.equal(pending.length, 1);
    assert.equal(pending[0]?.seat, 'nva');
    assert.deepEqual(pending[0]?.actionIds, ['bombard']);

    const grantReadyState: GameState = {
      ...afterEvent,
      activePlayer: asPlayerId(2),
      turnOrderState: {
        type: 'cardDriven',
        runtime: {
          ...requireCardDrivenRuntime(afterEvent),
          currentCard: {
            ...requireCardDrivenRuntime(afterEvent).currentCard,
            firstEligible: 'nva',
            secondEligible: null,
            actedSeats: [],
            passedSeats: [],
            nonPassCount: 0,
            firstActionClass: null,
          },
        },
      },
    };

    const freeBombardMove = legalMoves(def, grantReadyState).find(
      (candidate) => String(candidate.actionId) === 'bombard' && candidate.freeOperation === true,
    );
    assert.notEqual(freeBombardMove, undefined, 'Expected free Bombard legal move from Russian Arms');

    const afterBombard = applyMoveWithResolvedDecisionIds(def, grantReadyState, {
      ...freeBombardMove!,
      params: {
        ...freeBombardMove!.params,
        $targetSpaces: [DA_NANG],
        [`$bombardFaction@${DA_NANG}`]: 'ARVN',
        [`$bombardTroops@${DA_NANG}`]: [asTokenId('russian-arms-da-nang-arvn-1')],
      },
    }).state;

    assert.equal(
      countMatching(afterBombard, DA_NANG, (token) => token.props.faction === 'ARVN' && token.type === 'troops'),
      2,
      'Free Bombard should work on a different legal space than the three doubled spaces',
    );
    assert.equal(
      countMatching(afterBombard, 'available-ARVN:none', (token) => token.id === asTokenId('russian-arms-da-nang-arvn-1')),
      1,
      'Bombard should route the removed ARVN troop to Available',
    );
  });

  it('shaded prevents selecting later spaces once availability can no longer fully double them', () => {
    const def = compileDef();
    const setup = setupCardDrivenState(def, 49004, 3, 'vc', 'us', {
      'available-NVA:none': [
        makeToken('russian-arms-tight-1', 'troops', 'NVA'),
        makeToken('russian-arms-tight-2', 'troops', 'NVA'),
      ],
      [SAIGON]: [
        makeToken('russian-arms-tight-sai-1', 'troops', 'NVA'),
        makeToken('russian-arms-tight-sai-2', 'troops', 'NVA'),
      ],
      [HUE]: [makeToken('russian-arms-tight-hue-1', 'troops', 'NVA')],
    });

    const move = findCardMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected Russian Arms shaded move');

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        { when: (req) => req.name === '$russianArmsShadedSpace1', value: [SAIGON] },
        { when: (req) => req.name === '$russianArmsShadedSpace2', value: [] },
        { when: (req) => req.name === '$russianArmsShadedSpace3', value: [] },
      ],
    }).state;

    assert.equal(countMatching(final, SAIGON, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 4);
    assert.equal(countMatching(final, HUE, (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.equal(countMatching(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 0);
  });
});
