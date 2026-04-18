// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type GameState,
} from '../../src/kernel/index.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import {
  countTokensInZone,
  findTokenInZone,
  getEventCard,
  getFitlEventDef,
  makeFitlToken,
  requireEventMove,
  setupFitlEventState,
} from '../helpers/fitl-event-fidelity-helpers.js';

const CARD_ID = 'card-113';

// South Vietnam provinces
const QUANG_TRI = 'quang-tri-thua-thien:none';
const BINH_DINH = 'binh-dinh:none';
const PLEIKU_DARLAC = 'pleiku-darlac:none';
const QUANG_NAM = 'quang-nam:none';
const KHANH_HOA = 'khanh-hoa:none';
const TAY_NINH = 'tay-ninh:none';

// Cities
const SAIGON = 'saigon:none';
const HUE = 'hue:none';

// LoCs (South Vietnam)
const LOC_HUE_DA_NANG = 'loc-hue-da-nang:none';

// North Vietnam
const NORTH_VIETNAM = 'north-vietnam:none';

const AVAILABLE_ARVN = 'available-ARVN:none';
const AVAILABLE_VC = 'available-VC:none';

const isArvnPolice = (token: { props: Record<string, unknown> }): boolean =>
  token.props.faction === 'ARVN' && token.props.type === 'police';

const isVcGuerrilla = (token: { props: Record<string, unknown> }): boolean =>
  token.props.faction === 'VC' && token.props.type === 'guerrilla';

const isVcBase = (token: { props: Record<string, unknown> }): boolean =>
  token.props.faction === 'VC' && token.props.type === 'base';

describe('FITL card-113 Ruff Puff', () => {
  // ── Metadata ──

  it('compiles with correct metadata', () => {
    const def = getFitlEventDef();
    const card = getEventCard(def, CARD_ID);

    assert.equal(card.title, 'Ruff Puff');
    assert.equal(card.sideMode, 'dual');
    assert.equal(card.metadata?.period, '1968');
    assert.deepEqual(card.metadata?.seatOrder, ['VC', 'ARVN', 'US', 'NVA']);
    assert.equal(card.metadata?.flavorText, 'Regional and Popular Forces.');
    assert.equal(card.unshaded?.text, 'Place up to 8 Police in the South.');
    assert.equal(
      card.shaded?.text,
      'Replace 5 Police outside Cities with 1 VC piece each; 1 of the VC pieces may be a Base.',
    );
  });

  // ── Unshaded: Place up to 8 Police in the South ──

  it('unshaded happy path: places 8 police from Available into South Vietnam', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113001,
      cardIdInDiscardZone: CARD_ID,
    });
    const policeTokens = Array.from({ length: 10 }, (_, i) =>
      makeFitlToken(`rp-pol-${i}`, 'police', 'ARVN'),
    );
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: policeTokens,
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const destinations = [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC, QUANG_NAM, KHANH_HOA, TAY_NINH, SAIGON, HUE];
    const overrides: DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: policeTokens.slice(0, 8).map((t) => t.id),
      },
      ...destinations.map((dest, i) => ({
        when: (request: { decisionKey: string }) => request.decisionKey.endsWith(`chooseDestination[${i}]`),
        value: dest,
      })),
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    let totalPlaced = 0;
    for (const zone of destinations) {
      totalPlaced += countTokensInZone(result, zone, isArvnPolice);
    }
    assert.equal(totalPlaced, 8, 'Should place exactly 8 police');
    assert.equal(
      countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice),
      2,
      '2 police should remain in Available',
    );
  });

  it('unshaded partial Available + Rule 1.4.1: sources remainder from map', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113002,
      cardIdInDiscardZone: CARD_ID,
    });
    const availablePolice = Array.from({ length: 3 }, (_, i) =>
      makeFitlToken(`rp-avail-${i}`, 'police', 'ARVN'),
    );
    const mapPolice = Array.from({ length: 5 }, (_, i) =>
      makeFitlToken(`rp-map-${i}`, 'police', 'ARVN'),
    );
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: availablePolice,
        [QUANG_NAM]: [...(base.zones[QUANG_NAM] ?? []), ...mapPolice],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    // Phase 1 distributeTokens picks from Available (max 3), Phase 2 from map (max 5)
    // Use a counter-based override to send the right tokens per phase
    let selectTokensCallCount = 0;
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
          value: (_request: { options: readonly { value: unknown }[] }) => {
            selectTokensCallCount += 1;
            if (selectTokensCallCount === 1) {
              // Phase 1: select all 3 from Available
              return availablePolice.map((t) => t.id);
            }
            // Phase 2: select up to 5 from map
            return mapPolice.map((t) => t.id);
          },
        },
        {
          when: (request: { decisionKey: string }) => request.decisionKey.includes('chooseDestination'),
          value: QUANG_TRI,
        },
      ],
    }).state;

    // All 3 available should be placed
    assert.equal(
      countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice),
      0,
      'All Available police should be placed',
    );
    // Total placed: 3 from Available + 5 from map = 8
    const totalPlacedInSouth = [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC, QUANG_NAM, KHANH_HOA, TAY_NINH, SAIGON, HUE]
      .reduce((sum, z) => sum + countTokensInZone(result, z, isArvnPolice), 0);
    assert.ok(totalPlacedInSouth >= 8, `Expected at least 8 police in South Vietnam, got ${totalPlacedInSouth}`);
  });

  it('unshaded destination filter: police placed only in South Vietnam', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113003,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: [makeFitlToken('rp-filter-1', 'police', 'ARVN')],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        {
          when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
          value: ['rp-filter-1'],
        },
        {
          when: (request: { decisionKey: string }) => request.decisionKey.includes('chooseDestination'),
          value: QUANG_TRI,
        },
      ],
    }).state;

    // Police placed in South Vietnam
    assert.equal(countTokensInZone(result, QUANG_TRI, isArvnPolice), 1);
    // North Vietnam remains empty of ARVN police
    assert.equal(countTokensInZone(result, NORTH_VIETNAM, isArvnPolice), 0);
  });

  it('unshaded with zero police: event runs but no tokens move', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113004,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'unshaded');
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [],
    }).state;

    assert.equal(
      countTokensInZone(result, QUANG_TRI, isArvnPolice),
      countTokensInZone(setup, QUANG_TRI, isArvnPolice),
      'No police to place when pool is empty',
    );
  });

  // ── Shaded: Replace 5 Police outside Cities with 1 VC piece each ──

  it('shaded happy path with base: 1 base + 4 guerrillas replace 5 police', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113005,
      cardIdInDiscardZone: CARD_ID,
    });
    const pol1 = makeFitlToken('rp-sh-pol-1', 'police', 'ARVN');
    const pol2 = makeFitlToken('rp-sh-pol-2', 'police', 'ARVN');
    const pol3 = makeFitlToken('rp-sh-pol-3', 'police', 'ARVN');
    const pol4 = makeFitlToken('rp-sh-pol-4', 'police', 'ARVN');
    const pol5 = makeFitlToken('rp-sh-pol-5', 'police', 'ARVN');
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [QUANG_TRI]: [pol1],
        [BINH_DINH]: [pol2],
        [PLEIKU_DARLAC]: [pol3],
        [QUANG_NAM]: [pol4],
        [TAY_NINH]: [pol5],
        [AVAILABLE_VC]: [
          makeFitlToken('rp-sh-vc-base-1', 'base', 'VC'),
          makeFitlToken('rp-sh-vc-g-1', 'guerrilla', 'VC'),
          makeFitlToken('rp-sh-vc-g-2', 'guerrilla', 'VC'),
          makeFitlToken('rp-sh-vc-g-3', 'guerrilla', 'VC'),
          makeFitlToken('rp-sh-vc-g-4', 'guerrilla', 'VC'),
        ],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      // Phase 1: choose 1 VC base
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: ['rp-sh-vc-base-1'] },
      // A1: choose police for base replacement
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceForBase' }), value: ['rp-sh-pol-1'] },
      // A3: choose 4 police for guerrilla replacement
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceForGuerrillas' }), value: ['rp-sh-pol-2', 'rp-sh-pol-3', 'rp-sh-pol-4', 'rp-sh-pol-5'] },
      // A4: choose guerrillas for each replacement
      {
        when: matchesDecisionRequest({ name: '$ruffPuffGuerrilla', iterationPath: '[0]' }),
        value: 'rp-sh-vc-g-1',
      },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffGuerrilla', iterationPath: '[1]' }),
        value: 'rp-sh-vc-g-2',
      },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffGuerrilla', iterationPath: '[2]' }),
        value: 'rp-sh-vc-g-3',
      },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffGuerrilla', iterationPath: '[3]' }),
        value: 'rp-sh-vc-g-4',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    // Base placed in Quang Tri (where pol-1 was)
    assert.equal(countTokensInZone(result, QUANG_TRI, isVcBase), 1, 'VC base should be in Quang Tri');
    // Guerrillas placed in the other 4 provinces
    assert.equal(countTokensInZone(result, BINH_DINH, isVcGuerrilla), 1);
    assert.equal(countTokensInZone(result, PLEIKU_DARLAC, isVcGuerrilla), 1);
    assert.equal(countTokensInZone(result, QUANG_NAM, isVcGuerrilla), 1);
    assert.equal(countTokensInZone(result, TAY_NINH, isVcGuerrilla), 1);
    // All 5 police removed to Available-ARVN
    assert.equal(countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice), 5);
    // No police remain in provinces
    for (const zone of [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC, QUANG_NAM, TAY_NINH]) {
      assert.equal(countTokensInZone(result, zone, isArvnPolice), 0, `Police should be removed from ${zone}`);
    }
  });

  it('shaded happy path without base: 5 guerrillas replace 5 police', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113006,
      cardIdInDiscardZone: CARD_ID,
    });
    const nbPol1 = makeFitlToken('rp-sh-nb-pol-1', 'police', 'ARVN');
    const nbPol2 = makeFitlToken('rp-sh-nb-pol-2', 'police', 'ARVN');
    const nbPol3 = makeFitlToken('rp-sh-nb-pol-3', 'police', 'ARVN');
    const nbPol4 = makeFitlToken('rp-sh-nb-pol-4', 'police', 'ARVN');
    const nbPol5 = makeFitlToken('rp-sh-nb-pol-5', 'police', 'ARVN');
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [QUANG_TRI]: [nbPol1],
        [BINH_DINH]: [nbPol2],
        [PLEIKU_DARLAC]: [nbPol3],
        [QUANG_NAM]: [nbPol4],
        [TAY_NINH]: [nbPol5],
        [AVAILABLE_VC]: [
          makeFitlToken('rp-sh-nb-vc-g-1', 'guerrilla', 'VC'),
          makeFitlToken('rp-sh-nb-vc-g-2', 'guerrilla', 'VC'),
          makeFitlToken('rp-sh-nb-vc-g-3', 'guerrilla', 'VC'),
          makeFitlToken('rp-sh-nb-vc-g-4', 'guerrilla', 'VC'),
          makeFitlToken('rp-sh-nb-vc-g-5', 'guerrilla', 'VC'),
        ],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      // Phase 1: skip base (choose 0)
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: [] },
      // Branch B: choose 5 police
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceToReplace' }), value: ['rp-sh-nb-pol-1', 'rp-sh-nb-pol-2', 'rp-sh-nb-pol-3', 'rp-sh-nb-pol-4', 'rp-sh-nb-pol-5'] },
      // Branch B: choose guerrillas
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[0]' }),
        value: 'rp-sh-nb-vc-g-1',
      },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[1]' }),
        value: 'rp-sh-nb-vc-g-2',
      },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[2]' }),
        value: 'rp-sh-nb-vc-g-3',
      },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[3]' }),
        value: 'rp-sh-nb-vc-g-4',
      },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[4]' }),
        value: 'rp-sh-nb-vc-g-5',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    // Guerrillas placed in all 5 provinces
    for (const zone of [QUANG_TRI, BINH_DINH, PLEIKU_DARLAC, QUANG_NAM, TAY_NINH]) {
      assert.equal(countTokensInZone(result, zone, isVcGuerrilla), 1, `Expected guerrilla in ${zone}`);
      assert.equal(countTokensInZone(result, zone, isArvnPolice), 0, `Police should be removed from ${zone}`);
    }
    assert.equal(countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice), 5);
    assert.equal(countTokensInZone(result, AVAILABLE_VC, isVcGuerrilla), 0);
  });

  it('shaded guerrillas placed underground', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113007,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('rp-sh-ug-pol-1', 'police', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('rp-sh-ug-vc-g-1', 'guerrilla', 'VC')],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: [] },
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceToReplace' }), value: ['rp-sh-ug-pol-1'] },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[0]' }),
        value: 'rp-sh-ug-vc-g-1',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    const guerrilla = findTokenInZone(result, QUANG_TRI, 'rp-sh-ug-vc-g-1');
    assert.notEqual(guerrilla, undefined, 'Guerrilla should be placed');
    assert.equal(guerrilla!.props.activity, 'underground', 'Placed guerrilla must be underground');
  });

  it('shaded base placed active (no underground change)', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113008,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('rp-sh-ba-pol-1', 'police', 'ARVN')],
        [AVAILABLE_VC]: [
          makeFitlToken('rp-sh-ba-vc-base', 'base', 'VC'),
        ],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: ['rp-sh-ba-vc-base'] },
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceForBase' }), value: ['rp-sh-ba-pol-1'] },
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceForGuerrillas' }), value: [] },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    const vcBase = findTokenInZone(result, QUANG_TRI, 'rp-sh-ba-vc-base');
    assert.notEqual(vcBase, undefined, 'Base should be placed in Quang Tri');
    // Bases do not have underground posture — activity should not be 'underground'
    assert.notEqual(vcBase!.props.activity, 'underground', 'Base should not be set underground');
  });

  it('shaded VC guerrilla depletion: police removed even when no guerrilla available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113009,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('rp-sh-dep-pol-1', 'police', 'ARVN')],
        [BINH_DINH]: [makeFitlToken('rp-sh-dep-pol-2', 'police', 'ARVN')],
        [AVAILABLE_VC]: [], // No VC pieces at all
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: [] },
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceToReplace' }), value: ['rp-sh-dep-pol-1', 'rp-sh-dep-pol-2'] },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    // Police should be removed even though no VC replacement
    assert.equal(countTokensInZone(result, QUANG_TRI, isArvnPolice), 0, 'Police removed from Quang Tri');
    assert.equal(countTokensInZone(result, BINH_DINH, isArvnPolice), 0, 'Police removed from Binh Dinh');
    assert.equal(countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice), 2, 'Removed police in Available-ARVN');
    // No VC placed
    assert.equal(countTokensInZone(result, QUANG_TRI, isVcGuerrilla), 0);
    assert.equal(countTokensInZone(result, BINH_DINH, isVcGuerrilla), 0);
  });

  it('shaded fewer than 5 police outside cities: replaces all available', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113010,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('rp-sh-few-pol-1', 'police', 'ARVN')],
        [BINH_DINH]: [makeFitlToken('rp-sh-few-pol-2', 'police', 'ARVN')],
        [AVAILABLE_VC]: [
          makeFitlToken('rp-sh-few-vc-g-1', 'guerrilla', 'VC'),
          makeFitlToken('rp-sh-few-vc-g-2', 'guerrilla', 'VC'),
        ],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: [] },
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceToReplace' }), value: ['rp-sh-few-pol-1', 'rp-sh-few-pol-2'] },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[0]' }),
        value: 'rp-sh-few-vc-g-1',
      },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[1]' }),
        value: 'rp-sh-few-vc-g-2',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    assert.equal(countTokensInZone(result, QUANG_TRI, isVcGuerrilla), 1);
    assert.equal(countTokensInZone(result, BINH_DINH, isVcGuerrilla), 1);
    assert.equal(countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice), 2);
  });

  it('shaded zero police outside cities: event runs with no replacements', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113011,
      cardIdInDiscardZone: CARD_ID,
    });
    // Only police in cities, none outside
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [SAIGON]: [...(base.zones[SAIGON] ?? []), makeFitlToken('rp-sh-city-pol-1', 'police', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('rp-sh-zero-vc-g', 'guerrilla', 'VC')],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: [] },
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceToReplace' }), value: [] },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    // City police untouched
    assert.equal(
      countTokensInZone(result, SAIGON, isArvnPolice),
      countTokensInZone(setup, SAIGON, isArvnPolice),
      'City police should not be affected',
    );
    // VC guerrilla still in Available
    assert.equal(countTokensInZone(result, AVAILABLE_VC, isVcGuerrilla), 1);
  });

  it('shaded city exclusion: police in cities NOT eligible for selection', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113012,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [SAIGON]: [...(base.zones[SAIGON] ?? []), makeFitlToken('rp-sh-city-excl-pol', 'police', 'ARVN')],
        [QUANG_TRI]: [makeFitlToken('rp-sh-city-excl-prov-pol', 'police', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('rp-sh-city-excl-vc-g', 'guerrilla', 'VC')],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    // Run full event: skip base, select the province police only
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: [] },
        { when: matchesDecisionRequest({ name: '$ruffPuffPoliceToReplace' }), value: ['rp-sh-city-excl-prov-pol'] },
        {
          when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[0]' }),
          value: 'rp-sh-city-excl-vc-g',
        },
      ],
    }).state;

    // Province police replaced, city police untouched
    assert.equal(countTokensInZone(result, QUANG_TRI, isArvnPolice), 0, 'Province police should be replaced');
    assert.equal(
      countTokensInZone(result, SAIGON, isArvnPolice),
      countTokensInZone(setup, SAIGON, isArvnPolice),
      'City police should remain untouched',
    );
  });

  it('shaded LoC inclusion: police on LoCs ARE eligible for guerrilla replacement', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113013,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [LOC_HUE_DA_NANG]: [makeFitlToken('rp-sh-loc-pol', 'police', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('rp-sh-loc-vc-g', 'guerrilla', 'VC')],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: [] },
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceToReplace' }), value: ['rp-sh-loc-pol'] },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[0]' }),
        value: 'rp-sh-loc-vc-g',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    assert.equal(countTokensInZone(result, LOC_HUE_DA_NANG, isVcGuerrilla), 1, 'Guerrilla should be placed on LoC');
    assert.equal(countTokensInZone(result, LOC_HUE_DA_NANG, isArvnPolice), 0, 'Police removed from LoC');
    assert.equal(countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice), 1);
  });

  it('shaded base-cap enforcement: base police selection excludes provinces with 2+ bases', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113014,
      cardIdInDiscardZone: CARD_ID,
    });
    // Quang Tri already has 2 bases — base can't go there
    // Binh Dinh has 0 bases — base can go there
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [QUANG_TRI]: [
          makeFitlToken('rp-sh-cap-pol-qt', 'police', 'ARVN'),
          makeFitlToken('rp-sh-cap-base-qt-1', 'base', 'VC'),
          makeFitlToken('rp-sh-cap-base-qt-2', 'base', 'NVA'),
        ],
        [BINH_DINH]: [makeFitlToken('rp-sh-cap-pol-bd', 'police', 'ARVN')],
        [AVAILABLE_VC]: [
          makeFitlToken('rp-sh-cap-vc-base', 'base', 'VC'),
          makeFitlToken('rp-sh-cap-vc-g', 'guerrilla', 'VC'),
        ],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    // Run full event: choose base, pick Binh Dinh police (under cap), then guerrilla for remaining
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, {
      overrides: [
        { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: ['rp-sh-cap-vc-base'] },
        // A1: only Binh Dinh police should be eligible (Quang Tri at cap)
        { when: matchesDecisionRequest({ name: '$ruffPuffPoliceForBase' }), value: ['rp-sh-cap-pol-bd'] },
        // A3: remaining police outside cities (only Quang Tri left, but for guerrilla replacement)
        { when: matchesDecisionRequest({ name: '$ruffPuffPoliceForGuerrillas' }), value: ['rp-sh-cap-pol-qt'] },
        {
          when: matchesDecisionRequest({ name: '$ruffPuffGuerrilla', iterationPath: '[0]' }),
          value: 'rp-sh-cap-vc-g',
        },
      ],
    }).state;

    // Base placed in Binh Dinh (under cap), not Quang Tri (at cap)
    assert.equal(countTokensInZone(result, BINH_DINH, isVcBase), 1, 'Base should be placed in Binh Dinh');
    // Guerrilla placed in Quang Tri
    assert.equal(countTokensInZone(result, QUANG_TRI, isVcGuerrilla), 1, 'Guerrilla should replace Quang Tri police');
  });

  it('shaded police routed to Available-ARVN', () => {
    const def = getFitlEventDef();
    const base = setupFitlEventState(def, {
      seed: 113015,
      cardIdInDiscardZone: CARD_ID,
    });
    const setup = {
      ...base,
      zones: {
        ...base.zones,
        [QUANG_TRI]: [makeFitlToken('rp-sh-route-pol', 'police', 'ARVN')],
        [AVAILABLE_VC]: [makeFitlToken('rp-sh-route-vc-g', 'guerrilla', 'VC')],
        [AVAILABLE_ARVN]: [],
      },
    } satisfies GameState;

    const move = requireEventMove(def, setup, CARD_ID, 'shaded');
    const overrides: DecisionOverrideRule[] = [
      { when: matchesDecisionRequest({ name: '$ruffPuffBaseChoice' }), value: [] },
      { when: matchesDecisionRequest({ name: '$ruffPuffPoliceToReplace' }), value: ['rp-sh-route-pol'] },
      {
        when: matchesDecisionRequest({ name: '$ruffPuffReplacementGuerrilla', iterationPath: '[0]' }),
        value: 'rp-sh-route-vc-g',
      },
    ];
    const result = applyMoveWithResolvedDecisionIds(def, setup, move, { overrides }).state;

    assert.equal(
      countTokensInZone(result, AVAILABLE_ARVN, isArvnPolice),
      1,
      'Removed police should be routed to Available-ARVN',
    );
    const routedPolice = findTokenInZone(result, AVAILABLE_ARVN, 'rp-sh-route-pol');
    assert.notEqual(routedPolice, undefined, 'The specific police token should be in Available-ARVN');
  });
});
