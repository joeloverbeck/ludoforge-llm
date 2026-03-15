import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asTokenId } from '../../src/kernel/index.js';
import {
  assertEventText,
  assertNoOpEvent,
  countTokensInZone,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  runEvent,
  setupFitlEventState,
  tokenIdsInZone,
} from './fitl-events-test-helpers.js';

const CARD_ID = 'card-91';
const DA_NANG = 'da-nang:none';
const CAN_THO = 'can-tho:none';
const HUE = 'hue:none';
const TAY_NINH = 'tay-ninh:none';
const KIEN_PHONG = 'kien-phong:none';

describe('FITL card-91 Bob Hope', () => {
  it('compiles exact rules text with province-only US troop selection, COIN-control city targeting, casualty floorDiv recovery, and active-seat guerrilla sourcing', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assertEventText(def, CARD_ID, {
      title: 'Bob Hope',
      unshaded: 'Move any US Troops from a Province to a COIN Control City. For each 2 moved (round down), 1 Casualty piece to Available.',
      shaded: 'NVA or VC move up to 3 US Troops from any Provinces to Cities, placing a Guerrilla where each Troop was.',
    });
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1968');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'US', 'NVA', 'ARVN']);

    const serializedUnshaded = JSON.stringify(card.unshaded?.effects ?? []);
    assert.match(serializedUnshaded, /"kind":"zoneProp","prop":"category"/, 'Unshaded should filter US troops by their zone category');
    assert.match(serializedUnshaded, /"value":"province"/, 'Unshaded should only source US troops from provinces');
    assert.match(serializedUnshaded, /"ref":"zoneProp","zone":"\$zone","prop":"category".*"right":"city"/, 'Unshaded should target COIN-controlled cities only');
    assert.match(serializedUnshaded, /"op":"floorDiv"/, 'Unshaded should floor-divide moved troops by 2 for casualty recovery');

    const serializedShaded = JSON.stringify(card.shaded?.effects ?? []);
    assert.match(serializedShaded, /"kind":"zoneProp","prop":"category"/, 'Shaded should also source only province US troops');
    assert.match(serializedShaded, /"ref":"activeSeat"/, 'Shaded should source guerrillas from the executing insurgent faction');
    assert.match(serializedShaded, /"ref":"zoneProp","zone":"\$zone","prop":"category".*"right":"city"/, 'Shaded should target cities');
  });

  it('unshaded moves chosen province US troops into COIN-controlled cities and returns floor(moved/2) chosen US casualties to Available', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 91001,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('bob-us-province-a1', 'troops', 'US'),
          makeFitlToken('bob-us-province-a2', 'troops', 'US'),
        ],
        [KIEN_PHONG]: [
          makeFitlToken('bob-us-province-b1', 'troops', 'US'),
        ],
        [HUE]: [
          makeFitlToken('bob-us-city-ignore', 'troops', 'US'),
          makeFitlToken('bob-hue-vc', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [DA_NANG]: [
          makeFitlToken('bob-da-nang-arvn', 'troops', 'ARVN'),
        ],
        [CAN_THO]: [
          makeFitlToken('bob-can-tho-us', 'troops', 'US'),
        ],
        'casualties-US:none': [
          makeFitlToken('bob-cas-troop', 'troops', 'US'),
          makeFitlToken('bob-cas-base', 'base', 'US'),
          makeFitlToken('bob-cas-irregular', 'irregular', 'US'),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (request) => request.name === '$bobHopeTroopsToMove',
          value: [
            asTokenId('bob-us-province-a1'),
            asTokenId('bob-us-province-a2'),
            asTokenId('bob-us-province-b1'),
          ],
        },
        {
          when: (request) => request.name === '$bobHopeCityDestination@bob-us-province-a1',
          value: DA_NANG,
        },
        {
          when: (request) => request.name === '$bobHopeCityDestination@bob-us-province-a2',
          value: CAN_THO,
        },
        {
          when: (request) => request.name === '$bobHopeCityDestination@bob-us-province-b1',
          value: DA_NANG,
        },
        {
          when: (request) => request.name === '$bobHopeCasualtiesToAvailable',
          value: [asTokenId('bob-cas-base')],
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, DA_NANG).has('bob-us-province-a1'), true);
    assert.equal(tokenIdsInZone(final, CAN_THO).has('bob-us-province-a2'), true);
    assert.equal(tokenIdsInZone(final, DA_NANG).has('bob-us-province-b1'), true);
    assert.equal(tokenIdsInZone(final, TAY_NINH).has('bob-us-province-a1'), false);
    assert.equal(tokenIdsInZone(final, TAY_NINH).has('bob-us-province-a2'), false);
    assert.equal(tokenIdsInZone(final, KIEN_PHONG).has('bob-us-province-b1'), false);
    assert.equal(tokenIdsInZone(final, HUE).has('bob-us-city-ignore'), true, 'US troops already in cities must not be eligible to move');

    assert.equal(tokenIdsInZone(final, 'available-US:none').has('bob-cas-base'), true, 'Chosen casualty base should return to Available');
    assert.equal(tokenIdsInZone(final, 'casualties-US:none').has('bob-cas-troop'), true, 'Unchosen casualty troop should remain');
    assert.equal(tokenIdsInZone(final, 'casualties-US:none').has('bob-cas-irregular'), true, 'Unchosen casualty irregular should remain');
  });

  it('unshaded floors casualty recovery at zero for a single moved troop and becomes a no-op when no COIN-controlled city exists', () => {
    const def = getFitlEventDef();

    const oneMovedState = setupFitlEventState(def, {
      seed: 91002,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [makeFitlToken('bob-one-move', 'troops', 'US')],
        [DA_NANG]: [makeFitlToken('bob-one-move-arvn', 'troops', 'ARVN')],
        'casualties-US:none': [makeFitlToken('bob-one-cas', 'troops', 'US')],
      },
    });

    const oneMovedFinal = runEvent(def, oneMovedState, CARD_ID, 'unshaded', {
      overrides: [
        {
          when: (request) => request.name === '$bobHopeTroopsToMove',
          value: [asTokenId('bob-one-move')],
        },
        {
          when: (request) => request.name === '$bobHopeCityDestination@bob-one-move',
          value: DA_NANG,
        },
      ],
    }).state;
    assert.equal(tokenIdsInZone(oneMovedFinal, DA_NANG).has('bob-one-move'), true);
    assert.equal(tokenIdsInZone(oneMovedFinal, 'available-US:none').has('bob-one-cas'), false, 'floor(1/2) should recover no casualties');
    assert.equal(tokenIdsInZone(oneMovedFinal, 'casualties-US:none').has('bob-one-cas'), true);

    const noCoinCityState = setupFitlEventState(def, {
      seed: 91003,
      activePlayer: 1,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [makeFitlToken('bob-no-city-us', 'troops', 'US')],
        [DA_NANG]: [
          makeFitlToken('bob-no-city-us-city', 'troops', 'US'),
          makeFitlToken('bob-no-city-vc-city', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        [CAN_THO]: [
          makeFitlToken('bob-no-city-nva-city', 'troops', 'NVA'),
          makeFitlToken('bob-no-city-vc-2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
        'casualties-US:none': [makeFitlToken('bob-no-city-cas', 'base', 'US')],
      },
    });
    assertNoOpEvent(def, noCoinCityState, CARD_ID, 'unshaded');
  });

  it('shaded as VC moves up to 3 province US troops into cities and places one underground VC guerrilla in each vacated province per troop moved', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 91004,
      activePlayer: 3,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('bob-shade-vc-a1', 'troops', 'US'),
          makeFitlToken('bob-shade-vc-a2', 'troops', 'US'),
        ],
        [KIEN_PHONG]: [
          makeFitlToken('bob-shade-vc-b1', 'troops', 'US'),
        ],
        [HUE]: [makeFitlToken('bob-shade-vc-city-ignore', 'troops', 'US')],
        'available-VC:none': [
          makeFitlToken('bob-shade-vc-g1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('bob-shade-vc-g2', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('bob-shade-vc-g3', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [
        {
          when: (request) => request.name === '$bobHopeTroopsToDisplace',
          value: [
            asTokenId('bob-shade-vc-a1'),
            asTokenId('bob-shade-vc-a2'),
            asTokenId('bob-shade-vc-b1'),
          ],
        },
        {
          when: (request) => request.name === '$bobHopeShadedCityDestination@bob-shade-vc-a1',
          value: DA_NANG,
        },
        {
          when: (request) => request.name === '$bobHopeShadedCityDestination@bob-shade-vc-a2',
          value: CAN_THO,
        },
        {
          when: (request) => request.name === '$bobHopeShadedCityDestination@bob-shade-vc-b1',
          value: DA_NANG,
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, DA_NANG).has('bob-shade-vc-a1'), true);
    assert.equal(tokenIdsInZone(final, CAN_THO).has('bob-shade-vc-a2'), true);
    assert.equal(tokenIdsInZone(final, DA_NANG).has('bob-shade-vc-b1'), true);
    assert.equal(tokenIdsInZone(final, HUE).has('bob-shade-vc-city-ignore'), true, 'US troops already in cities must stay put');

    assert.equal(
      countTokensInZone(final, TAY_NINH, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      2,
      'Two moved troops from the same province should each place a VC guerrilla there',
    );
    assert.equal(
      countTokensInZone(final, KIEN_PHONG, (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      1,
    );
    assert.equal(findTokenInZone(final, TAY_NINH, 'bob-shade-vc-g1')?.props.activity, 'underground');
    assert.equal(findTokenInZone(final, TAY_NINH, 'bob-shade-vc-g2')?.props.activity, 'underground');
    assert.equal(findTokenInZone(final, KIEN_PHONG, 'bob-shade-vc-g3')?.props.activity, 'underground');
    assert.equal(countTokensInZone(final, 'available-VC:none', (token) => token.props.faction === 'VC' && token.type === 'guerrilla'), 0);
  });

  it('shaded as NVA uses the executing faction guerrilla pool and still moves US troops when fewer than one replacement guerrilla per troop is available', () => {
    const def = getFitlEventDef();
    const state = setupFitlEventState(def, {
      seed: 91005,
      activePlayer: 2,
      cardIdInDiscardZone: CARD_ID,
      zoneTokens: {
        [TAY_NINH]: [
          makeFitlToken('bob-shade-nva-a1', 'troops', 'US'),
          makeFitlToken('bob-shade-nva-a2', 'troops', 'US'),
        ],
        'available-NVA:none': [
          makeFitlToken('bob-shade-nva-g1', 'guerrilla', 'NVA', { activity: 'active' }),
        ],
        'available-VC:none': [
          makeFitlToken('bob-shade-nva-vc-g1', 'guerrilla', 'VC', { activity: 'active' }),
          makeFitlToken('bob-shade-nva-vc-g2', 'guerrilla', 'VC', { activity: 'active' }),
        ],
      },
    });

    const final = runEvent(def, state, CARD_ID, 'shaded', {
      overrides: [
        {
          when: (request) => request.name === '$bobHopeTroopsToDisplace',
          value: [
            asTokenId('bob-shade-nva-a1'),
            asTokenId('bob-shade-nva-a2'),
          ],
        },
        {
          when: (request) => request.name === '$bobHopeShadedCityDestination@bob-shade-nva-a1',
          value: DA_NANG,
        },
        {
          when: (request) => request.name === '$bobHopeShadedCityDestination@bob-shade-nva-a2',
          value: CAN_THO,
        },
      ],
    }).state;

    assert.equal(tokenIdsInZone(final, DA_NANG).has('bob-shade-nva-a1'), true);
    assert.equal(tokenIdsInZone(final, CAN_THO).has('bob-shade-nva-a2'), true);
    assert.equal(
      countTokensInZone(final, TAY_NINH, (token) => token.props.faction === 'NVA' && token.type === 'guerrilla'),
      1,
      'Only the single available NVA guerrilla can be placed',
    );
    assert.equal(
      countTokensInZone(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'guerrilla'),
      0,
    );
    assert.equal(
      countTokensInZone(final, 'available-VC:none', (token) => token.props.faction === 'VC' && token.type === 'guerrilla'),
      2,
      'VC guerrillas must remain untouched when NVA executes the shaded event',
    );
  });
});
