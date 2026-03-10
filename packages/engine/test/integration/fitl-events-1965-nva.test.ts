import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

const expectedCards = [
  { id: 'card-34', order: 34, title: 'SA-2s', sideMode: 'dual', seatOrder: ['NVA', 'US', 'ARVN', 'VC'] },
  { id: 'card-38', order: 38, title: 'McNamara Line', sideMode: 'single', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-39', order: 39, title: 'Oriskany', sideMode: 'dual', seatOrder: ['NVA', 'US', 'VC', 'ARVN'] },
  { id: 'card-44', order: 44, title: 'Ia Drang', sideMode: 'dual', seatOrder: ['NVA', 'ARVN', 'US', 'VC'] },
  { id: 'card-46', order: 46, title: '559th Transport Grp', sideMode: 'dual', seatOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-47', order: 47, title: 'Chu Luc', sideMode: 'dual', seatOrder: ['NVA', 'ARVN', 'VC', 'US'] },
  { id: 'card-53', order: 53, title: 'Sappers', sideMode: 'dual', seatOrder: ['NVA', 'VC', 'US', 'ARVN'] },
  { id: 'card-56', order: 56, title: 'Vo Nguyen Giap', sideMode: 'dual', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
  { id: 'card-59', order: 59, title: 'Plei Mei', sideMode: 'dual', seatOrder: ['NVA', 'VC', 'ARVN', 'US'] },
] as const;

describe('FITL 1965 NVA-first event-card production spec', () => {
  it('compiles all 9 NVA-first 1965 cards with side-mode and metadata invariants', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    for (const expected of expectedCards) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined, `Expected ${expected.id} to exist`);
      assert.equal(card?.title, expected.title);
      assert.equal(card?.order, expected.order);
      assert.equal(card?.sideMode, expected.sideMode);
      assert.equal(card?.metadata?.period, '1965');
      assert.deepEqual(card?.metadata?.seatOrder, expected.seatOrder);
      assert.equal(typeof card?.unshaded?.text, 'string', `${expected.id} must include unshaded text`);

      if (expected.sideMode === 'dual') {
        assert.equal(typeof card?.shaded?.text, 'string', `${expected.id} must include shaded text`);
      } else {
        assert.equal(card?.shaded, undefined, `${expected.id} single-side payload must not define shaded side`);
      }
    }
  });

  it('encodes card 34 (SA-2s) as capability marker toggles for cap_sa2s', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-34');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('capability'), true);
    assert.equal(card?.tags?.includes('NVA'), true);
    assert.equal(card?.unshaded?.text, 'When Air Strike Degrades Trail, US removes 1 NVA piece outside the South.');
    assert.equal(card?.shaded?.text, 'Rally Improves Trail 2 boxes not 1 (unshaded Wild Weasels remove).');
    assert.deepEqual(card?.unshaded?.effects, [{ setGlobalMarker: { marker: 'cap_sa2s', state: 'unshaded' } }]);
    assert.deepEqual(card?.shaded?.effects, [{ setGlobalMarker: { marker: 'cap_sa2s', state: 'shaded' } }]);
  });

  it('encodes momentum cards 38/39/46 as canonical round-lasting toggles', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedMomentum = [
      { id: 'card-38', side: 'unshaded', effectId: 'mom-mcnamara-line', varName: 'mom_mcnamaraLine' },
      { id: 'card-39', side: 'shaded', effectId: 'mom-oriskany', varName: 'mom_oriskany' },
      { id: 'card-46', side: 'unshaded', effectId: 'mom-559th-transport-grp', varName: 'mom_559thTransportGrp' },
    ] as const;

    for (const expected of expectedMomentum) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('momentum'), true, `${expected.id} must include momentum tag`);

      const side = expected.side === 'unshaded' ? card?.unshaded : card?.shaded;
      const effect = side?.lastingEffects?.find((entry) => entry.id === expected.effectId);
      assert.notEqual(effect, undefined, `${expected.id} ${expected.side} must include ${expected.effectId}`);
      assert.equal(effect?.duration, 'round');
      assert.deepEqual(effect?.setupEffects, [{ setVar: { scope: 'global', var: expected.varName, value: true } }]);
      assert.deepEqual(effect?.teardownEffects, [{ setVar: { scope: 'global', var: expected.varName, value: false } }]);
    }
  });

  it('encodes card 38 as immediate redeploy plus ARVN -12 before momentum lockouts', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-38');
    const parsedCard = parsed.doc.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-38');
    assert.notEqual(card, undefined);
    assert.notEqual(parsedCard, undefined);
    assert.equal(
      card?.unshaded?.text,
      'Redeploy all COIN forces outside Vietnam to COIN-Controlled Cities. ARVN Resources -12. No Infiltrate or Trail Improvement by Rally until Coup. MOMENTUM',
    );

    const arvnHit = findDeep(card?.unshaded?.effects, (node) =>
      node?.addVar?.scope === 'global' && node?.addVar?.var === 'arvnResources' && node?.addVar?.delta === -12,
    );
    assert.ok(arvnHit.length >= 1, 'Card-38 should include ARVN Resources -12 immediate effect');

    const outsideVietnamRefs = findDeep(parsedCard?.unshaded?.effects, (node) =>
      node?.conditionMacro === 'fitl-space-outside-vietnam-province',
    );
    assert.ok(outsideVietnamRefs.length >= 1, 'Card-38 should source redeploy pieces from Laos/Cambodia provinces only');

    const coinControlledCityRefs = findDeep(parsedCard?.unshaded?.effects, (node) =>
      node?.conditionMacro === 'fitl-space-coin-controlled-city',
    );
    assert.ok(coinControlledCityRefs.length >= 1, 'Card-38 should target only COIN-controlled cities');
  });

  it('encodes card 44 (Ia Drang) as chained US operation grants plus shaded die-roll troop losses', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-44');
    assert.notEqual(card, undefined);

    assert.deepEqual(card?.unshaded?.freeOperationGrants, [
      {
        seat: 'us',
        viabilityPolicy: 'requireUsableForEventPlay',
        sequence: { chain: 'ia-drang-us', step: 0 },
        completionPolicy: 'required',
        outcomePolicy: 'mustChangeGameplayState',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'operation',
        actionIds: ['airLift'],
        moveZoneBindings: ['$usLiftDestination', '$coinLiftDestination'],
        moveZoneProbeBindings: ['$spaces', '$usLiftDestination', '$coinLiftDestination'],
        sequenceContext: {
          captureMoveZoneCandidatesAs: 'ia-drang-space',
        },
        zoneFilter: {
          op: '>',
              left: {
                aggregate: {
                  op: 'count',
                      query: { query: 'tokensInZone', zone: '$zone', filter: { prop: 'faction', op: 'eq', value: 'NVA' } },
                },
              },
          right: 0,
        },
      },
      {
        seat: 'us',
        sequence: { chain: 'ia-drang-us', step: 1 },
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'operation',
        actionIds: ['sweep'],
        moveZoneBindings: ['$targetSpaces'],
        allowDuringMonsoon: true,
        sequenceContext: {
          requireMoveZoneCandidatesFrom: 'ia-drang-space',
        },
      },
      {
        seat: 'us',
        sequence: { chain: 'ia-drang-us', step: 2 },
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'operation',
        actionIds: ['assault'],
        moveZoneBindings: ['$targetSpaces'],
        sequenceContext: {
          requireMoveZoneCandidatesFrom: 'ia-drang-space',
        },
      },
    ]);

    assert.equal((card?.shaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 1);
    assert.equal(typeof (card?.shaded?.targets?.[0]?.effects?.[0] as { rollRandom?: unknown })?.rollRandom, 'object');
  });

  it('encodes card 47 (Chu Luc) as ARVN doubling plus targeted NVA-only assault and shaded North Vietnam border placement', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-47');
    const parsedCard = parsed.doc.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-47');
    assert.notEqual(card, undefined);
    assert.notEqual(parsedCard, undefined);
    assert.equal(card?.unshaded?.text, 'Add ARVN Troops to double the ARVN pieces in a space with NVA. All ARVN free Assault NVA.');
    assert.equal(card?.shaded?.text, 'Place up to 10 NVA Troops anywhere within 1 space of North Vietnam.');
    assert.equal(typeof (card?.unshaded?.effects?.[0] as { if?: unknown } | undefined)?.if, 'object');
    assert.equal(typeof (card?.unshaded?.effects?.[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.equal(card?.unshaded?.freeOperationGrants, undefined, 'Card 47 should resolve via event effects, not grant issuance');
    const serializedCompiledUnshaded = JSON.stringify(card?.unshaded?.effects ?? []);
    const serializedParsedUnshaded = JSON.stringify(parsedCard?.unshaded?.effects ?? []);
    assert.match(serializedCompiledUnshaded, /coin-assault-removal-order/, 'Card 47 should call the shared assault helper');
    assert.doesNotMatch(serializedCompiledUnshaded, /coin-assault-removal-order-single-faction/, 'Card 47 should not reference the removed bespoke helper');
    assert.match(serializedParsedUnshaded, /targetFactions/, 'Card 47 should encode its targeted assault via targetFactions');
    assert.doesNotMatch(serializedParsedUnshaded, /targetFactionMode/, 'Card 47 should not retain the legacy targetFactionMode alias');
    assert.equal((card?.shaded?.effects?.[0] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$nvaTroopsToPlace');
    assert.equal(typeof (card?.shaded?.effects?.[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
  });

  it('encodes card 53 (Sappers) with South Vietnam troop-removal targeting, remain-eligible, and province-only base removal routing', () => {
    const { parsed, compiled } = compileProductionSpec();

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-53');
    assert.notEqual(card, undefined);

    assert.equal(card?.unshaded?.text, 'Remove 2 NVA Troops each from up to 3 spaces in South Vietnam. Remain Eligible.');
    assert.equal(card?.shaded?.text, 'Remove up to 1 US and 2 ARVN Bases from any Provinces (US to Casualties).');
    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);
    assert.equal((card?.unshaded?.targets?.[0]?.cardinality as { max?: number } | undefined)?.max, 3);
    assert.equal(card?.unshaded?.targets?.[0]?.application, 'each');
    assert.equal(
      (card?.unshaded?.targets?.[0]?.effects?.[0] as { removeByPriority?: { budget?: unknown } } | undefined)?.removeByPriority?.budget,
      2,
    );
    assert.equal((card?.shaded?.effects?.[0] as { chooseN?: { max?: unknown } } | undefined)?.chooseN?.max, 1);
    assert.equal((card?.shaded?.effects?.[1] as { chooseN?: { max?: unknown } } | undefined)?.chooseN?.max, 2);
  });
});
