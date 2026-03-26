import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { getFitlProductionFixture } from '../helpers/production-spec-helpers.js';
import { tagEffectAsts } from '../../src/kernel/tag-effect-asts.js';

const FITL_PRODUCTION_FIXTURE = getFitlProductionFixture();
const ROKS_SWEEP_ZONE_FILTER = {
  op: 'in',
  item: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'id' },
  set: { _t: 1, scalarArray: [
    'qui-nhon:none',
    'binh-dinh:none',
    'kontum:none',
    'pleiku-darlac:none',
    'phu-bon-phu-yen:none',
    'khanh-hoa:none',
    'cam-ranh:none',
  ] },
} as const;
const ROKS_ASSAULT_ZONE_FILTER = {
  op: 'in',
  item: { _t: 2, ref: 'zoneProp', zone: '$zone', prop: 'id' },
  set: { _t: 1, scalarArray: [
    'qui-nhon:none',
    'binh-dinh:none',
    'kontum:none',
    'pleiku-darlac:none',
    'phu-bon-phu-yen:none',
    'khanh-hoa:none',
    'cam-ranh:none',
    'loc-da-nang-qui-nhon:none',
    'loc-kontum-qui-nhon:none',
    'loc-qui-nhon-cam-ranh:none',
  ] },
} as const;
const ROKS_TOKEN_INTERPRETATIONS = [
  {
    when: {
      op: 'and',
      args: [
        { prop: 'faction', op: 'eq', value: 'ARVN' },
        { prop: 'type', op: 'in', value: ['troops', 'police'] },
      ],
    },
    assign: {
      faction: 'US',
      type: 'troops',
    },
  },
] as const;

const expectedCards = [
  { id: 'card-64', order: 64, title: 'Honolulu Conference', sideMode: 'single', seatOrder: ['ARVN', 'US', 'NVA', 'VC'] },
  { id: 'card-67', order: 67, title: 'Amphib Landing', sideMode: 'dual', seatOrder: ['ARVN', 'US', 'VC', 'NVA'] },
  { id: 'card-69', order: 69, title: 'MACV', sideMode: 'single', seatOrder: ['ARVN', 'US', 'VC', 'NVA'] },
  { id: 'card-70', order: 70, title: 'ROKs', sideMode: 'dual', seatOrder: ['ARVN', 'US', 'VC', 'NVA'] },
  { id: 'card-72', order: 72, title: 'Body Count', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'US', 'VC'] },
  { id: 'card-73', order: 73, title: 'Great Society', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'US', 'VC'] },
  { id: 'card-76', order: 76, title: 'Annam', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'VC', 'US'] },
  { id: 'card-78', order: 78, title: 'General Lansdale', sideMode: 'dual', seatOrder: ['ARVN', 'NVA', 'VC', 'US'] },
  { id: 'card-81', order: 81, title: 'CIDG', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'US', 'NVA'] },
  { id: 'card-83', order: 83, title: 'Election', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'US', 'NVA'] },
  { id: 'card-85', order: 85, title: 'USAID', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'US', 'NVA'] },
  { id: 'card-86', order: 86, title: 'Mandate of Heaven', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
  { id: 'card-87', order: 87, title: 'Nguyen Chanh Thi', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
  { id: 'card-89', order: 89, title: 'Tam Chau', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
  { id: 'card-90', order: 90, title: 'Walt Rostow', sideMode: 'dual', seatOrder: ['ARVN', 'VC', 'NVA', 'US'] },
] as const;

describe('FITL 1965 ARVN-first event-card production spec', () => {
  it('compiles all 15 ARVN-first 1965 cards with side-mode and metadata invariants', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

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

  it('encodes card 86 (Mandate of Heaven) as ARVN capability marker toggles', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-86');
    assert.notEqual(card, undefined);
    assert.equal(card?.tags?.includes('capability'), true);
    assert.equal(card?.tags?.includes('ARVN'), true);
    assert.equal(card?.unshaded?.text, '1 Govern space may transfer Aid to Patronage without shifting Support. ARVN CAPABILITY.');
    assert.equal(card?.shaded?.text, 'ARVN Govern and Pacify maximum 1 space.');
    assert.deepEqual(card?.unshaded?.effects, tagEffectAsts([{ setGlobalMarker: { marker: 'cap_mandateOfHeaven', state: 'unshaded' } }]));
    assert.deepEqual(card?.shaded?.effects, tagEffectAsts([{ setGlobalMarker: { marker: 'cap_mandateOfHeaven', state: 'shaded' } }]));
  });

  it('encodes card 70 (ROKs) as dual US-or-ARVN mixed-cube as-if-US grants plus shaded opposition shifts', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-70');
    assert.notEqual(card, undefined);

    assert.equal(
      card?.unshaded?.text,
      'US or ARVN free Sweep into/in then free Assault Phu Bon and adjacent spaces as if US and as if all ARVN cubes are US Troops.',
    );
    assert.equal(
      card?.shaded?.text,
      'Shift Qui Nhon, Phu Bon, and Khanh Hoa each 1 level toward Active Opposition.',
    );
    assert.deepEqual(card?.unshaded?.branches?.map((branch) => branch.id), ['roks-execute-as-us', 'roks-execute-as-arvn']);
    assert.equal(card?.unshaded?.lastingEffects, undefined);
    assert.equal(card?.unshaded?.effects, undefined);

    const usBranch = card?.unshaded?.branches?.find((branch) => branch.id === 'roks-execute-as-us');
    const arvnBranch = card?.unshaded?.branches?.find((branch) => branch.id === 'roks-execute-as-arvn');

    assert.deepEqual(usBranch?.freeOperationGrants, [
      {
        seat: 'us',
        executeAsSeat: 'us',
        viabilityPolicy: 'requireUsableForEventPlay',
        sequence: { batch: 'roks-us-or-arvn-as-us', step: 0 },
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'operation',
        actionIds: ['sweep'],
        zoneFilter: ROKS_SWEEP_ZONE_FILTER,
        tokenInterpretations: ROKS_TOKEN_INTERPRETATIONS,
        allowDuringMonsoon: true,
      },
      {
        seat: 'us',
        executeAsSeat: 'us',
        sequence: { batch: 'roks-us-or-arvn-as-us', step: 1 },
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'operation',
        actionIds: ['assault'],
        zoneFilter: ROKS_ASSAULT_ZONE_FILTER,
        tokenInterpretations: ROKS_TOKEN_INTERPRETATIONS,
      },
    ]);
    assert.deepEqual(arvnBranch?.freeOperationGrants, [
      {
        seat: 'arvn',
        executeAsSeat: 'us',
        viabilityPolicy: 'requireUsableForEventPlay',
        sequence: { batch: 'roks-us-or-arvn-as-us', step: 0 },
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'operation',
        actionIds: ['sweep'],
        zoneFilter: ROKS_SWEEP_ZONE_FILTER,
        tokenInterpretations: ROKS_TOKEN_INTERPRETATIONS,
        allowDuringMonsoon: true,
      },
      {
        seat: 'arvn',
        executeAsSeat: 'us',
        sequence: { batch: 'roks-us-or-arvn-as-us', step: 1 },
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'operation',
        actionIds: ['assault'],
        zoneFilter: ROKS_ASSAULT_ZONE_FILTER,
        tokenInterpretations: ROKS_TOKEN_INTERPRETATIONS,
      },
    ]);
    assert.deepEqual(card?.shaded?.effects, tagEffectAsts([
      { shiftMarker: { space: 'qui-nhon:none', marker: 'supportOpposition', delta: -1 } },
      { shiftMarker: { space: 'phu-bon-phu-yen:none', marker: 'supportOpposition', delta: -1 } },
      { shiftMarker: { space: 'khanh-hoa:none', marker: 'supportOpposition', delta: -1 } },
    ]));
  });

  it('encodes card 69 (MACV) as a stay-eligible paired special-activity branch choice', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-69');
    assert.notEqual(card, undefined);
    assert.equal(
      card?.unshaded?.text,
      'Either US then ARVN or NVA then VC each executes any 1 free Special Activity. Faction executing Event stays Eligible.',
    );
    assert.deepEqual(card?.unshaded?.eligibilityOverrides, [
      { target: { kind: 'active' }, eligible: true, windowId: 'remain-eligible' },
    ]);
    assert.deepEqual(
      [...(card?.unshaded?.branches?.map((branch) => branch.id) ?? [])].sort(),
      ['macv-nva-then-vc', 'macv-us-then-arvn'],
    );
    const usThenArvn = card?.unshaded?.branches?.find((branch) => branch.id === 'macv-us-then-arvn');
    const nvaThenVc = card?.unshaded?.branches?.find((branch) => branch.id === 'macv-nva-then-vc');
    assert.deepEqual(usThenArvn?.freeOperationGrants, [
      {
        seat: 'us',
        sequence: { batch: 'macv-us-then-arvn', step: 0, progressionPolicy: 'implementWhatCanInOrder' },
        actionIds: ['advise', 'airLift', 'airStrike'],
        viabilityPolicy: 'requireUsableAtIssue',
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'specialActivity',
      },
      {
        seat: 'arvn',
        sequence: { batch: 'macv-us-then-arvn', step: 1, progressionPolicy: 'implementWhatCanInOrder' },
        actionIds: ['govern', 'transport', 'raid'],
        viabilityPolicy: 'requireUsableAtIssue',
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'specialActivity',
      },
    ]);
    assert.deepEqual(nvaThenVc?.freeOperationGrants, [
      {
        seat: 'nva',
        sequence: { batch: 'macv-nva-then-vc', step: 0, progressionPolicy: 'implementWhatCanInOrder' },
        actionIds: ['infiltrate', 'bombard', 'ambushNva'],
        viabilityPolicy: 'requireUsableAtIssue',
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'specialActivity',
      },
      {
        seat: 'vc',
        sequence: { batch: 'macv-nva-then-vc', step: 1, progressionPolicy: 'implementWhatCanInOrder' },
        actionIds: ['tax', 'subvert', 'ambushVc'],
        viabilityPolicy: 'requireUsableAtIssue',
        completionPolicy: 'required',
        postResolutionTurnFlow: 'resumeCardFlow',
        operationClass: 'specialActivity',
      },
    ]);
  });

  it('encodes card 76 (Annam) with shared-space resource loss and supported adjacent-province targeting', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-76');
    assert.notEqual(card, undefined);
    assert.equal(card?.unshaded?.text, 'NVA and VC -1 Resource each per space with both. Patronage +2.');
    assert.equal(card?.shaded?.text, 'Remove Support from Hue, Da Nang, and an adjacent Province.');
    assert.equal(typeof (card?.unshaded?.effects?.[0] as { let?: unknown } | undefined)?.let, 'object');
    assert.deepEqual(card?.unshaded?.effects?.[1], tagEffectAsts({ addVar: { scope: 'global', var: 'patronage', delta: 2 } }));
    assert.equal(typeof (card?.shaded?.effects?.[0] as { if?: unknown } | undefined)?.if, 'object');
    assert.equal(typeof (card?.shaded?.effects?.[1] as { if?: unknown } | undefined)?.if, 'object');
    assert.equal((card?.shaded?.effects?.[2] as { chooseN?: { bind?: string } } | undefined)?.chooseN?.bind, '$annamAdjacentProvince');
    assert.equal(typeof (card?.shaded?.effects?.[3] as { forEach?: unknown } | undefined)?.forEach, 'object');
  });

  it('encodes card 89 (Tam Chau) with exact text, passive-target support routing, and selectable VC piece placement into Saigon', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-89');
    const parsedCard = parsed.doc.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-89');
    assert.notEqual(card, undefined);
    assert.notEqual(parsedCard, undefined);

    assert.equal(card?.title, 'Tam Chau');
    assert.equal(card?.metadata?.flavorText, 'Buddhist political leverage expands in Saigon.');
    assert.equal(card?.unshaded?.text, 'Shift Saigon 1 level toward Passive Support. Patronage +6.');
    assert.equal(card?.shaded?.text, 'Place a VC piece in Saigon and shift Saigon 1 level toward Passive Opposition. Patronage -6.');

    const unshadedJson = JSON.stringify(card?.unshaded?.effects ?? []);
    assert.match(unshadedJson, /"activeSupport"/);
    assert.match(unshadedJson, /"passiveOpposition"/);
    assert.match(unshadedJson, /"activeOpposition"/);
    assert.match(unshadedJson, /"delta":6/);

    const shadedJson = JSON.stringify(card?.shaded?.effects ?? []);
    assert.match(shadedJson, /available-VC:none/);
    assert.match(shadedJson, /tokensInMapSpaces/);
    assert.match(shadedJson, /"saigon:none"/);
    assert.match(shadedJson, /"passiveSupport"/);
    assert.match(shadedJson, /"activeOpposition"/);
    assert.match(shadedJson, /"untunneled"/);
    assert.match(shadedJson, /"delta":-6/);

    assert.equal(typeof (card?.shaded?.effects?.[0] as { let?: unknown } | undefined)?.let, 'object');
    assert.match(shadedJson, /\$tamChauVcPiece/);
  });

  it('encodes card 67 (Amphib Landing) as dual US/ARVN coastal troop relocation branches plus shaded VC relocation and next-card ineligibility', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-67');
    assert.notEqual(card, undefined);

    assert.equal(
      card?.unshaded?.text,
      'US or ARVN relocates any of its Troops among coastal spaces, then free Sweeps and Assaults in 1 coastal space.',
    );
    assert.equal(
      card?.shaded?.text,
      'VC relocate up to 3 pieces from any coastal space. US and ARVN Ineligible through next card.',
    );
    assert.equal(card?.unshaded?.freeOperationGrants, undefined, 'card-67 should issue grants after relocation choices resolve');
    assert.deepEqual(
      card?.unshaded?.branches?.map((branch) => branch.id),
      ['amphib-landing-execute-as-us', 'amphib-landing-execute-as-arvn'],
    );

    const usEffects = card?.unshaded?.branches?.[0]?.targets?.[0]?.effects ?? [];
    const arvnEffects = card?.unshaded?.branches?.[1]?.targets?.[0]?.effects ?? [];
    assert.equal(typeof (usEffects[0] as { chooseN?: unknown } | undefined)?.chooseN, 'object');
    assert.equal(typeof (usEffects[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.deepEqual((usEffects[2] as { grantFreeOperation?: Record<string, unknown> } | undefined)?.grantFreeOperation, {
      seat: 'us',
      sequence: { batch: 'amphib-landing-us', step: 0 },
      completionPolicy: 'required',
      postResolutionTurnFlow: 'resumeCardFlow',
      operationClass: 'operation',
      actionIds: ['sweep'],
      allowDuringMonsoon: true,
      moveZoneBindings: ['$targetSpaces'],
      executionContext: {
        selectedSpace: {
          _t: 2,
          ref: 'binding',
          name: '$amphibLandingOperationSpace',
        },
      },
      zoneFilter: {
        op: '==',
        left: {
          _t: 2,
          ref: 'zoneProp',
          zone: '$zone',
          prop: 'id',
        },
        right: {
          _t: 2,
          ref: 'grantContext',
          key: 'selectedSpace',
        },
      },
    });
    assert.deepEqual((usEffects[3] as { grantFreeOperation?: Record<string, unknown> } | undefined)?.grantFreeOperation, {
      seat: 'us',
      sequence: { batch: 'amphib-landing-us', step: 1 },
      completionPolicy: 'required',
      postResolutionTurnFlow: 'resumeCardFlow',
      operationClass: 'operation',
      actionIds: ['assault'],
      moveZoneBindings: ['$targetSpaces'],
      executionContext: {
        selectedSpace: {
          _t: 2,
          ref: 'binding',
          name: '$amphibLandingOperationSpace',
        },
      },
      zoneFilter: {
        op: '==',
        left: {
          _t: 2,
          ref: 'zoneProp',
          zone: '$zone',
          prop: 'id',
        },
        right: {
          _t: 2,
          ref: 'grantContext',
          key: 'selectedSpace',
        },
      },
    });
    assert.equal(typeof (arvnEffects[0] as { chooseN?: unknown } | undefined)?.chooseN, 'object');
    assert.equal(typeof (arvnEffects[1] as { forEach?: unknown } | undefined)?.forEach, 'object');
    assert.equal(
      ((arvnEffects[2] as { grantFreeOperation?: Record<string, unknown> } | undefined)?.grantFreeOperation)?.seat,
      'arvn',
    );
    assert.equal(
      ((arvnEffects[2] as { grantFreeOperation?: Record<string, unknown> } | undefined)?.grantFreeOperation)?.completionPolicy,
      'required',
    );
    assert.equal(
      ((arvnEffects[3] as { grantFreeOperation?: Record<string, unknown> } | undefined)?.grantFreeOperation)?.seat,
      'arvn',
    );
    assert.equal(
      ((arvnEffects[3] as { grantFreeOperation?: Record<string, unknown> } | undefined)?.grantFreeOperation)?.completionPolicy,
      'required',
    );

    assert.deepEqual(card?.shaded?.eligibilityOverrides, [
      { target: { kind: 'seat', seat: 'us' }, eligible: false, windowId: 'make-ineligible' },
      { target: { kind: 'seat', seat: 'arvn' }, eligible: false, windowId: 'make-ineligible' },
    ]);
    assert.equal(typeof (card?.shaded?.effects?.[0] as { if?: unknown } | undefined)?.if, 'object');
  });

  it('encodes cards 72/78 as canonical momentum round-lasting toggles', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const expectedMomentum = [
      { id: 'card-72', side: 'unshaded', effectId: 'mom-body-count', varName: 'mom_bodyCount' },
      { id: 'card-78', side: 'shaded', effectId: 'mom-general-landsdale', varName: 'mom_generalLansdale' },
    ] as const;

    for (const expected of expectedMomentum) {
      const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === expected.id);
      assert.notEqual(card, undefined);
      assert.equal(card?.tags?.includes('momentum'), true, `${expected.id} must include momentum tag`);

      const side = expected.side === 'unshaded' ? card?.unshaded : card?.shaded;
      const effect = side?.lastingEffects?.find((entry) => entry.id === expected.effectId);
      assert.notEqual(effect, undefined, `${expected.id} ${expected.side} must include ${expected.effectId}`);
      assert.equal(effect?.duration, 'round');
      assert.deepEqual(effect?.setupEffects, tagEffectAsts([{ setVar: { scope: 'global', var: expected.varName, value: true } }]));
      assert.deepEqual(effect?.teardownEffects, tagEffectAsts([{ setVar: { scope: 'global', var: expected.varName, value: false } }]));
    }
  });

  it('encodes card 73 (Great Society) shaded side as US available-to-out-of-play removal', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-73');
    assert.notEqual(card, undefined);
    assert.equal(card?.unshaded?.text, 'Conduct a Commitment Phase.');
    assert.deepEqual(card?.unshaded?.effects, tagEffectAsts([
      { pushInterruptPhase: { phase: 'commitment', resumePhase: 'main' } },
    ]));
    assert.equal(card?.shaded?.effects?.length, 2);
    const choosePieces = (card?.shaded?.effects?.[0] as { chooseN?: Record<string, unknown> } | undefined)?.chooseN;
    assert.notEqual(choosePieces, undefined);
    assert.equal(choosePieces?.bind, '$greatSocietyUsPieces');
    assert.deepEqual(choosePieces?.chooser, { id: 0 });
    assert.deepEqual(choosePieces?.options, {
      query: 'tokensInZone',
      zone: 'available-US:none',
      filter: { prop: 'faction', op: 'eq', value: 'US' },
    });
    assert.deepEqual(choosePieces?.min, {
      _t: 6,
      op: 'min',
      left: 3,
      right: {
        _t: 5,
        aggregate: {
          op: 'count',
          query: {
            query: 'tokensInZone',
            zone: 'available-US:none',
            filter: { prop: 'faction', op: 'eq', value: 'US' },
          },
        },
      },
    });
    assert.deepEqual(choosePieces?.max, {
      _t: 6,
      op: 'min',
      left: 3,
      right: {
        _t: 5,
        aggregate: {
          op: 'count',
          query: {
            query: 'tokensInZone',
            zone: 'available-US:none',
            filter: { prop: 'faction', op: 'eq', value: 'US' },
          },
        },
      },
    });
    assert.deepEqual(card?.shaded?.effects?.[1], tagEffectAsts({
      forEach: {
        bind: '$greatSocietyUsPiece',
        over: {
          query: 'binding',
          name: '$greatSocietyUsPieces',
        },
        effects: [
          {
            moveToken: {
              token: '$greatSocietyUsPiece',
              from: {
                zoneExpr: {
                  _t: 2,
                  ref: 'tokenZone',
                  token: '$greatSocietyUsPiece',
                },
              },
              to: {
                zoneExpr: 'out-of-play-US:none',
              },
            },
          },
        ],
      },
    }));
  });

  it('encodes card 90 (Walt Rostow) with anywhere-ARVN placement and immediate no-base redeploy structure', () => {
    const { parsed, compiled } = FITL_PRODUCTION_FIXTURE;

    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const card = compiled.gameDef?.eventDecks?.[0]?.cards.find((entry) => entry.id === 'card-90');
    assert.notEqual(card, undefined);
    assert.equal(
      card?.unshaded?.text,
      'Place any 2 ARVN pieces from anywhere (even out of play) into any COIN Control spaces.',
    );
    assert.equal(
      card?.shaded?.text,
      'Place any 1 Guerrilla in each Province with ARVN. ARVN Troops Redeploy as if no Bases.',
    );

    const unshadedEffects = card?.unshaded?.effects ?? [];
    assert.equal(unshadedEffects.length, 2, 'card-90 unshaded should define selection + per-piece destination routing');
    assert.notEqual((unshadedEffects[0] as { chooseN?: unknown }).chooseN, undefined);
    assert.notEqual((unshadedEffects[1] as { forEach?: unknown }).forEach, undefined);

    const shadedEffects = card?.shaded?.effects ?? [];
    assert.equal(shadedEffects.length, 2, 'card-90 shaded should define province placement and troop redeploy passes');
    assert.notEqual((shadedEffects[0] as { forEach?: unknown }).forEach, undefined);
    assert.notEqual((shadedEffects[1] as { forEach?: unknown }).forEach, undefined);
  });
});
