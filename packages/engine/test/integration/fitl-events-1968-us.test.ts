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
import {
  applyMoveWithResolvedDecisionIds,
  type DecisionOverrideRule,
} from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';

const FITL_PRODUCTION_FIXTURE = getFitlProductionFixture();

const expectedCards = [
  { id: 'card-2', order: 2, title: 'Kissinger', seatOrder: ['US', 'NVA', 'ARVN', 'VC'] },
  { id: 'card-3', order: 3, title: 'Peace Talks', seatOrder: ['US', 'NVA', 'ARVN', 'VC'] },
  { id: 'card-4', order: 4, title: 'Top Gun', seatOrder: ['US', 'NVA', 'ARVN', 'VC'] },
  { id: 'card-9', order: 9, title: 'Psychedelic Cookie', seatOrder: ['US', 'NVA', 'VC', 'ARVN'] },
  { id: 'card-11', order: 11, title: 'Abrams', seatOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-12', order: 12, title: 'Capt Buck Adams', seatOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-13', order: 13, title: 'Cobras', seatOrder: ['US', 'ARVN', 'NVA', 'VC'] },
  { id: 'card-16', order: 16, title: 'Blowtorch Komer', seatOrder: ['US', 'ARVN', 'VC', 'NVA'] },
  { id: 'card-19', order: 19, title: 'CORDS', seatOrder: ['US', 'ARVN', 'VC', 'NVA'] },
  { id: 'card-20', order: 20, title: 'Laser Guided Bombs', seatOrder: ['US', 'ARVN', 'VC', 'NVA'] },
  { id: 'card-21', order: 21, title: 'Americal', seatOrder: ['US', 'VC', 'NVA', 'ARVN'] },
  { id: 'card-30', order: 30, title: 'USS New Jersey', seatOrder: ['US', 'VC', 'ARVN', 'NVA'] },
] as const;

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

const makeGuerrilla = (id: string, faction: 'NVA' | 'VC', activity: 'active' | 'underground'): Token => ({
  id: asTokenId(id),
  type: 'guerrilla',
  props: { faction, type: 'guerrilla', activity },
});

const makeVcBase = (id: string, tunnel: 'tunneled' | 'untunneled'): Token => ({
  id: asTokenId(id),
  type: 'base',
  props: { faction: 'VC', type: 'base', tunnel },
});

const withNeutralSupportMarkers = (state: GameState): GameState['markers'] =>
  Object.fromEntries(
    Object.entries(state.markers).map(([zoneId, zoneMarkers]) => [
      zoneId,
      zoneMarkers.supportOpposition === undefined
        ? zoneMarkers
        : { ...zoneMarkers, supportOpposition: 'neutral' },
    ]),
  ) as GameState['markers'];

const setupPeaceTalksState = (
  def: GameDef,
  overrides: {
    readonly nvaResources?: number;
    readonly trail?: number;
    readonly availableUsTroops?: number;
    readonly availableUsBases?: number;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const baseState = clearAllZones(initialState(def, 196803, 4).state);
  const availableUsTroops = Array.from(
    { length: overrides.availableUsTroops ?? 0 },
    (_, index) => makeToken(`us-trp-${index}`, 'troops', 'US'),
  );
  const availableUsBases = Array.from(
    { length: overrides.availableUsBases ?? 0 },
    (_, index) => makeToken(`us-base-${index}`, 'base', 'US'),
  );
  return {
    ...baseState,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...baseState.globalVars,
      nvaResources: overrides.nvaResources ?? (baseState.globalVars.nvaResources as number | undefined) ?? 0,
      trail: overrides.trail ?? (baseState.globalVars.trail as number | undefined) ?? 0,
      linebacker11Allowed: false,
      linebacker11SupportAvailable: 0,
    },
    markers: withNeutralSupportMarkers(baseState),
    zones: {
      ...baseState.zones,
      [eventDeck!.discardZone]: [makeToken('card-3', 'card', 'none')],
      'available-US:none': [...availableUsTroops, ...availableUsBases],
    },
  };
};

const setupPsychedelicCookieState = (
  def: GameDef,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const baseState = clearAllZones(initialState(def, 196809, 4).state);
  return {
    ...baseState,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    markers: withNeutralSupportMarkers(baseState),
    zones: {
      ...baseState.zones,
      [eventDeck!.discardZone]: [makeToken('card-9', 'card', 'none')],
      ...overrides.zoneTokens,
    },
  };
};

const setupKissingerState = (
  def: GameDef,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly aid?: number;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const baseState = clearAllZones(initialState(def, 196802, 4).state);
  return {
    ...baseState,
    activePlayer: asPlayerId(0),
    turnOrderState: { type: 'roundRobin' },
    globalVars: {
      ...baseState.globalVars,
      aid: overrides.aid ?? (baseState.globalVars.aid as number | undefined) ?? 0,
    },
    markers: withNeutralSupportMarkers(baseState),
    zones: {
      ...baseState.zones,
      [eventDeck!.discardZone]: [makeToken('card-2', 'card', 'none')],
      ...overrides.zoneTokens,
    },
  };
};

const findPeaceTalksMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event' &&
      move.params.side === side &&
      (move.params.eventCardId === undefined || move.params.eventCardId === 'card-3'),
  );

const findPsychedelicCookieMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event' &&
      move.params.side === side &&
      (move.params.eventCardId === undefined || move.params.eventCardId === 'card-9'),
  );

const findBuckAdamsMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event' &&
      move.params.side === side &&
      (move.params.eventCardId === undefined || move.params.eventCardId === 'card-12'),
  );

const findAmericalMove = (def: GameDef, state: GameState, side: 'unshaded' | 'shaded') =>
  legalMoves(def, state).find(
    (move) =>
      String(move.actionId) === 'event' &&
      move.params.side === side &&
      (move.params.eventCardId === undefined || move.params.eventCardId === 'card-21'),
  );

const countTokens = (
  state: GameState,
  zoneId: string,
  predicate: (token: Token) => boolean,
): number => (state.zones[zoneId] ?? []).filter((token) => predicate(token)).length;

const usSupportAvailableScoreWithNeutralSupport = (state: GameState): number =>
  countTokens(state, 'available-US:none', (token) => token.props.faction === 'US' && (token.type === 'troops' || token.type === 'base'));

const setupBuckAdamsState = (
  def: GameDef,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly activePlayer?: number;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const baseState = clearAllZones(initialState(def, 196812, 4).state);
  return {
    ...baseState,
    activePlayer: asPlayerId(overrides.activePlayer ?? 0),
    turnOrderState: { type: 'roundRobin' },
    markers: withNeutralSupportMarkers(baseState),
    zones: {
      ...baseState.zones,
      [eventDeck!.discardZone]: [makeToken('card-12', 'card', 'none')],
      ...overrides.zoneTokens,
    },
  };
};

const setupAmericalState = (
  def: GameDef,
  overrides: {
    readonly zoneTokens?: Readonly<Record<string, readonly Token[]>>;
    readonly activePlayer?: number;
  },
): GameState => {
  const eventDeck = def.eventDecks?.[0];
  assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

  const baseState = clearAllZones(initialState(def, 196821, 4).state);
  return {
    ...baseState,
    activePlayer: asPlayerId(overrides.activePlayer ?? 0),
    turnOrderState: { type: 'roundRobin' },
    markers: withNeutralSupportMarkers(baseState),
    zones: {
      ...baseState.zones,
      [eventDeck!.discardZone]: [makeToken('card-21', 'card', 'none')],
      ...overrides.zoneTokens,
    },
  };
};

describe('FITL 1968 US-first event-card production spec', () => {
  it('compiles all 12 US-first 1968 cards with dual side metadata invariants', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, 'dual');
      assert.equal(card?.metadata?.period, '1968');
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.metadata?.flavorText, 'string', `${expected.id} must include flavorText`);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);
      assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
    }
  });

  it('encodes 1968 US capability cards as capability marker toggles for both sides', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedCapabilities = [
      { id: 'card-11', marker: 'cap_abrams' },
      { id: 'card-13', marker: 'cap_cobras' },
      { id: 'card-19', marker: 'cap_cords' },
      { id: 'card-20', marker: 'cap_lgbs' },
    ] as const;

    for (const expected of expectedCapabilities) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('capability'), true, `${expected.id} must include capability tag`);
      assert.equal(card?.tags?.includes('US'), true, `${expected.id} must include US tag`);
      assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'unshaded' } }]);
      assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: expected.marker, state: 'shaded' } }]);
      if (expected.id === 'card-19') {
        assert.equal(card?.unshaded?.text, 'US Training may Pacify in 2 selected spaces. US CAPABILITY.');
        assert.equal(card?.shaded?.text, 'US Training may Pacify only to Passive Support.');
      }
      if (expected.id === 'card-20') {
        assert.equal(card?.unshaded?.text, 'Air Strike does not shift Support/Opposition in spaces where only 1 piece removed. US CAPABILITY.');
        assert.equal(card?.shaded?.text, 'Air Strike removes no more than 2 pieces.');
      }
    }
  });

  it('encodes Top Gun unshaded as MiGs shaded cancellation plus marker activation', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-4');
    assert.notEqual(card, undefined);
    assert.equal(card?.unshaded?.text, 'Cancel shaded MiGs. Air Strikes Degrade Trail 2 boxes. US CAPABILITY.');
    assert.equal(card?.shaded?.text, 'Air Strike Degrades Trail after applying 2 hits only on die roll of 4-6.');
    assert.deepEqual((card?.unshaded?.effects?.[0] as { setGlobalMarker?: unknown })?.setGlobalMarker, {
      marker: 'cap_topGun',
      state: 'unshaded',
    });
    assert.equal((card?.unshaded?.effects?.[1] as { if?: unknown })?.if !== undefined, true);
    assert.deepEqual((card?.shaded?.effects?.[0] as { setGlobalMarker?: unknown })?.setGlobalMarker, {
      marker: 'cap_topGun',
      state: 'shaded',
    });
  });

  it('resolves Top Gun unshaded by canceling already-executed shaded MiGs', () => {
    const def = compileDef();
    const eventDeck = def.eventDecks?.[0];
    assert.notEqual(eventDeck, undefined, 'Expected at least one event deck');

    const start = clearAllZones(initialState(def, 196804, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      turnOrderState: { type: 'roundRobin' },
      globalMarkers: {
        ...start.globalMarkers,
        cap_migs: 'shaded',
      },
      zones: {
        ...start.zones,
        [eventDeck!.discardZone]: [makeToken('card-4', 'card', 'none')],
      },
    };

    const move = legalMoves(def, configured).find(
      (candidate) =>
        String(candidate.actionId) === 'event' &&
        candidate.params.eventCardId === 'card-4' &&
        candidate.params.side === 'unshaded',
    );
    assert.notEqual(move, undefined, 'Expected legal Top Gun unshaded event move');

    const after = applyMove(def, configured, move!).state;
    assert.notEqual(after.globalMarkers, undefined);
    assert.equal(after.globalMarkers?.cap_topGun, 'unshaded');
    assert.equal(after.globalMarkers?.cap_migs, 'inactive');
  });

  it('encodes card 16 (Blowtorch Komer) as unshaded round momentum toggle', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-16');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('momentum'), true);
    assert.equal(card?.unshaded?.text, 'Aid +10. This Support phase, Pacify costs 1 Resource per step or Terror. MOMENTUM');
    assert.equal(card?.shaded?.text, 'Aid -10. Shift a space with Troops and Police 1 level toward Active Opposition.');
    assert.deepEqual((card?.unshaded?.effects?.[0] as { addVar?: unknown })?.addVar, {
      scope: 'global',
      var: 'aid',
      delta: 10,
    });
    assert.deepEqual((card?.shaded?.effects?.[0] as { addVar?: unknown })?.addVar, {
      scope: 'global',
      var: 'aid',
      delta: -10,
    });
    assert.equal((card?.shaded?.effects?.[1] as { if?: unknown })?.if !== undefined, true);

    const momentum = card?.unshaded?.lastingEffects?.find((effect) => effect.id === 'mom-blowtorch-komer');
    assert.notEqual(momentum, undefined);
    assert.equal(momentum?.duration, 'round');
    assert.deepEqual(momentum?.setupEffects, [{ setVar: { scope: 'global', var: 'mom_blowtorchKomer', value: true } }]);
    assert.deepEqual(momentum?.teardownEffects, [{ setVar: { scope: 'global', var: 'mom_blowtorchKomer', value: false } }]);
  });

  it('encodes card 3 (Peace Talks) with Linebacker eligibility state wiring and shaded trail floor', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const linebackerAllowed = compiled.gameDef?.globalVars.find((variable) => variable.name === 'linebacker11Allowed');
    assert.notEqual(linebackerAllowed, undefined);
    assert.equal(linebackerAllowed?.type, 'boolean');
    assert.equal(linebackerAllowed?.init, false);

    const supportAvailable = compiled.gameDef?.globalVars.find((variable) => variable.name === 'linebacker11SupportAvailable');
    assert.notEqual(supportAvailable, undefined);
    assert.equal(supportAvailable?.type, 'int');
    assert.equal(supportAvailable?.init, 0);
    assert.equal(supportAvailable?.min, 0);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-3');
    assert.notEqual(card, undefined);
    assert.deepEqual((card?.unshaded?.effects?.[0] as { addVar?: { var?: string; delta?: number } })?.addVar, {
      scope: 'global',
      var: 'nvaResources',
      delta: -9,
    });
    assert.deepEqual((card?.unshaded?.effects?.[1] as { setVar?: { var?: string; value?: number } })?.setVar, {
      scope: 'global',
      var: 'linebacker11SupportAvailable',
      value: 0,
    });

    const finalEffect = card?.unshaded?.effects?.at(-1) as { if?: { when?: { op?: string; left?: { var?: string } }; then?: unknown[]; else?: unknown[] } };
    assert.equal(finalEffect?.if?.when?.op, '>');
    assert.equal(finalEffect?.if?.when?.left?.var, 'linebacker11SupportAvailable');
    assert.equal(finalEffect?.if?.then?.length, 1);
    assert.equal(finalEffect?.if?.else?.length, 1);

    assert.deepEqual((card?.shaded?.effects?.[0] as { addVar?: { var?: string; delta?: number } })?.addVar, {
      scope: 'global',
      var: 'nvaResources',
      delta: 9,
    });
    assert.equal((card?.shaded?.effects?.[1] as { if?: { when?: { op?: string; right?: number } } })?.if?.when?.op, '<=');
    assert.equal((card?.shaded?.effects?.[1] as { if?: { when?: { right?: number } } })?.if?.when?.right, 2);
  });

  it('applies Peace Talks unshaded threshold strictly: >25 enables Linebacker flag, 25 does not', () => {
    const def = compileDef();

    const atThreshold = setupPeaceTalksState(def, {
      nvaResources: 30,
      availableUsTroops: 25,
      availableUsBases: 0,
    });
    const atThresholdMove = findPeaceTalksMove(def, atThreshold, 'unshaded');
    assert.notEqual(atThresholdMove, undefined, 'Expected unshaded Peace Talks event move at threshold');
    const atThresholdAfter = applyMove(def, atThreshold, atThresholdMove!).state;
    assert.equal(atThresholdAfter.globalVars.linebacker11SupportAvailable, 25);
    assert.equal(atThresholdAfter.globalVars.linebacker11Allowed, false);
    assert.equal(atThresholdAfter.globalVars.nvaResources, 21);

    const aboveThreshold = setupPeaceTalksState(def, {
      nvaResources: 8,
      availableUsTroops: 26,
      availableUsBases: 0,
    });
    const aboveThresholdMove = findPeaceTalksMove(def, aboveThreshold, 'unshaded');
    assert.notEqual(aboveThresholdMove, undefined, 'Expected unshaded Peace Talks event move above threshold');
    const aboveThresholdAfter = applyMove(def, aboveThreshold, aboveThresholdMove!).state;
    assert.equal(aboveThresholdAfter.globalVars.linebacker11SupportAvailable, 26);
    assert.equal(aboveThresholdAfter.globalVars.linebacker11Allowed, true);
    assert.equal(aboveThresholdAfter.globalVars.nvaResources, 0, 'NVA resources should clamp at minimum 0');
  });

  it('applies Peace Talks shaded trail floor only when trail is 0..2', () => {
    const def = compileDef();

    const atFloor = setupPeaceTalksState(def, { trail: 2, nvaResources: 10 });
    const atFloorMove = findPeaceTalksMove(def, atFloor, 'shaded');
    assert.notEqual(atFloorMove, undefined, 'Expected shaded Peace Talks move with trail=2');
    const atFloorAfter = applyMove(def, atFloor, atFloorMove!).state;
    assert.equal(atFloorAfter.globalVars.trail, 3);
    assert.equal(atFloorAfter.globalVars.nvaResources, 19);

    const aboveFloor = setupPeaceTalksState(def, { trail: 3, nvaResources: 10 });
    const aboveFloorMove = findPeaceTalksMove(def, aboveFloor, 'shaded');
    assert.notEqual(aboveFloorMove, undefined, 'Expected shaded Peace Talks move with trail=3');
    const aboveFloorAfter = applyMove(def, aboveFloor, aboveFloorMove!).state;
    assert.equal(aboveFloorAfter.globalVars.trail, 3);
    assert.equal(aboveFloorAfter.globalVars.nvaResources, 19);
  });

  it('encodes card 2 (Kissinger) metadata, text, and shaded aid penalty', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-2');
    assert.notEqual(card, undefined);

    // Metadata
    assert.equal(card?.metadata?.flavorText, 'Operation Menu.');
    assert.equal(card?.unshaded?.text, 'Remove a die roll of Insurgent pieces total from Cambodia and Laos.');
    assert.equal(
      card?.shaded?.text,
      'NVA places 2 pieces in Cambodia. US moves any 2 US Troops to out of play. Aid -6.',
    );
    assert.deepEqual(card?.shaded?.effects?.at(-1), { addVar: { scope: 'global', var: 'aid', delta: -6 } });
  });

  it('applies card-2 shaded by placing up to 2 NVA pieces in Cambodia, moving 2 US troops to out-of-play, and reducing aid by 6', () => {
    const def = compileDef();
    const setup = setupKissingerState(def, {
      aid: 20,
      zoneTokens: {
        'available-NVA:none': [
          makeToken('nva-av-troops', 'troops', 'NVA'),
          makeToken('nva-av-base', 'base', 'NVA'),
          makeGuerrilla('nva-av-guerrilla', 'NVA', 'active'),
        ],
        'northeast-cambodia:none': [makeToken('vc-cam-existing', 'troops', 'VC')],
        'quang-nam:none': [makeToken('us-map-1', 'troops', 'US')],
        'available-US:none': [makeToken('us-av-1', 'troops', 'US')],
        'casualties-US:none': [makeToken('us-cas-1', 'troops', 'US')],
      },
    });
    const move = legalMoves(def, setup).find(
      (candidate) =>
        String(candidate.actionId) === 'event' &&
        candidate.params.eventCardId === 'card-2' &&
        candidate.params.side === 'shaded',
    );
    assert.notEqual(move, undefined, 'Expected shaded Kissinger event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) =>
          request.type === 'chooseN' &&
          request.options.some((option) => String(option.value).startsWith('nva-av-')),
        value: [asTokenId('nva-av-troops'), asTokenId('nva-av-base')],
      },
      {
        when: (request) =>
          request.type === 'chooseN' &&
          request.options.some((option) => String(option.value).startsWith('us-')),
        value: [asTokenId('us-map-1'), asTokenId('us-av-1')],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(final.globalVars.aid, 14, 'Aid should be reduced by 6');
    assert.equal(
      countTokens(final, 'northeast-cambodia:none', (token) => token.props.faction === 'NVA'),
      2,
      'Selected NVA pieces should be placed in Cambodia',
    );
    assert.equal(
      countTokens(final, 'available-NVA:none', (token) => token.props.faction === 'NVA'),
      1,
      'Exactly one unselected NVA piece should remain in available',
    );
    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'Exactly two selected US troops should move to out-of-play',
    );
    assert.equal(
      countTokens(final, 'quang-nam:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Selected map US troop should leave its origin space',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Selected available US troop should leave available',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'Unselected casualties troop should remain in casualties',
    );
  });

  it('encodes card 9 (Psychedelic Cookie) with explicit unshaded/shaded troop-routing effects', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-9');
    assert.notEqual(card, undefined);
    assert.equal(
      card?.unshaded?.text,
      'US moves up to 3 US Troops from out of play to Available or South Vietnam, or from the map to Available.',
    );
    assert.equal(card?.shaded?.text, 'US takes 3 of its Troops from the map out of play.');

    const unshadedEffects = card?.unshaded?.effects ?? [];
    assert.equal(unshadedEffects.length, 2, 'card-9 unshaded should define choose+forEach routing');
    const unshadedChooseN = (unshadedEffects[0] as { chooseN?: { bind?: string; options?: { query?: string; sources?: unknown[] }; max?: number } }).chooseN;
    assert.notEqual(unshadedChooseN, undefined);
    assert.equal(unshadedChooseN?.bind, '$usTroops');
    assert.equal(unshadedChooseN?.options?.query, 'concat');
    assert.equal(unshadedChooseN?.options?.sources?.length, 2);
    assert.equal(unshadedChooseN?.max, 3);

    const shadedEffects = card?.shaded?.effects ?? [];
    assert.equal(shadedEffects.length, 2, 'card-9 shaded should define choose+forEach routing');
    const shadedChooseN = (shadedEffects[0] as { chooseN?: { bind?: string; options?: { query?: string }; max?: number } }).chooseN;
    assert.notEqual(shadedChooseN, undefined);
    assert.equal(shadedChooseN?.bind, '$usMapTroops');
    assert.equal(shadedChooseN?.options?.query, 'tokensInMapSpaces');
    assert.equal(shadedChooseN?.max, 3);
  });

  it('applies card-9 unshaded with mixed routing and updates Support+Available score when troops enter Available', () => {
    const def = compileDef();
    const setup = setupPsychedelicCookieState(def, {
      zoneTokens: {
        'out-of-play-US:none': [
          makeToken('us-oop-a', 'troops', 'US'),
          makeToken('us-oop-b', 'troops', 'US'),
        ],
        'available-US:none': [makeToken('us-av-0', 'troops', 'US')],
        'hue:none': [makeToken('us-map-a', 'troops', 'US')],
        'saigon:none': [makeToken('us-map-b', 'troops', 'US')],
      },
    });
    const move = findPsychedelicCookieMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded Psychedelic Cookie event move');

    const scoreBefore = usSupportAvailableScoreWithNeutralSupport(setup);
    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$usTroops' || request.decisionKey.includes('usTroops'),
        value: [asTokenId('us-oop-a'), asTokenId('us-oop-b'), asTokenId('us-map-a')],
      },
      {
        when: (request) => request.name.includes('oopTroopDestination') && request.decisionKey.includes('us-oop-a'),
        value: 'available-US:none',
      },
      {
        when: (request) => request.name.includes('oopTroopDestination') && request.decisionKey.includes('us-oop-b'),
        value: 'south-vietnam-map',
      },
      {
        when: (request) => request.name.includes('southVietnamSpace') && request.decisionKey.includes('us-oop-b'),
        value: 'saigon:none',
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;
    const scoreAfter = usSupportAvailableScoreWithNeutralSupport(final);

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      3,
      'Available US troops should increase by exactly 2',
    );
    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Out-of-play US troops should be emptied by selected moves',
    );
    assert.equal(
      countTokens(final, 'hue:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Selected map troop should move from map to Available',
    );
    assert.equal(
      countTokens(final, 'saigon:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'One out-of-play troop should move into selected South Vietnam map space',
    );
    assert.equal(scoreAfter - scoreBefore, 2, 'Support+Available score should rise by troops moved into Available');
  });

  it('applies card-9 shaded from map only and leaves Support+Available score unchanged', () => {
    const def = compileDef();
    const setup = setupPsychedelicCookieState(def, {
      zoneTokens: {
        'out-of-play-US:none': [makeToken('us-oop-0', 'troops', 'US')],
        'available-US:none': [makeToken('us-av-0', 'troops', 'US'), makeToken('us-av-1', 'troops', 'US')],
        'hue:none': [makeToken('us-map-a', 'troops', 'US'), makeToken('us-map-b', 'troops', 'US')],
        'saigon:none': [makeToken('us-map-c', 'troops', 'US'), makeToken('us-map-d', 'troops', 'US')],
      },
    });
    const move = findPsychedelicCookieMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded Psychedelic Cookie event move');

    const scoreBefore = usSupportAvailableScoreWithNeutralSupport(setup);
    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$usMapTroops' || request.decisionKey.includes('usMapTroops'),
        value: [asTokenId('us-map-a'), asTokenId('us-map-b'), asTokenId('us-map-c')],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;
    const scoreAfter = usSupportAvailableScoreWithNeutralSupport(final);

    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      4,
      'Out-of-play US troops should increase by exactly 3 from map removals',
    );
    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'Available US troops should remain unchanged for shaded map-to-out-of-play routing',
    );
    assert.equal(
      countTokens(final, 'hue:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Selected map troops should be removed from originating map spaces',
    );
    assert.equal(
      countTokens(final, 'saigon:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'Only one unselected US map troop should remain',
    );
    assert.equal(scoreAfter, scoreBefore, 'Support+Available score should not change when no troop enters/exits Available');
  });

  it('gracefully resolves card-9 when no eligible US troops exist for either side', () => {
    const def = compileDef();
    const setup = setupPsychedelicCookieState(def, { zoneTokens: {} });
    const unshaded = findPsychedelicCookieMove(def, setup, 'unshaded');
    const shaded = findPsychedelicCookieMove(def, setup, 'shaded');
    assert.notEqual(unshaded, undefined, 'Expected unshaded event move even with no eligible troops');
    assert.notEqual(shaded, undefined, 'Expected shaded event move even with no eligible troops');

    const afterUnshaded = applyMoveWithResolvedDecisionIds(def, setup, unshaded!).state;
    const afterShaded = applyMoveWithResolvedDecisionIds(def, setup, shaded!).state;
    assert.deepEqual(afterUnshaded.zones, setup.zones, 'Unshaded should be a no-op when no US troops are eligible');
    assert.deepEqual(afterShaded.zones, setup.zones, 'Shaded should be a no-op when no US troops are eligible');
  });

  it('encodes card-21 (Americal) with dual-source troop movement and per-province VC removal effects', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-21');
    assert.notEqual(card, undefined);
    assert.equal(
      card?.unshaded?.text,
      'US moves up to 2 US Troops each from the map and out of play to any 1 space or Available.',
    );
    assert.equal(
      card?.shaded?.text,
      'In 1 or 2 Provinces with US Troops, remove 1 VC piece to set to Active Opposition.',
    );

    const unshadedEffects = card?.unshaded?.effects ?? [];
    assert.equal(unshadedEffects.length, 4, 'card-21 unshaded should define map-select, oop-select, destination-select, and routing');
    assert.notEqual((unshadedEffects[0] as { chooseN?: unknown }).chooseN, undefined);
    assert.notEqual((unshadedEffects[1] as { chooseN?: unknown }).chooseN, undefined);
    assert.notEqual((unshadedEffects[2] as { chooseOne?: unknown }).chooseOne, undefined);
    assert.notEqual((unshadedEffects[3] as { if?: unknown }).if, undefined);

    const shadedTargets = card?.shaded?.targets ?? [];
    assert.equal(shadedTargets.length, 1, 'card-21 shaded should use canonical target selector');
    assert.equal(shadedTargets[0]?.id, '$targetProvince');
    assert.equal(shadedTargets[0]?.application, 'each');
  });

  it('applies card-21 unshaded by moving up to 2 map troops and up to 2 out-of-play troops into one selected map space', () => {
    const def = compileDef();
    const setup = setupAmericalState(def, {
      zoneTokens: {
        'out-of-play-US:none': [
          makeToken('us-oop-1', 'troops', 'US'),
          makeToken('us-oop-2', 'troops', 'US'),
          makeToken('us-oop-3', 'troops', 'US'),
        ],
        'hue:none': [makeToken('us-map-hue-1', 'troops', 'US'), makeToken('us-map-hue-2', 'troops', 'US')],
        'saigon:none': [makeToken('us-map-sai-1', 'troops', 'US')],
      },
    });
    const move = findAmericalMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded Americal event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$usMapTroops' || request.decisionKey.includes('usMapTroops'),
        value: [asTokenId('us-map-hue-1'), asTokenId('us-map-sai-1')],
      },
      {
        when: (request) => request.name === '$usOutOfPlayTroops' || request.decisionKey.includes('usOutOfPlayTroops'),
        value: [asTokenId('us-oop-1'), asTokenId('us-oop-2')],
      },
      {
        when: (request) => request.name === '$americalDestinationType' || request.decisionKey.includes('americalDestinationType'),
        value: 'map-space',
      },
      {
        when: (request) => request.name === '$americalDestinationSpace' || request.decisionKey.includes('americalDestinationSpace'),
        value: 'da-nang:none',
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'da-nang:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      4,
      'Destination map space should receive all selected troops from both sources',
    );
    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'Out-of-play source should lose exactly the selected two troops',
    );
    assert.equal(
      countTokens(final, 'hue:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'Only one unselected Hue troop should remain',
    );
    assert.equal(
      countTokens(final, 'saigon:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Selected Saigon troop should be moved',
    );
  });

  it('applies card-21 unshaded with Available destination and gracefully no-ops when no eligible troops exist', () => {
    const def = compileDef();
    const setup = setupAmericalState(def, {
      zoneTokens: {
        'out-of-play-US:none': [makeToken('us-oop-a', 'troops', 'US')],
        'hue:none': [makeToken('us-map-a', 'troops', 'US')],
      },
    });
    const move = findAmericalMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded Americal event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$usMapTroops' || request.decisionKey.includes('usMapTroops'),
        value: [asTokenId('us-map-a')],
      },
      {
        when: (request) => request.name === '$usOutOfPlayTroops' || request.decisionKey.includes('usOutOfPlayTroops'),
        value: [asTokenId('us-oop-a')],
      },
      {
        when: (request) => request.name === '$americalDestinationType' || request.decisionKey.includes('americalDestinationType'),
        value: 'available-US:none',
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'available-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'Available should receive selected map and out-of-play troops',
    );
    assert.equal(
      countTokens(final, 'out-of-play-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Selected out-of-play troops should leave out-of-play',
    );
    assert.equal(
      countTokens(final, 'hue:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      0,
      'Selected map troops should leave their map spaces',
    );

    const emptySetup = setupAmericalState(def, { zoneTokens: {} });
    const emptyMove = findAmericalMove(def, emptySetup, 'unshaded');
    assert.notEqual(emptyMove, undefined, 'Expected unshaded Americal move even when no US troops are available');
    const emptyFinal = applyMoveWithResolvedDecisionIds(def, emptySetup, emptyMove!).state;
    assert.deepEqual(emptyFinal.zones, emptySetup.zones, 'Unshaded Americal should be a no-op when no troops are eligible');
  });

  it('applies card-21 shaded in up to two eligible provinces only, removing one VC piece each and setting Active Opposition', () => {
    const def = compileDef();
    const setup = setupAmericalState(def, {
      zoneTokens: {
        'quang-tri-thua-thien:none': [
          makeToken('us-qt-1', 'troops', 'US'),
          makeGuerrilla('vc-qt-g', 'VC', 'active'),
        ],
        'quang-nam:none': [
          makeToken('us-qn-1', 'troops', 'US'),
          makeGuerrilla('vc-qn-g', 'VC', 'active'),
        ],
        'saigon:none': [
          makeToken('us-sai-1', 'troops', 'US'),
          makeGuerrilla('vc-sai-g', 'VC', 'active'),
        ],
      },
    });
    const move = findAmericalMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded Americal event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince' || request.decisionKey.includes('targetProvince'),
        value: ['quang-tri-thua-thien:none', 'quang-nam:none'],
      },
      {
        when: (request) => request.name.includes('vcPieceToRemove') && request.decisionKey.includes('quang-tri-thua-thien:none'),
        value: [asTokenId('vc-qt-g')],
      },
      {
        when: (request) => request.name.includes('vcPieceToRemove') && request.decisionKey.includes('quang-nam:none'),
        value: [asTokenId('vc-qn-g')],
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    assert.equal(
      countTokens(final, 'available-VC:none', (token) => token.props.faction === 'VC'),
      2,
      'Exactly one VC piece per selected province should be removed to Available',
    );
    assert.equal(
      countTokens(final, 'quang-tri-thua-thien:none', (token) => token.props.faction === 'VC'),
      0,
      'Selected province with one VC piece should lose that VC piece',
    );
    assert.equal(
      countTokens(final, 'quang-nam:none', (token) => token.props.faction === 'VC'),
      0,
      'Second selected province with one VC piece should lose that VC piece',
    );
    assert.equal(
      countTokens(final, 'saigon:none', (token) => token.props.faction === 'VC'),
      1,
      'Cities are not valid province targets and should remain unchanged',
    );
    assert.equal(final.markers['quang-tri-thua-thien:none']?.supportOpposition, 'activeOpposition');
    assert.equal(final.markers['quang-nam:none']?.supportOpposition, 'activeOpposition');
    assert.equal(final.markers['saigon:none']?.supportOpposition, 'neutral', 'City marker should remain unchanged');
  });

  it('resolves card-21 shaded edge cases when fewer than two eligible provinces exist', () => {
    const def = compileDef();
    const oneProvinceSetup = setupAmericalState(def, {
      zoneTokens: {
        'quang-tri-thua-thien:none': [
          makeToken('us-qt-only', 'troops', 'US'),
          makeGuerrilla('vc-qt-only', 'VC', 'active'),
        ],
      },
    });
    const oneProvinceMove = findAmericalMove(def, oneProvinceSetup, 'shaded');
    assert.notEqual(oneProvinceMove, undefined, 'Expected shaded Americal move');
    const oneProvinceOverrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince' || request.decisionKey.includes('targetProvince'),
        value: ['quang-tri-thua-thien:none'],
      },
      {
        when: (request) => request.name.includes('vcPieceToRemove'),
        value: [asTokenId('vc-qt-only')],
      },
    ];
    const oneProvinceFinal = applyMoveWithResolvedDecisionIds(def, oneProvinceSetup, oneProvinceMove!, { overrides: oneProvinceOverrides }).state;
    assert.equal(
      countTokens(oneProvinceFinal, 'available-VC:none', (token) => token.props.faction === 'VC'),
      1,
      'Single eligible province should still execute one-piece removal',
    );
    assert.equal(oneProvinceFinal.markers['quang-tri-thua-thien:none']?.supportOpposition, 'activeOpposition');

    const noProvinceSetup = setupAmericalState(def, {
      zoneTokens: {
        'hue:none': [makeToken('us-hue-none', 'troops', 'US')],
        'da-nang:none': [makeGuerrilla('vc-da-nang-none', 'VC', 'active')],
      },
    });
    const noProvinceMove = findAmericalMove(def, noProvinceSetup, 'shaded');
    assert.notEqual(noProvinceMove, undefined, 'Expected shaded Americal move even when no province satisfies both troop and VC criteria');
    const noProvinceFinal = applyMoveWithResolvedDecisionIds(def, noProvinceSetup, noProvinceMove!).state;
    assert.deepEqual(
      noProvinceFinal.zones,
      noProvinceSetup.zones,
      'Shaded Americal should be a no-op when no eligible province exists',
    );
    assert.deepEqual(
      noProvinceFinal.markers,
      noProvinceSetup.markers,
      'Markers should remain unchanged when shaded Americal has no legal province target',
    );
  });

  it('applies card-21 shaded piece-type constraints and province-priority selection rules', () => {
    const def = compileDef();

    const untunneledSetup = setupAmericalState(def, {
      zoneTokens: {
        'quang-tri-thua-thien:none': [
          makeToken('us-qt-u', 'troops', 'US'),
          makeVcBase('vc-base-u', 'untunneled'),
        ],
      },
    });
    const untunneledMove = findAmericalMove(def, untunneledSetup, 'shaded');
    assert.notEqual(untunneledMove, undefined, 'Expected shaded Americal move for untunneled-base test');
    const untunneledOverrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince' || request.decisionKey.includes('targetProvince'),
        value: ['quang-tri-thua-thien:none'],
      },
    ];
    const untunneledFinal = applyMoveWithResolvedDecisionIds(def, untunneledSetup, untunneledMove!, { overrides: untunneledOverrides }).state;
    assert.equal(
      countTokens(untunneledFinal, 'available-VC:none', (token) => token.id === asTokenId('vc-base-u')),
      1,
      'Untunneled VC base should be removable as a VC piece',
    );
    assert.equal(untunneledFinal.markers['quang-tri-thua-thien:none']?.supportOpposition, 'activeOpposition');

    const tunneledOnlySetup = setupAmericalState(def, {
      zoneTokens: {
        'quang-tri-thua-thien:none': [
          makeToken('us-qt-t', 'troops', 'US'),
          makeVcBase('vc-base-t', 'tunneled'),
        ],
      },
    });
    const tunneledOnlyMove = findAmericalMove(def, tunneledOnlySetup, 'shaded');
    assert.notEqual(tunneledOnlyMove, undefined, 'Expected shaded Americal move for tunneled-base test');
    const tunneledOnlyFinal = applyMoveWithResolvedDecisionIds(def, tunneledOnlySetup, tunneledOnlyMove!).state;
    assert.deepEqual(
      tunneledOnlyFinal.zones,
      tunneledOnlySetup.zones,
      'Tunneled VC base should not count as removable VC piece',
    );

    const prioritySetup = setupAmericalState(def, {
      zoneTokens: {
        'quang-tri-thua-thien:none': [
          makeToken('us-pri-qt', 'troops', 'US'),
          makeGuerrilla('vc-pri-qt', 'VC', 'active'),
        ],
        'quang-nam:none': [
          makeToken('us-pri-qn', 'troops', 'US'),
          makeGuerrilla('vc-pri-qn', 'VC', 'active'),
        ],
      },
      activePlayer: 1,
    });
    const priorityMarkers = {
      ...prioritySetup.markers,
      'quang-tri-thua-thien:none': {
        ...prioritySetup.markers['quang-tri-thua-thien:none'],
        supportOpposition: 'activeOpposition',
      },
      'quang-nam:none': {
        ...prioritySetup.markers['quang-nam:none'],
        supportOpposition: 'neutral',
      },
    } as GameState['markers'];
    const priorityState: GameState = { ...prioritySetup, markers: priorityMarkers };
    const priorityMove = findAmericalMove(def, priorityState, 'shaded');
    assert.notEqual(priorityMove, undefined, 'Expected shaded Americal move for priority test');

    const illegalPriorityOverride: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$targetProvince' || request.decisionKey.includes('targetProvince'),
        value: ['quang-tri-thua-thien:none'],
      },
    ];
    assert.throws(
      () => applyMoveWithResolvedDecisionIds(def, priorityState, priorityMove!, { overrides: illegalPriorityOverride }),
      /outside options domain|selection cardinality mismatch/i,
      'When a changeable province exists, already-Active Opposition provinces must not be selectable first',
    );
  });

  it('encodes card-12 (Capt Buck Adams) with outside-South insurgent flipping and constrained NVA base placement', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-12');
    assert.notEqual(card, undefined);
    assert.equal(card?.metadata?.flavorText, 'Strategic reconnaissance.');
    assert.equal(card?.unshaded?.text, 'Outside the South, flip all Insurgents Active and remove 1 NVA Base.');
    assert.equal(
      card?.shaded?.text,
      'SR-71 pilot must outrun SA-2s. Place 1 NVA Base at NVA Control outside the South and flip any 3 NVA Guerrillas Underground.',
    );

    const unshadedEffects = card?.unshaded?.effects ?? [];
    assert.equal(unshadedEffects.length, 3, 'card-12 unshaded should include flip, choose base, remove selected base');
    assert.notEqual((unshadedEffects[0] as { forEach?: unknown }).forEach, undefined);
    assert.notEqual((unshadedEffects[1] as { chooseN?: unknown }).chooseN, undefined);
    assert.notEqual((unshadedEffects[2] as { forEach?: unknown }).forEach, undefined);

    const shadedEffects = card?.shaded?.effects ?? [];
    assert.equal(shadedEffects.length, 4, 'card-12 shaded should include base select/place + guerrilla select/flip');
    assert.notEqual((shadedEffects[0] as { chooseN?: unknown }).chooseN, undefined);
    assert.notEqual((shadedEffects[1] as { if?: unknown }).if, undefined);
    assert.notEqual((shadedEffects[2] as { chooseN?: unknown }).chooseN, undefined);
    assert.notEqual((shadedEffects[3] as { forEach?: unknown }).forEach, undefined);
  });

  it('applies card-12 unshaded by flipping only outside-South insurgents and removing exactly one selected outside-South NVA base', () => {
    const def = compileDef();
    const setup = setupBuckAdamsState(def, {
      zoneTokens: {
        'north-vietnam:none': [
          makeGuerrilla('nva-g-nv', 'NVA', 'active'),
          makeGuerrilla('vc-g-nv', 'VC', 'active'),
          makeToken('nva-b-nv', 'base', 'NVA'),
        ],
        'central-laos:none': [
          makeGuerrilla('nva-g-laos', 'NVA', 'active'),
          makeToken('nva-b-laos', 'base', 'NVA'),
        ],
        'quang-nam:none': [
          makeGuerrilla('vc-g-south', 'VC', 'active'),
          makeToken('nva-b-south', 'base', 'NVA'),
        ],
      },
    });
    const move = findBuckAdamsMove(def, setup, 'unshaded');
    assert.notEqual(move, undefined, 'Expected unshaded Capt Buck Adams event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$nvaBaseToRemove' || request.decisionKey.includes('nvaBaseToRemove'),
        value: [asTokenId('nva-b-laos')],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const northVietnamTokens = final.zones['north-vietnam:none'] ?? [];
    const centralLaosTokens = final.zones['central-laos:none'] ?? [];
    const quangNamTokens = final.zones['quang-nam:none'] ?? [];
    const availableNva = final.zones['available-NVA:none'] ?? [];

    const nvaNvGuerrilla = northVietnamTokens.find((token) => token.id === asTokenId('nva-g-nv'));
    const vcNvGuerrilla = northVietnamTokens.find((token) => token.id === asTokenId('vc-g-nv'));
    const nvaLaosGuerrilla = centralLaosTokens.find((token) => token.id === asTokenId('nva-g-laos'));
    const vcSouthGuerrilla = quangNamTokens.find((token) => token.id === asTokenId('vc-g-south'));

    assert.equal(nvaNvGuerrilla?.props.activity, 'underground');
    assert.equal(vcNvGuerrilla?.props.activity, 'underground');
    assert.equal(nvaLaosGuerrilla?.props.activity, 'underground');
    assert.equal(vcSouthGuerrilla?.props.activity, 'active', 'South Vietnam insurgents should not flip');

    assert.equal(
      centralLaosTokens.some((token) => token.id === asTokenId('nva-b-laos')),
      false,
      'Selected outside-South NVA base should be removed from map',
    );
    assert.equal(
      availableNva.some((token) => token.id === asTokenId('nva-b-laos')),
      true,
      'Selected outside-South NVA base should move to available',
    );
    assert.equal(
      quangNamTokens.some((token) => token.id === asTokenId('nva-b-south')),
      true,
      'South Vietnam NVA bases must not be eligible for unshaded removal',
    );
  });

  it('applies card-12 shaded with NVA-control outside-South base placement constraints and flips up to 3 active NVA guerrillas', () => {
    const def = compileDef();
    const setup = setupBuckAdamsState(def, {
      zoneTokens: {
        'available-NVA:none': [makeToken('nva-b-av-1', 'base', 'NVA')],
        'central-laos:none': [
          makeToken('nva-t-laos', 'troops', 'NVA'),
          makeToken('nva-b-laos-existing', 'base', 'NVA'),
        ],
        'north-vietnam:none': [
          makeToken('nva-b-nv-1', 'base', 'NVA'),
          makeToken('nva-b-nv-2', 'base', 'NVA'),
          makeToken('nva-t-nv', 'troops', 'NVA'),
        ],
        'northeast-cambodia:none': [
          makeToken('nva-t-cam', 'troops', 'NVA'),
          makeToken('us-t-cam', 'troops', 'US'),
          makeToken('vc-g-cam', 'guerrilla', 'VC'),
        ],
        'quang-nam:none': [
          makeToken('nva-t-south', 'troops', 'NVA'),
          makeToken('us-t-south', 'troops', 'US'),
        ],
        'hue:none': [
          makeGuerrilla('nva-g-1', 'NVA', 'active'),
          makeGuerrilla('nva-g-2', 'NVA', 'active'),
        ],
        'da-nang:none': [
          makeGuerrilla('nva-g-3', 'NVA', 'active'),
          makeGuerrilla('nva-g-4', 'NVA', 'active'),
        ],
      },
    });
    const move = findBuckAdamsMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded Capt Buck Adams event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$nvaBaseFromAvailable' || request.decisionKey.includes('nvaBaseFromAvailable'),
        value: [asTokenId('nva-b-av-1')],
      },
      {
        when: (request) => request.name === '$nvaBaseDestination' || request.decisionKey.includes('nvaBaseDestination'),
        value: 'central-laos:none',
      },
      {
        when: (request) => request.name === '$nvaGuerrillasToHide' || request.decisionKey.includes('nvaGuerrillasToHide'),
        value: [asTokenId('nva-g-1'), asTokenId('nva-g-2'), asTokenId('nva-g-3')],
      },
    ];

    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;
    const centralLaosTokens = final.zones['central-laos:none'] ?? [];
    const northVietnamTokens = final.zones['north-vietnam:none'] ?? [];
    const availableNvaTokens = final.zones['available-NVA:none'] ?? [];
    const hueTokens = final.zones['hue:none'] ?? [];
    const daNangTokens = final.zones['da-nang:none'] ?? [];

    assert.equal(
      centralLaosTokens.some((token) => token.id === asTokenId('nva-b-av-1')),
      true,
      'Base should be placed into selected eligible outside-South NVA-control province',
    );
    assert.equal(
      availableNvaTokens.some((token) => token.id === asTokenId('nva-b-av-1')),
      false,
      'Placed base should leave available',
    );
    assert.equal(
      northVietnamTokens.filter((token) => token.type === 'base').length,
      2,
      'North Vietnam remains at base cap and should not be used as destination',
    );

    const nvaG1 = hueTokens.find((token) => token.id === asTokenId('nva-g-1'));
    const nvaG2 = hueTokens.find((token) => token.id === asTokenId('nva-g-2'));
    const nvaG3 = daNangTokens.find((token) => token.id === asTokenId('nva-g-3'));
    const nvaG4 = daNangTokens.find((token) => token.id === asTokenId('nva-g-4'));
    assert.equal(nvaG1?.props.activity, 'underground');
    assert.equal(nvaG2?.props.activity, 'underground');
    assert.equal(nvaG3?.props.activity, 'underground');
    assert.equal(nvaG4?.props.activity, 'active', 'Unselected active guerrilla should stay active');
  });

  it('resolves card-12 shaded edge cases: no base placement opportunity and fewer than 3 active NVA guerrillas', () => {
    const def = compileDef();
    const setup = setupBuckAdamsState(def, {
      zoneTokens: {
        'available-NVA:none': [],
        'hue:none': [
          makeGuerrilla('nva-g-edge-1', 'NVA', 'active'),
          makeGuerrilla('nva-g-edge-2', 'NVA', 'active'),
        ],
      },
    });
    const move = findBuckAdamsMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded Capt Buck Adams event move even without available base');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$nvaGuerrillasToHide' || request.decisionKey.includes('nvaGuerrillasToHide'),
        value: [asTokenId('nva-g-edge-1'), asTokenId('nva-g-edge-2')],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const hueTokens = final.zones['hue:none'] ?? [];
    const availableNvaTokens = final.zones['available-NVA:none'] ?? [];
    const g1 = hueTokens.find((token) => token.id === asTokenId('nva-g-edge-1'));
    const g2 = hueTokens.find((token) => token.id === asTokenId('nva-g-edge-2'));

    assert.equal(g1?.props.activity, 'underground');
    assert.equal(g2?.props.activity, 'underground');
    assert.equal(availableNvaTokens.length, 0, 'No base should be created or moved when none is available');
  });

  it('resolves card-12 shaded when an available NVA base exists but no legal destination satisfies control-plus-cap constraints', () => {
    const def = compileDef();
    const setup = setupBuckAdamsState(def, {
      zoneTokens: {
        'available-NVA:none': [makeToken('nva-b-edge', 'base', 'NVA')],
        'north-vietnam:none': [
          makeToken('nva-b-nv-edge-1', 'base', 'NVA'),
          makeToken('nva-b-nv-edge-2', 'base', 'NVA'),
          makeToken('nva-t-nv-edge', 'troops', 'NVA'),
        ],
        'central-laos:none': [
          makeToken('nva-t-laos-edge', 'troops', 'NVA'),
          makeToken('us-t-laos-edge', 'troops', 'US'),
        ],
        'hue:none': [
          makeGuerrilla('nva-g-edge-a', 'NVA', 'active'),
          makeGuerrilla('nva-g-edge-b', 'NVA', 'active'),
        ],
      },
    });
    const move = findBuckAdamsMove(def, setup, 'shaded');
    assert.notEqual(move, undefined, 'Expected shaded Capt Buck Adams event move');

    const overrides: DecisionOverrideRule[] = [
      {
        when: (request) => request.name === '$nvaGuerrillasToHide' || request.decisionKey.includes('nvaGuerrillasToHide'),
        value: [asTokenId('nva-g-edge-a'), asTokenId('nva-g-edge-b')],
      },
    ];
    const final = applyMoveWithResolvedDecisionIds(def, setup, move!, { overrides }).state;

    const availableNvaTokens = final.zones['available-NVA:none'] ?? [];
    const northVietnamTokens = final.zones['north-vietnam:none'] ?? [];
    const centralLaosTokens = final.zones['central-laos:none'] ?? [];
    const hueTokens = final.zones['hue:none'] ?? [];

    assert.equal(
      availableNvaTokens.some((token) => token.id === asTokenId('nva-b-edge')),
      true,
      'Base should remain available when no legal destination exists',
    );
    assert.equal(
      northVietnamTokens.filter((token) => token.type === 'base').length,
      2,
      'North Vietnam stays capped at 2 bases',
    );
    assert.equal(
      centralLaosTokens.filter((token) => token.type === 'base').length,
      0,
      'No base should be placed into non-NVA-controlled Laos space',
    );
    assert.equal(hueTokens.find((token) => token.id === asTokenId('nva-g-edge-a'))?.props.activity, 'underground');
    assert.equal(hueTokens.find((token) => token.id === asTokenId('nva-g-edge-b'))?.props.activity, 'underground');
  });

  it('keeps card 27 (Phoenix Program) rules-accurate as a non-regression anchor', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-27');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Phoenix Program');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['US', 'VC', 'ARVN', 'NVA']);
    assert.equal(
      card?.unshaded?.text,
      'Remove any 3 VC pieces total from any COIN Control spaces.',
    );
    assert.equal(
      card?.shaded?.text,
      'Add a Terror marker to any 2 spaces outside Saigon with COIN Control and VC. Set them to Active Opposition.',
    );
    assert.equal(card?.unshaded?.targets, undefined);
    assert.notEqual(card?.shaded?.targets, undefined, 'Shaded Phoenix should use canonical targets');
    assert.equal(card?.shaded?.targets?.[0]?.id, '$targetSpace');
    assert.equal(card?.shaded?.targets?.[0]?.application, 'each');
  });
});
