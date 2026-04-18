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
          secondEligible: 'us',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      'played:none': [makeToken('card-37', 'card', 'none')],
      ...zones,
    },
  };
};

const findCard37Move = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-37'),
  );

const countTroops = (state: GameState, zone: string, faction: 'US' | 'NVA'): number =>
  (state.zones[zone] ?? []).filter((token) => token.props.faction === faction && token.type === 'troops').length;

describe('FITL card-37 Khe Sanh', () => {
  it('encodes exact event text, US ineligibility override, and executable payloads for both sides', () => {
    const def = compileDef();
    const card = def.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-37');

    assert.notEqual(card, undefined, 'Expected card-37 in production deck');
    assert.equal(card?.unshaded?.text, 'Select a US Base with US Troops. Remove 10 NVA Troops within 1 space of it.');
    assert.equal(card?.shaded?.text, 'Up to 3 US Troops in 1 space with NVA to Casualties. US Ineligible through next card.');
    assert.deepEqual(card?.shaded?.eligibilityOverrides, [
      { target: { kind: 'seat', seat: 'us' }, eligible: false, windowId: 'make-ineligible' },
    ]);
    assert.equal(typeof (card?.unshaded?.effects?.[0] as { if?: unknown })?.if, 'object');
    assert.equal(typeof (card?.shaded?.effects?.[0] as { if?: unknown })?.if, 'object');
  });

  it('unshaded removes exactly 10 NVA Troops from the selected base space and adjacent spaces only', () => {
    const def = compileDef();
    const setup = setupState(def, 37001, {
      'saigon:none': [
        makeToken('us-base-sai', 'base', 'US'),
        makeToken('us-t-sai', 'troops', 'US'),
        makeToken('nva-sai-1', 'troops', 'NVA'),
        makeToken('nva-sai-2', 'troops', 'NVA'),
        makeToken('nva-sai-3', 'troops', 'NVA'),
        makeToken('nva-sai-4', 'troops', 'NVA'),
      ],
      'tay-ninh:none': [
        makeToken('nva-tn-1', 'troops', 'NVA'),
        makeToken('nva-tn-2', 'troops', 'NVA'),
        makeToken('nva-tn-3', 'troops', 'NVA'),
      ],
      'kien-phong:none': [
        makeToken('nva-kp-1', 'troops', 'NVA'),
        makeToken('nva-kp-2', 'troops', 'NVA'),
        makeToken('nva-kp-3', 'troops', 'NVA'),
        makeToken('nva-kp-4', 'troops', 'NVA'),
        makeToken('nva-kp-5', 'troops', 'NVA'),
      ],
      'hue:none': [makeToken('nva-hue-1', 'troops', 'NVA')],
    });

    const move = findCard37Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-37 unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      { when: (req) => req.name === '$targetBaseSpace', value: 'saigon:none' },
      {
        when: (req) => req.name === '$nvaTroopsToRemove',
        value: [
          asTokenId('nva-sai-1'),
          asTokenId('nva-sai-2'),
          asTokenId('nva-sai-3'),
          asTokenId('nva-sai-4'),
          asTokenId('nva-tn-1'),
          asTokenId('nva-tn-2'),
          asTokenId('nva-tn-3'),
          asTokenId('nva-kp-1'),
          asTokenId('nva-kp-2'),
          asTokenId('nva-kp-3'),
        ],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTroops(final, 'saigon:none', 'NVA'),
      0,
      'Selected base space should remove same-space NVA Troops first',
    );
    assert.equal(
      countTroops(final, 'tay-ninh:none', 'NVA') + countTroops(final, 'kien-phong:none', 'NVA'),
      2,
      'Selected adjacent spaces should absorb the remaining 6 removals',
    );
    assert.equal(countTroops(final, 'hue:none', 'NVA'), 1, 'Non-adjacent space must remain untouched');
    assert.equal(
      countTroops(final, 'available-NVA:none', 'NVA'),
      10,
      'Exactly 10 selected NVA Troops should move to Available',
    );
  });

  it('unshaded removes all eligible NVA Troops when fewer than 10 are within one space', () => {
    const def = compileDef();
    const setup = setupState(def, 37002, {
      'saigon:none': [
        makeToken('us-base-sai', 'base', 'US'),
        makeToken('us-t-sai', 'troops', 'US'),
        makeToken('nva-sai-1', 'troops', 'NVA'),
      ],
      'tay-ninh:none': [makeToken('nva-tn-1', 'troops', 'NVA')],
      'kien-phong:none': [makeToken('nva-kp-1', 'troops', 'NVA')],
    });

    const move = findCard37Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-37 unshaded event move');

    const overrides: DecisionOverrideRule[] = [
      { when: (req) => req.name === '$targetBaseSpace', value: 'saigon:none' },
      {
        when: (req) => req.name === '$nvaTroopsToRemove',
        value: [asTokenId('nva-sai-1'), asTokenId('nva-tn-1'), asTokenId('nva-kp-1')],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countTroops(final, 'saigon:none', 'NVA'), 0);
    assert.equal(countTroops(final, 'tay-ninh:none', 'NVA'), 0);
    assert.equal(countTroops(final, 'kien-phong:none', 'NVA'), 0);
    assert.equal(countTroops(final, 'available-NVA:none', 'NVA'), 3, 'All eligible NVA Troops should be removed when <10 exist');
  });

  it('unshaded is a legal no-op when no US Base with US Troops exists', () => {
    const def = compileDef();
    const setup = setupState(def, 37003, {
      'hue:none': [makeToken('us-base-only', 'base', 'US')],
      'da-nang:none': [makeToken('us-troop-only', 'troops', 'US')],
      'quang-tri-thua-thien:none': [makeToken('nva-qt-1', 'troops', 'NVA')],
    });

    const move = findCard37Move(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected card-37 unshaded move even without an eligible base+troops space');

    const final = applyMove(def, setup, move!).state;
    assert.deepEqual(final.zones, setup.zones, 'Unshaded should no-op when no base space meets eligibility');
  });

  it('shaded moves selected US Troops in one NVA-sharing space to Casualties and queues US next-card ineligibility', () => {
    const def = compileDef();
    const setup = setupState(def, 37004, {
      'hue:none': [
        makeToken('us-h-1', 'troops', 'US'),
        makeToken('us-h-2', 'troops', 'US'),
        makeToken('us-h-3', 'troops', 'US'),
        makeToken('us-h-4', 'troops', 'US'),
        makeToken('nva-h-1', 'troops', 'NVA'),
      ],
      'da-nang:none': [makeToken('us-dn-1', 'troops', 'US')],
    });

    const move = findCard37Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-37 shaded event move');

    const overrides: DecisionOverrideRule[] = [
      { when: (req) => req.name === '$targetBattleSpace', value: 'hue:none' },
      { when: (req) => req.name === '$usTroopsToCasualties', value: [asTokenId('us-h-1'), asTokenId('us-h-2'), asTokenId('us-h-3')] },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(countTroops(final, 'hue:none', 'US'), 1, 'Selected space should lose chosen US Troops only');
    assert.equal(countTroops(final, 'da-nang:none', 'US'), 1, 'Non-selected spaces must remain unchanged');
    assert.equal(countTroops(final, 'casualties-US:none', 'US'), 3, 'Chosen US Troops should move to Casualties');
    assert.deepEqual(
      requireCardDrivenRuntime(final).pendingEligibilityOverrides,
      [{ seat: 'us', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' }],
      'Shaded should queue US ineligible through next card',
    );
  });

  it('shaded still queues US ineligibility when no space has both US Troops and NVA', () => {
    const def = compileDef();
    const setup = setupState(def, 37005, {
      'hue:none': [makeToken('us-h-1', 'troops', 'US')],
      'quang-tri-thua-thien:none': [makeToken('nva-qt-1', 'troops', 'NVA')],
    });

    const move = findCard37Move(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected card-37 shaded event move when no eligible battle space exists');

    const final = applyMove(def, setup, move!).state;

    assert.deepEqual(final.zones, setup.zones, 'Shaded removal should no-op with no shared US+NVA space');
    assert.deepEqual(
      requireCardDrivenRuntime(final).pendingEligibilityOverrides,
      [{ seat: 'us', eligible: false, windowId: 'make-ineligible', duration: 'nextTurn' }],
      'US next-card ineligibility should still apply',
    );
  });
});
