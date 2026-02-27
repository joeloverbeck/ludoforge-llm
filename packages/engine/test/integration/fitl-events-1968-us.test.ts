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
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

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
  const { parsed, compiled } = compileProductionSpec();
  assertNoErrors(parsed);
  assert.notEqual(compiled.gameDef, null);
  return compiled.gameDef!;
};

const makeToken = (id: string, type: string, faction: string): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, type },
});

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
  const markersWithNeutralSupport = Object.fromEntries(
    Object.entries(baseState.markers).map(([zoneId, zoneMarkers]) => [
      zoneId,
      zoneMarkers.supportOpposition === undefined
        ? zoneMarkers
        : { ...zoneMarkers, supportOpposition: 'neutral' },
    ]),
  ) as GameState['markers'];

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
    markers: markersWithNeutralSupport,
    zones: {
      ...baseState.zones,
      [eventDeck!.discardZone]: [makeToken('card-3', 'card', 'none')],
      'available-US:none': [...availableUsTroops, ...availableUsBases],
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

describe('FITL 1968 US-first event-card production spec', () => {
  it('compiles all 12 US-first 1968 cards with dual side metadata invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

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
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedCapabilities = [
      { id: 'card-4', marker: 'cap_topGun' },
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
    }
  });

  it('encodes card 16 (Blowtorch Komer) as unshaded round momentum toggle', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-16');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('momentum'), true);

    const momentum = card?.unshaded?.lastingEffects?.find((effect) => effect.id === 'mom-blowtorch-komer');
    assert.notEqual(momentum, undefined);
    assert.equal(momentum?.duration, 'round');
    assert.deepEqual(momentum?.setupEffects, [{ setVar: { scope: 'global', var: 'mom_blowtorchKomer', value: true } }]);
    assert.deepEqual(momentum?.teardownEffects, [{ setVar: { scope: 'global', var: 'mom_blowtorchKomer', value: false } }]);
  });

  it('encodes card 3 (Peace Talks) with Linebacker eligibility state wiring and shaded trail floor', () => {
    const { parsed, compiled } = compileProductionSpec();

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

  it('encodes card 2 (Kissinger) with rollRandom unshaded and three-part shaded effects', () => {
    const { parsed, compiled } = compileProductionSpec();

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

    // Unshaded: single top-level rollRandom
    const unshadedEffects = card?.unshaded?.effects ?? [];
    assert.equal(unshadedEffects.length, 1, 'unshaded must have exactly 1 top-level effect');
    const rollRandom = (unshadedEffects[0] as { rollRandom?: { bind?: string; min?: number; max?: number; in?: unknown[] } }).rollRandom;
    assert.notEqual(rollRandom, undefined, 'top-level effect must be rollRandom');
    assert.equal(rollRandom?.bind, '$dieRoll');
    assert.equal(rollRandom?.min, 1);
    assert.equal(rollRandom?.max, 6);
    assert.equal(rollRandom?.in?.length, 2, 'rollRandom.in must contain chooseN + forEach');

    const chooseNUnshaded = (rollRandom?.in?.[0] as { chooseN?: { bind?: string; options?: { query?: string }; max?: { ref?: string; name?: string } } }).chooseN;
    assert.notEqual(chooseNUnshaded, undefined, 'first inner effect must be chooseN');
    assert.equal(chooseNUnshaded?.bind, '$insurgentPieces');
    assert.equal(chooseNUnshaded?.options?.query, 'concat');
    const unshadedSources = (chooseNUnshaded?.options as { sources?: Array<{ filter?: Array<{ prop?: string; op?: string; value?: string | string[] }> }> })?.sources;
    assert.equal(unshadedSources?.length, 2, 'unshaded insurgent concat must have 2 sources');

    const mixedTypeSource = unshadedSources?.find((source) =>
      source.filter?.some((predicate) => predicate.prop === 'type' && predicate.op === 'in'),
    );
    assert.notEqual(mixedTypeSource, undefined, 'unshaded must include mixed type source for troops + guerrilla');
    assert.equal(
      mixedTypeSource?.filter?.some(
        (predicate) =>
          predicate.prop === 'type' &&
          predicate.op === 'in' &&
          Array.isArray(predicate.value) &&
          predicate.value.includes('troops') &&
          predicate.value.includes('guerrilla'),
      ),
      true,
      'mixed type source must include troops and guerrilla',
    );

    const baseSource = unshadedSources?.find((source) =>
      source.filter?.some((predicate) => predicate.prop === 'type' && predicate.op === 'eq' && predicate.value === 'base'),
    );
    assert.notEqual(baseSource, undefined, 'unshaded must include dedicated base source');
    assert.equal(
      baseSource?.filter?.some((predicate) => predicate.prop === 'tunnel' && predicate.op === 'eq' && predicate.value === 'untunneled'),
      true,
      'base source must preserve untunneled tunnel filter',
    );
    assert.equal(chooseNUnshaded?.max?.ref, 'binding');
    assert.equal(chooseNUnshaded?.max?.name, '$dieRoll');

    const forEachUnshaded = (rollRandom?.in?.[1] as { forEach?: { bind?: string } }).forEach;
    assert.notEqual(forEachUnshaded, undefined, 'second inner effect must be forEach');
    assert.equal(forEachUnshaded?.bind, '$piece');

    // Shaded: 5 effects total (chooseN, forEach, chooseN, forEach, addVar)
    const shadedEffects = card?.shaded?.effects ?? [];
    assert.equal(shadedEffects.length, 5, 'shaded must have exactly 5 top-level effects');

    // Effect 1: chooseN for NVA pieces
    const nvaChooseN = (shadedEffects[0] as { chooseN?: { bind?: string; options?: { query?: string; zone?: string }; max?: number } }).chooseN;
    assert.notEqual(nvaChooseN, undefined, 'shaded effect 0 must be chooseN');
    assert.equal(nvaChooseN?.bind, '$nvaPieces');
    assert.equal(nvaChooseN?.options?.query, 'tokensInZone');
    assert.equal(nvaChooseN?.options?.zone, 'available-NVA:none');
    assert.equal(nvaChooseN?.max, 2);

    // Effect 2: forEach placing NVA pieces
    const nvaForEach = (shadedEffects[1] as { forEach?: { bind?: string } }).forEach;
    assert.notEqual(nvaForEach, undefined, 'shaded effect 1 must be forEach');
    assert.equal(nvaForEach?.bind, '$nvaPiece');

    // Effect 3: chooseN for US troops (concat of 3 sources)
    const usChooseN = (shadedEffects[2] as { chooseN?: { bind?: string; options?: { query?: string; sources?: unknown[] }; max?: number } }).chooseN;
    assert.notEqual(usChooseN, undefined, 'shaded effect 2 must be chooseN');
    assert.equal(usChooseN?.bind, '$usTroops');
    assert.equal(usChooseN?.options?.query, 'concat');
    assert.equal(usChooseN?.options?.sources?.length, 3, 'US troops concat must have 3 sources');
    assert.equal(usChooseN?.max, 2);

    // Effect 4: forEach moving US troops
    const usForEach = (shadedEffects[3] as { forEach?: { bind?: string } }).forEach;
    assert.notEqual(usForEach, undefined, 'shaded effect 3 must be forEach');
    assert.equal(usForEach?.bind, '$usTroop');

    // Effect 5: addVar for Aid -6
    assert.deepEqual(shadedEffects[4], { addVar: { scope: 'global', var: 'aid', delta: -6 } });
  });

  it('keeps card 27 (Phoenix Program) unchanged as a non-regression anchor', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-27');
    assert.notEqual(card, undefined);
    assert.equal(card?.title, 'Phoenix Program');
    assert.equal(card?.sideMode, 'dual');
    assert.equal(card?.metadata?.period, '1968');
    assert.deepEqual(card?.metadata?.seatOrder, ['US', 'VC', 'ARVN', 'NVA']);
    assert.deepEqual(card?.unshaded?.effects, [{ addVar: { scope: 'global', var: 'aid', delta: -1 } }]);
    assert.deepEqual(card?.shaded?.effects, [
      { addVar: { scope: 'global', var: 'aid', delta: -2 } },
      { addVar: { scope: 'global', var: 'arvnResources', delta: -1 } },
    ]);
  });
});
