import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  legalMoves,
  resolveEventEligibilityOverrides,
  resolveMoveDecisionSequence,
  type GameDef,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { matchesDecisionRequest } from '../helpers/decision-key-matchers.js';
import { applyMoveWithResolvedDecisionIds, type DecisionOverrideRule } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL_PRODUCTION_FIXTURE = getFitlProductionFixture();
import { requireCardDrivenRuntime } from '../helpers/turn-order-helpers.js';

const expectedCards = [
  { id: 'card-32', order: 32, title: 'Long Range Guns', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-33', order: 33, title: 'MiGs', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-35', order: 35, title: 'Thanh Hoa', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-36', order: 36, title: 'Hamburger Hill', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-37', order: 37, title: 'Khe Sanh', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-40', order: 40, title: 'PoWs', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-41', order: 41, title: 'Bombing Pause', seatOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-42', order: 42, title: 'Chou En Lai', seatOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-45', order: 45, title: 'PT-76', seatOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-49', order: 49, title: 'Russian Arms', seatOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-52', order: 52, title: 'RAND', seatOrder: ['NVA', 'VC', 'US', 'ARVN'] },
  { id: 'card-54', order: 54, title: 'Son Tay', seatOrder: ['NVA', 'VC', 'US', 'ARVN'] },
  { id: 'card-57', order: 57, title: 'International Unrest', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-58', order: 58, title: 'Pathet Lao', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-60', order: 60, title: 'War Photographer', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
] as const;

const RAND_US_CAPABILITY_MARKERS = [
  'cap_topGun',
  'cap_arcLight',
  'cap_abrams',
  'cap_cobras',
  'cap_m48Patton',
  'cap_caps',
  'cap_cords',
  'cap_lgbs',
] as const;

const WAR_PHOTOGRAPHER_SEAT_ORDER = ['NVA', 'VC', 'ARVN', 'US'] as const;

const compileDef = (): GameDef => {
  const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

const countTokens = (state: GameState, zoneId: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zoneId] ?? []).filter((token) => predicate(token)).length;

const usSupportAvailableScoreWithNeutralSupport = (state: GameState): number =>
  countTokens(state, 'available-US:none', (token) => token.props.faction === 'US' && (token.type === 'troops' || token.type === 'base'));

const setupWarPhotographerState = (
  def: GameDef,
  overrides?: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly activePlayer?: 0 | 1 | 2 | 3;
    readonly useRoundRobin?: boolean;
    readonly firstEligible?: 'US' | 'ARVN' | 'NVA' | 'VC';
    readonly secondEligible?: 'US' | 'ARVN' | 'NVA' | 'VC' | null;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const base = clearAllZones(initialState(def, 196860, 4).state);
  if (overrides?.useRoundRobin === true) {
    return {
      ...base,
      activePlayer: asPlayerId(overrides.activePlayer ?? 0),
      turnOrderState: { type: 'roundRobin' },
      zones: {
        ...base.zones,
        [eventDeck!.discardZone]: [makeToken('card-60', 'card', 'none')],
        ...(overrides?.zoneTokens ?? {}),
      },
    };
  }

  const runtime = requireCardDrivenRuntime(base);
  return {
    ...base,
    activePlayer: asPlayerId(overrides?.activePlayer ?? 2),
    turnOrderState: {
      type: 'cardDriven',
      runtime: {
        ...runtime,
        seatOrder: [...WAR_PHOTOGRAPHER_SEAT_ORDER],
        currentCard: {
          ...runtime.currentCard,
          firstEligible: overrides?.firstEligible ?? 'NVA',
          secondEligible: overrides?.secondEligible ?? 'VC',
          actedSeats: [],
          passedSeats: [],
          nonPassCount: 0,
          firstActionClass: null,
        },
      },
    },
    zones: {
      ...base.zones,
      [eventDeck!.discardZone]: [makeToken('card-60', 'card', 'none')],
      ...(overrides?.zoneTokens ?? {}),
    },
  };
};

const findWarPhotographerMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event'
      && move.params.side === side
      && (move.params.eventCardId === undefined || move.params.eventCardId === 'card-60'),
  );

describe('FITL 1968 NVA-first event-card production spec', () => {
  it('compiles all 15 NVA-first 1968 cards with dual-side metadata invariants', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      const expectedSideMode = expected.id === 'card-41' ? 'single' : 'dual';
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, expectedSideMode);
      assert.equal(card?.metadata?.period, '1968');
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.metadata?.flavorText, 'string', `${expected.id} must include flavorText`);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);
      if (expectedSideMode === 'dual') {
        assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
      } else {
        assert.equal(card?.shaded, undefined, `${expected.id} must not include shaded side data`);
      }
    }
  });

  it('encodes 1968 NVA capability cards as capability marker toggles for both sides', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedCapabilities = [
      { id: 'card-32', marker: 'cap_longRangeGuns' },
      { id: 'card-45', marker: 'cap_pt76' },
    ] as const;

    for (const expected of expectedCapabilities) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('capability'), true, `${expected.id} must include capability tag`);
      assert.equal(card?.tags?.includes('NVA'), true, `${expected.id} must include NVA tag`);
      assert.deepEqual(card?.unshaded?.effects, tagEffectAsts([{ setGlobalMarker: { marker: expected.marker, state: 'unshaded' } }]));
      assert.deepEqual(card?.shaded?.effects, tagEffectAsts([{ setGlobalMarker: { marker: expected.marker, state: 'shaded' } }]));

      if (expected.id === 'card-32') {
        assert.equal(
          card?.unshaded?.text,
          'NVA Bombard max 1 space. NVA CAPABILITY. Other restrictions on Bombard apply normally (4.4.2).',
        );
        assert.equal(
          card?.shaded?.text,
          'NVA Bombard max 3 spaces. NVA CAPABILITY. Other restrictions on Bombard apply normally (4.4.2).',
        );
      }

      if (expected.id === 'card-45') {
        assert.equal(card?.unshaded?.text, 'Each NVA Attack space, first remove 1 NVA Troop cube. NVA CAPABILITY.');
        assert.equal(card?.shaded?.text, 'NVA Attack in 1 space removes 1 enemy per Troop. NVA CAPABILITY.');
      }
    }
  });

  it('encodes MiGs exact card text and shaded Top Gun unshaded cancellation guard', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-33');
    assert.notEqual(card, undefined);
    assert.equal(card?.unshaded?.text, 'NVA Resources -6 each Reset. NVA CAPABILITY.');
    assert.equal(
      card?.shaded?.text,
      'Unless unshaded Top Gun, whenever Air Strike Degrades Trail, US removes 1 Available Troop to Casualties.',
    );
    assert.deepEqual((card?.unshaded?.effects?.[0] as { setGlobalMarker?: unknown })?.setGlobalMarker, {
      marker: 'cap_migs',
      state: 'unshaded',
    });
    const shadedIf = (card?.shaded?.effects?.[0] as { if?: { then?: unknown[]; else?: unknown[] } })?.if;
    assert.notEqual(shadedIf, undefined);
    assert.deepEqual((shadedIf?.then?.[0] as { setGlobalMarker?: unknown })?.setGlobalMarker, {
      marker: 'cap_migs',
      state: 'inactive',
    });
    assert.deepEqual((shadedIf?.else?.[0] as { setGlobalMarker?: unknown })?.setGlobalMarker, {
      marker: 'cap_migs',
      state: 'shaded',
    });
  });

  it('encodes card 35 (Thanh Hoa) as direct Trail degradation and post-improvement Trail-scaled NVA resource gain', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-35');
    assert.notEqual(card, undefined);
    assert.equal(card?.unshaded?.text, 'Degrade the Trail by 3 boxes.');
    assert.equal(card?.shaded?.text, 'Improve Trail by 1 box. Then add three times Trail value to NVA Resources.');
    assert.deepEqual(card?.unshaded?.effects, tagEffectAsts([
      {
        addVar: {
          scope: 'global',
          var: 'trail',
          delta: -3,
        },
      },
    ]));
    assert.equal(card?.shaded?.effects?.length, 2, 'Expected shaded Thanh Hoa to improve Trail then add Trail-scaled resources');
    assert.deepEqual((card?.shaded?.effects?.[0] as { addVar?: unknown })?.addVar, {
      scope: 'global',
      var: 'trail',
      delta: 1,
    });
    assert.deepEqual((card?.shaded?.effects?.[1] as { let?: unknown })?.let, {
      bind: '$trailValue',
      value: {
        _t: 2,
        ref: 'gvar',
        var: 'trail',
      },
      in: tagEffectAsts([
        {
          addVar: {
            scope: 'global',
            var: 'nvaResources',
            delta: {
              _t: 6,
              op: '*',
              left: 3,
              right: {
                _t: 2,
                ref: 'binding',
                name: '$trailValue',
              },
            },
          },
        },
      ]),
    });
  });

  it('blocks MiGs shaded execution when Top Gun unshaded is already active', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const start = clearAllZones(initialState(def, 196833, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(2),
      turnOrderState: { type: 'roundRobin' },
      globalMarkers: {
        ...start.globalMarkers,
        cap_topGun: 'unshaded',
      },
      zones: {
        ...start.zones,
        [eventDeck!.discardZone]: [makeToken('card-33', 'card', 'none')],
      },
    };

    const move = legalMoves(def, configured).find(
      (candidate) =>
        String(candidate.actionId) === 'event' &&
        candidate.params.eventCardId === 'card-33' &&
        candidate.params.side === 'shaded',
    );
    assert.notEqual(move, undefined, 'Expected legal MiGs shaded event move');

    const after = applyMove(def, configured, move!).state;
    assert.notEqual(after.globalMarkers, undefined);
    assert.equal(after.globalMarkers?.cap_topGun, 'unshaded');
    assert.equal(after.globalMarkers?.cap_migs, 'inactive');
  });

  it('encodes card 41 (Bombing Pause) as unshaded round momentum toggle', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-41');
    assert.notEqual(card, undefined);
    assert.equal(card?.sideMode, 'single');
    assert.equal(card?.tags?.includes('momentum'), true);
    assert.equal(card?.unshaded?.text, 'Set any two spaces to Passive Support. Patronage +2. No Air Strike until Coup. MOMENTUM');
    assert.equal(card?.shaded, undefined);
    assert.equal(card?.unshaded?.targets?.[0]?.id, '$targetSpace');
    assert.equal(card?.unshaded?.targets?.[0]?.selector.query, 'mapSpaces');
    assert.deepEqual(card?.unshaded?.targets?.[0]?.cardinality, { n: 2 });
    assert.equal(card?.unshaded?.targets?.[0]?.application, 'each');
    const filterCondition = card?.unshaded?.targets?.[0]?.selector.filter?.condition as
      | { op?: string; args?: readonly unknown[] }
      | undefined;
    assert.equal(filterCondition?.op, 'and');
    assert.equal(filterCondition?.args?.length, 3);
    assert.deepEqual(card?.unshaded?.targets?.[0]?.effects, tagEffectAsts([
      { setMarker: { space: '$targetSpace', marker: 'supportOpposition', state: 'passiveSupport' } },
    ]));
    assert.deepEqual(card?.unshaded?.effects?.[0], tagEffectAsts([{ addVar: { scope: 'global', var: 'patronage', delta: 2 } }])[0]);

    const momentum = card?.unshaded?.lastingEffects?.find((effect) => effect.id === 'mom-bombing-pause');
    assert.notEqual(momentum, undefined);
    assert.equal(momentum?.duration, 'round');
    assert.deepEqual(momentum?.setupEffects, tagEffectAsts([{ setVar: { scope: 'global', var: 'mom_bombingPause', value: true } }]));
    assert.deepEqual(momentum?.teardownEffects, tagEffectAsts([{ setVar: { scope: 'global', var: 'mom_bombingPause', value: false } }]));
  });

  it('encodes card 42 (Chou En Lai) with NVA-selected die-roll troop removal and shaded trail-value resource gain', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-42');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Chou En Lai');
    assert.equal(card?.unshaded?.text, 'NVA Resources -10. NVA must remove a die roll in Troops.');
    assert.equal(
      card?.shaded?.text,
      'Chinese boost aid to North: NVA add +10 Resources. VC add Trail value in Resources.',
    );

    const unshadedEffects = card?.unshaded?.effects ?? [];
    assert.deepEqual(unshadedEffects[0], tagEffectAsts([{ addVar: { scope: 'global', var: 'nvaResources', delta: -10 } }])[0]);
    const rollRandom = (unshadedEffects[1] as { rollRandom?: { bind?: string; min?: number; max?: number; in?: unknown[] } })?.rollRandom;
    assert.equal(rollRandom?.bind, '$chouEnLaiTroopLossRoll');
    assert.equal(rollRandom?.min, 1);
    assert.equal(rollRandom?.max, 6);
    const firstLet = (rollRandom?.in?.[0] as { let?: { bind?: string; in?: unknown[] } })?.let;
    assert.equal(firstLet?.bind, '$nvaTroopsOnMapCount');
    const secondLet = (firstLet?.in?.[0] as { let?: { bind?: string; in?: unknown[] } })?.let;
    assert.equal(secondLet?.bind, '$nvaTroopsToRemove');
    const guardedRemoval = (secondLet?.in?.[0] as { if?: { then?: unknown[] } })?.if;
    const chooseN = (
      guardedRemoval?.then?.[0] as { chooseN?: { bind?: string; chooser?: { id?: number }; min?: unknown; max?: unknown } }
    )?.chooseN;
    assert.equal(chooseN?.bind, '$nvaTroopsChosenToRemove');
    assert.deepEqual(chooseN?.chooser, { id: 2 });
    assert.equal(typeof chooseN?.min, 'object');
    assert.equal(typeof chooseN?.max, 'object');
    assert.equal(typeof (guardedRemoval?.then?.[1] as { forEach?: unknown })?.forEach, 'object');

    const shadedEffects = card?.shaded?.effects ?? [];
    assert.deepEqual(shadedEffects[0], tagEffectAsts([{ addVar: { scope: 'global', var: 'nvaResources', delta: 10 } }])[0]);
    const shadedTrailLet = (
      shadedEffects[1] as { let?: { bind?: string; value?: unknown; in?: Array<{ addVar?: unknown }> } }
    )?.let;
    assert.equal(shadedTrailLet?.bind, '$trailValue');
    assert.deepEqual(shadedTrailLet?.value, { _t: 2, ref: 'gvar', var: 'trail' });
    assert.deepEqual(shadedTrailLet?.in?.[0]?.addVar, {
      scope: 'global',
      var: 'vcResources',
      delta: { _t: 2, ref: 'binding', name: '$trailValue' },
    });
  });

  it('encodes card 52 (RAND) with generic capability-side flip over active global markers', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-52');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'RAND');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['NVA', 'VC', 'US', 'ARVN']);
    assert.equal(card?.unshaded?.text, 'Flip 1 shaded US Capability to unshaded.');
    assert.equal(
      card?.shaded?.text,
      'Systems analysis ignorant of local conditions: Flip 1 unshaded US Capability to shaded.',
    );
    const unshadedChoose = (
      card?.unshaded?.effects?.[0] as {
        chooseOne?: {
          internalDecisionId?: string;
          bind?: string;
          options?: { query?: string; markers?: string[]; states?: string[] };
        };
      }
    )?.chooseOne;
    assert.equal(typeof unshadedChoose?.internalDecisionId, 'string');
    assert.equal(unshadedChoose?.bind, '$randCapabilityMarker');
    assert.equal(unshadedChoose?.options?.query, 'globalMarkers');
    assert.deepEqual(unshadedChoose?.options?.markers, [...RAND_US_CAPABILITY_MARKERS]);
    assert.deepEqual(unshadedChoose?.options?.states, ['shaded']);
    assert.deepEqual((card?.unshaded?.effects?.[1] as { flipGlobalMarker?: unknown })?.flipGlobalMarker, {
      marker: { _t: 2, ref: 'binding', name: '$randCapabilityMarker' },
      stateA: 'unshaded',
      stateB: 'shaded',
    });

    const shadedChoose = (
      card?.shaded?.effects?.[0] as {
        chooseOne?: {
          internalDecisionId?: string;
          bind?: string;
          options?: { query?: string; markers?: string[]; states?: string[] };
        };
      }
    )?.chooseOne;
    assert.equal(typeof shadedChoose?.internalDecisionId, 'string');
    assert.equal(shadedChoose?.bind, '$randCapabilityMarker');
    assert.equal(shadedChoose?.options?.query, 'globalMarkers');
    assert.deepEqual(shadedChoose?.options?.markers, [...RAND_US_CAPABILITY_MARKERS]);
    assert.deepEqual(shadedChoose?.options?.states, ['unshaded']);
    assert.deepEqual((card?.shaded?.effects?.[1] as { flipGlobalMarker?: unknown })?.flipGlobalMarker, {
      marker: { _t: 2, ref: 'binding', name: '$randCapabilityMarker' },
      stateA: 'unshaded',
      stateB: 'shaded',
    });
  });

  it('RAND unshaded offers only shaded US capabilities and flips the selected marker to unshaded', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const start = clearAllZones(initialState(def, 196852, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalMarkers: {
        ...start.globalMarkers,
        cap_topGun: 'shaded',
        cap_cobras: 'shaded',
        cap_cords: 'unshaded',
        cap_migs: 'shaded',
      },
      zones: {
        ...start.zones,
        [eventDeck!.discardZone]: [makeToken('card-52', 'card', 'none')],
      },
    };

    const move = legalMoves(def, configured).find(
      (candidate) =>
        String(candidate.actionId) === 'event' &&
        candidate.params.eventCardId === 'card-52' &&
        candidate.params.side === 'unshaded',
    );
    assert.notEqual(move, undefined, 'Expected legal RAND unshaded event move');

    const pending = resolveMoveDecisionSequence(def, configured, move!, { choose: () => undefined });
    assert.equal(pending.complete, false);
    assert.equal(pending.nextDecision?.name, '$randCapabilityMarker');
    assert.deepEqual(
      pending.nextDecision?.options.map((option) => option.value),
      ['cap_topGun', 'cap_cobras'],
      'RAND unshaded should offer only shaded US capabilities',
    );

    const after = applyMoveWithResolvedDecisionIds(def, configured, move!, {
      overrides: [
        {
          when: (request) => request.name === '$randCapabilityMarker',
          value: 'cap_topGun',
        },
      ],
    }).state;
    assert.equal(after.globalMarkers?.cap_topGun, 'unshaded');
    assert.equal(after.globalMarkers?.cap_cobras, 'shaded');
    assert.equal(after.globalMarkers?.cap_cords, 'unshaded');
    assert.equal(after.globalMarkers?.cap_migs, 'shaded');
  });

  it('RAND shaded offers only unshaded US capabilities and ARVN may execute it under dual-use rules', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const start = clearAllZones(initialState(def, 196853, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(3),
      turnOrderState: { type: 'roundRobin' },
      globalMarkers: {
        ...start.globalMarkers,
        cap_lgbs: 'unshaded',
        cap_cords: 'unshaded',
        cap_topGun: 'shaded',
        cap_pt76: 'unshaded',
      },
      zones: {
        ...start.zones,
        [eventDeck!.discardZone]: [makeToken('card-52', 'card', 'none')],
      },
    };

    const move = legalMoves(def, configured).find(
      (candidate) =>
        String(candidate.actionId) === 'event' &&
        candidate.params.eventCardId === 'card-52' &&
        candidate.params.side === 'shaded',
    );
    assert.notEqual(move, undefined, 'Expected legal RAND shaded event move for ARVN');

    const pending = resolveMoveDecisionSequence(def, configured, move!, { choose: () => undefined });
    assert.equal(pending.complete, false);
    assert.equal(pending.nextDecision?.name, '$randCapabilityMarker');
    assert.deepEqual(
      pending.nextDecision?.options.map((option) => option.value),
      ['cap_cords', 'cap_lgbs'],
      'RAND shaded should offer only unshaded US capabilities',
    );

    const after = applyMoveWithResolvedDecisionIds(def, configured, move!, {
      overrides: [
        {
          when: (request) => request.name === '$randCapabilityMarker',
          value: 'cap_lgbs',
        },
      ],
    }).state;
    assert.equal(after.globalMarkers?.cap_lgbs, 'shaded');
    assert.equal(after.globalMarkers?.cap_cords, 'unshaded');
    assert.equal(after.globalMarkers?.cap_topGun, 'shaded');
    assert.equal(after.globalMarkers?.cap_pt76, 'unshaded');
  });

  it('RAND is not legal when no US capability is on the required side', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const start = clearAllZones(initialState(def, 196854, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalMarkers: {
        ...start.globalMarkers,
        cap_pt76: 'shaded',
        cap_boobyTraps: 'unshaded',
      },
      zones: {
        ...start.zones,
        [eventDeck!.discardZone]: [makeToken('card-52', 'card', 'none')],
      },
    };

    const randMoves = legalMoves(def, configured).filter(
      (candidate) => String(candidate.actionId) === 'event' && candidate.params.eventCardId === 'card-52',
    );
    assert.deepEqual(randMoves, [], 'RAND should be illegal when no matching US capability can be flipped');
  });

  it('encodes card 60 (War Photographer) with exact routing, placement, resources, and conditional eligibility behavior', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-60');
    assert.notEqual(card, undefined);
    assert.equal(card?.metadata?.flavorText, 'Pulitzer photo inspires.');
    assert.equal(card?.unshaded?.text, '3 out of play US pieces to Available.');
    assert.equal(
      card?.shaded?.text,
      'Photos galvanize home front: NVA place 6 Troops outside South Vietnam, add +6 Resources, and, if executing, stay Eligible.',
    );
    assert.deepEqual(card?.unshaded?.effects, tagEffectAsts([
      {
        removeByPriority: {
          budget: 3,
          groups: [
            {
              bind: '$usOutOfPlayPiece',
              over: {
                query: 'tokensInZone',
                zone: 'out-of-play-US:none',
                filter: {
                  prop: 'faction',
                  op: 'eq',
                  value: 'US',
                },
              },
              to: { zoneExpr: 'available-US:none' },
            },
          ],
        },
      },
    ]));
    assert.equal(card?.shaded?.effects?.length, 3);
    assert.equal(card?.shaded?.effects?.[0] !== undefined && 'chooseN' in card.shaded.effects[0], true);
    assert.equal(card?.shaded?.effects?.[1] !== undefined && 'forEach' in card.shaded.effects[1], true);
    assert.deepEqual(card?.shaded?.effects?.[2], tagEffectAsts([{ addVar: { scope: 'global', var: 'nvaResources', delta: 6 } }])[0]);
    assert.deepEqual(card?.shaded?.eligibilityOverrides, [
      {
        target: { kind: 'active' },
        when: { op: '==', left: { _t: 2, ref: 'activeSeat' }, right: 'NVA' },
        eligible: true,
        windowId: 'remain-eligible',
      },
    ]);
  });

  it('applies card 60 unshaded by moving exactly 3 US out-of-play pieces to Available and updating Support+Available only for troops and bases', () => {
    const def = compileDef();
    const setup = setupWarPhotographerState(def, {
      useRoundRobin: true,
      activePlayer: 2,
      zoneTokens: {
        'out-of-play-US:none': [
          makeToken('wp-us-t-1', 'troops', 'US'),
          makeToken('wp-us-b-1', 'base', 'US'),
          makeToken('wp-us-ir-1', 'irregular', 'US'),
          makeToken('wp-us-t-2', 'troops', 'US'),
        ],
      },
    });
    const move = findWarPhotographerMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected War Photographer unshaded event move');

    const scoreBefore = usSupportAvailableScoreWithNeutralSupport(setup);
    const final = applyMove(def, setup, move!).state;
    const scoreAfter = usSupportAvailableScoreWithNeutralSupport(final);

    assert.equal(countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'base'), 1);
    assert.equal(countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'irregular'), 1);
    assert.equal(countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US'), 1);
    assert.equal(
      (final.zones['out-of-play-US:none'] ?? [])[0]?.id,
      asTokenId('wp-us-t-2'),
      'Only the fourth unselected out-of-play US piece should remain',
    );
    assert.equal(scoreAfter - scoreBefore, 2, 'Only Troops and Bases entering Available should affect the US Support+Available score');
  });

  it('applies card 60 shaded by placing up to 6 NVA Troops outside South Vietnam, adding 6 Resources, and never placing into South Vietnam', () => {
    const def = compileDef();
    const setup = setupWarPhotographerState(def, {
      useRoundRobin: true,
      activePlayer: 2,
      zoneTokens: {
        'available-NVA:none': Array.from({ length: 7 }, (_, index) => makeToken(`wp-nva-t-${index + 1}`, 'troops', 'NVA')),
      },
    });
    const move = findWarPhotographerMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected War Photographer shaded event move');

    const overrides: readonly DecisionOverrideRule[] = [
      {
        when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
        value: Array.from({ length: 6 }, (_, index) => asTokenId(`wp-nva-t-${index + 1}`)),
      },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: 'north-vietnam:none' },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[1]'), value: 'north-vietnam:none' },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[2]'), value: 'central-laos:none' },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[3]'), value: 'central-laos:none' },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[4]'), value: 'northeast-cambodia:none' },
      { when: (request) => request.decisionKey.endsWith('chooseDestination[5]'), value: 'northeast-cambodia:none' },
    ];

    const beforeResources = Number(setup.globalVars.nvaResources ?? 0);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(Number(final.globalVars.nvaResources) - beforeResources, 6, 'Shaded should add exactly 6 NVA Resources');
    assert.equal(countTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, 'north-vietnam:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 2);
    assert.equal(countTokens(final, 'central-laos:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 2);
    assert.equal(countTokens(final, 'northeast-cambodia:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 2);
    assert.equal(countTokens(final, 'quang-tri-thua-thien:none', (token) => token.props.faction === 'NVA'), 0, 'Shaded must not place NVA troops in South Vietnam');
  });

  it('resolves card 60 shaded partially when fewer than 6 NVA Troops are available', () => {
    const def = compileDef();
    const setup = setupWarPhotographerState(def, {
      useRoundRobin: true,
      activePlayer: 2,
      zoneTokens: {
        'available-NVA:none': [
          makeToken('wp-few-1', 'troops', 'NVA'),
          makeToken('wp-few-2', 'troops', 'NVA'),
          makeToken('wp-few-3', 'troops', 'NVA'),
        ],
      },
    });
    const move = findWarPhotographerMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected War Photographer shaded event move');

    const beforeResources = Number(setup.globalVars.nvaResources ?? 0);
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, {
      overrides: [
        {
          when: matchesDecisionRequest({ baseIdPattern: /distributeTokens\.selectTokens$/u }),
          value: [asTokenId('wp-few-1'), asTokenId('wp-few-2'), asTokenId('wp-few-3')],
        },
        { when: (request) => request.decisionKey.endsWith('chooseDestination[0]'), value: 'north-vietnam:none' },
        { when: (request) => request.decisionKey.endsWith('chooseDestination[1]'), value: 'central-laos:none' },
        { when: (request) => request.decisionKey.endsWith('chooseDestination[2]'), value: 'northeast-cambodia:none' },
      ],
    }).state;

    assert.equal(countTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 0);
    assert.equal(countTokens(final, 'north-vietnam:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, 'central-laos:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.equal(countTokens(final, 'northeast-cambodia:none', (token) => token.props.faction === 'NVA' && token.type === 'troops'), 1);
    assert.equal(
      Number(final.globalVars.nvaResources) - beforeResources,
      6,
      'Resource gain should not depend on how many troops were available to place',
    );
  });

  it('resolves War Photographer shaded stay-eligible only for NVA executors', () => {
    const def = compileDef();
    const nvaSetup = setupWarPhotographerState(def, {
      activePlayer: 0,
      firstEligible: 'NVA',
      secondEligible: 'VC',
      zoneTokens: {
        'available-NVA:none': [makeToken('wp-cond-nva', 'troops', 'NVA')],
      },
    });
    const nvaMove = { actionId: asActionId('event'), params: { eventCardId: 'card-60', side: 'shaded' } } as const;
    assert.deepEqual(resolveEventEligibilityOverrides(def, nvaSetup, nvaMove), [
      {
        target: { kind: 'active' },
        when: { op: '==', left: { _t: 2, ref: 'activeSeat' }, right: 'NVA' },
        eligible: true,
        windowId: 'remain-eligible',
      },
    ]);

    const arvnSetup = setupWarPhotographerState(def, {
      activePlayer: 2,
      firstEligible: 'ARVN',
      secondEligible: 'US',
      zoneTokens: {
        'available-NVA:none': [makeToken('wp-cond-arvn', 'troops', 'NVA')],
      },
    });
    const arvnMove = { actionId: asActionId('event'), params: { eventCardId: 'card-60', side: 'shaded' } } as const;
    assert.deepEqual(resolveEventEligibilityOverrides(def, arvnSetup, arvnMove), []);
  });
});
