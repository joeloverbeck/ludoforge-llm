import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, initialState, type GameState, type Token } from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

const countTokens = (state: GameState, space: string, predicate: (token: Token) => boolean): number =>
  (state.zones[space] ?? []).filter(predicate).length;
const LOOKAHEAD_ZONE = 'lookahead:none';

const withMonsoonLookahead = (state: GameState): GameState => {
  const lookahead = state.zones[LOOKAHEAD_ZONE] ?? [];
  const [top, ...rest] = lookahead;
  const coupTop: Token = top === undefined
    ? makeToken('monsoon-lookahead', 'card', 'none', { isCoup: true })
    : {
      ...top,
      props: {
        ...top.props,
        isCoup: true,
      },
    };
  return {
    ...state,
    zones: {
      ...state.zones,
      [LOOKAHEAD_ZONE]: [coupTop, ...rest],
    },
  };
};

describe('FITL capability branches (Sweep/Assault/Air Strike)', () => {
  const getParsedProfile = (profileId: string): any => {
    const { parsed } = compileProductionSpec();
    const profile = parsed.doc.actionPipelines?.find((candidate: { id: string }) => candidate.id === profileId);
    assert.ok(profile, `Expected ${profileId}`);
    return profile;
  };

  it('compiles production spec with side-specific capability checks for all ticketed branches', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);
    const macrosById = new Map((parsed.doc.effectMacros ?? []).map((macro: any) => [macro.id, macro]));

    const checks: Array<{ profileId: string; marker: string; side: 'unshaded' | 'shaded' }> = [
      { profileId: 'sweep-us-profile', marker: 'cap_cobras', side: 'unshaded' },
      { profileId: 'sweep-us-profile', marker: 'cap_caps', side: 'shaded' },
      { profileId: 'sweep-us-profile', marker: 'cap_boobyTraps', side: 'shaded' },
      { profileId: 'sweep-arvn-profile', marker: 'cap_cobras', side: 'unshaded' },
      { profileId: 'sweep-arvn-profile', marker: 'cap_caps', side: 'shaded' },
      { profileId: 'sweep-arvn-profile', marker: 'cap_boobyTraps', side: 'shaded' },
      { profileId: 'assault-us-profile', marker: 'cap_abrams', side: 'unshaded' },
      { profileId: 'assault-us-profile', marker: 'cap_abrams', side: 'shaded' },
      { profileId: 'assault-us-profile', marker: 'cap_cobras', side: 'shaded' },
      { profileId: 'assault-us-profile', marker: 'cap_m48Patton', side: 'unshaded' },
      { profileId: 'assault-us-profile', marker: 'cap_searchAndDestroy', side: 'unshaded' },
      { profileId: 'assault-us-profile', marker: 'cap_searchAndDestroy', side: 'shaded' },
      { profileId: 'assault-arvn-profile', marker: 'cap_searchAndDestroy', side: 'unshaded' },
      { profileId: 'assault-arvn-profile', marker: 'cap_searchAndDestroy', side: 'shaded' },
      { profileId: 'air-strike-profile', marker: 'cap_topGun', side: 'unshaded' },
      { profileId: 'air-strike-profile', marker: 'cap_topGun', side: 'shaded' },
      { profileId: 'air-strike-profile', marker: 'cap_arcLight', side: 'unshaded' },
      { profileId: 'air-strike-profile', marker: 'cap_arcLight', side: 'shaded' },
      { profileId: 'air-strike-profile', marker: 'cap_lgbs', side: 'unshaded' },
      { profileId: 'air-strike-profile', marker: 'cap_lgbs', side: 'shaded' },
      { profileId: 'air-strike-profile', marker: 'cap_aaa', side: 'shaded' },
      { profileId: 'air-strike-profile', marker: 'cap_migs', side: 'shaded' },
      { profileId: 'air-strike-profile', marker: 'cap_sa2s', side: 'unshaded' },
    ];

    for (const check of checks) {
      const profile = getParsedProfile(check.profileId);
      const directMatches = findDeep(profile.stages, (node: any) =>
        node?.if?.when !== undefined &&
        JSON.stringify(node.if.when).includes(`\"ref\":\"globalMarkerState\"`) &&
        JSON.stringify(node.if.when).includes(`\"marker\":\"${check.marker}\"`) &&
        JSON.stringify(node.if.when).includes(`\"${check.side}\"`),
      );

      const macroRefs = findDeep(profile.stages, (node: any) => typeof node?.macro === 'string').map((node: any) => node.macro);
      const macroMatches = macroRefs.flatMap((macroId: string) => {
        const macroDef = macrosById.get(macroId);
        if (macroDef === undefined) return [];
        return findDeep(macroDef.effects ?? [], (node: any) =>
          node?.if?.when !== undefined &&
          JSON.stringify(node.if.when).includes(`\"ref\":\"globalMarkerState\"`) &&
          JSON.stringify(node.if.when).includes(`\"marker\":\"${check.marker}\"`) &&
          JSON.stringify(node.if.when).includes(`\"${check.side}\"`),
        );
      });

      const matches = [...directMatches, ...macroMatches];
      assert.ok(
        matches.length >= 1,
        `Expected ${check.profileId} to check ${check.marker}=${check.side}, found ${matches.length}`,
      );
    }
  });

  it('caps Sweep space selection for cap_caps shaded branch (US fixed cap, ARVN min with affordability)', () => {
    const us = getParsedProfile('sweep-us-profile');
    const arvn = getParsedProfile('sweep-arvn-profile');

    const usShadedChecks = findDeep(us.stages, (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_caps' &&
      node?.if?.when?.right === 'shaded',
    );
    assert.ok(usShadedChecks.length >= 1);
    const usHasMaxTwo = findDeep(usShadedChecks[0], (node: any) => node?.chooseN?.max === 2);
    const usHasMaxNinetyNine = findDeep(usShadedChecks[0], (node: any) => node?.chooseN?.max === 99);
    assert.ok(usHasMaxTwo.length >= 1, 'Expected US cap_caps shaded branch to set max 2');
    assert.ok(usHasMaxNinetyNine.length >= 1, 'Expected US cap_caps else branch to preserve max 99');

    const arvnShadedChecks = findDeep(arvn.stages, (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_caps' &&
      node?.if?.when?.right === 'shaded',
    );
    assert.ok(arvnShadedChecks.length >= 1);
    const arvnHasMinCap = findDeep(arvnShadedChecks[0], (node: any) =>
      node?.chooseN?.max?.op === 'min' &&
      node?.chooseN?.max?.left === 2 &&
      node?.chooseN?.max?.right?.op === 'floorDiv' &&
      node?.chooseN?.max?.right?.left?.ref === 'gvar' &&
      node?.chooseN?.max?.right?.left?.var === 'arvnResources' &&
      node?.chooseN?.max?.right?.right === 3,
    );
    const arvnHasAffordabilityElse = findDeep(arvnShadedChecks[0], (node: any) =>
      node?.chooseN?.max?.op === 'floorDiv' &&
      node?.chooseN?.max?.left?.ref === 'gvar' &&
      node?.chooseN?.max?.left?.var === 'arvnResources' &&
      node?.chooseN?.max?.right === 3,
    );
    assert.ok(arvnHasMinCap.length >= 1, 'Expected ARVN cap_caps shaded branch max equivalent to min(2, floorDiv(arvnResources, 3))');
    assert.ok(arvnHasAffordabilityElse.length >= 1, 'Expected ARVN cap_caps else branch to use floorDiv(arvnResources, 3)');
  });

  it('caps Assault space selection for cap_abrams shaded branch in US profile only', () => {
    const us = getParsedProfile('assault-us-profile');
    const arvn = getParsedProfile('assault-arvn-profile');

    const usShadedChecks = findDeep(us.stages, (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_abrams' &&
      node?.if?.when?.right === 'shaded',
    );
    assert.ok(usShadedChecks.length >= 1);
    const usHasMaxTwo = findDeep(usShadedChecks[0], (node: any) => node?.chooseN?.max === 2);
    const usHasMaxNinetyNine = findDeep(usShadedChecks[0], (node: any) => node?.chooseN?.max === 99);
    assert.ok(usHasMaxTwo.length >= 1, 'Expected US cap_abrams shaded branch to set max 2');
    assert.ok(usHasMaxNinetyNine.length >= 1, 'Expected US cap_abrams else branch to preserve max 99');

    const arvnAbramsChecks = findDeep(arvn.stages, (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_abrams',
    );
    assert.equal(arvnAbramsChecks.length, 0, 'Expected ARVN Assault profile to ignore cap_abrams');
  });

  it('US Abrams unshaded removes one untunneled Base first within normal Assault removal budget', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'quang-tin-quang-ngai:none';
    const start = clearAllZones(initialState(def, 22011, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...start.globalMarkers,
        cap_abrams: 'unshaded',
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('abrams-us-t', 'troops', 'US', { type: 'troops' }),
          makeToken('abrams-vc-g', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('abrams-vc-base', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        ],
      },
    };

    const beforeAid = Number(configured.globalVars.aid ?? 0);
    const final = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('assault'),
      params: {
        targetSpaces: [space],
        $abramsSpace: [space],
        $arvnFollowupSpaces: [],
      },
    }).state;

    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'VC'),
      1,
      'Abrams unshaded should not add extra removals beyond normal Assault damage',
    );
    assert.equal(
      countTokens(final, space, (token) => token.type === 'base' && token.props.faction === 'VC'),
      0,
      'Abrams unshaded should remove an untunneled Base first in the selected US Assault space',
    );
    assert.equal(final.globalVars.aid, beforeAid + 6, 'Removing one insurgent Base via Abrams should still grant +6 Aid');
  });

  it('US Abrams unshaded does not remove tunneled Bases first', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'saigon:none';
    const start = clearAllZones(initialState(def, 22012, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...start.globalMarkers,
        cap_abrams: 'unshaded',
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('abrams-us-t2', 'troops', 'US', { type: 'troops' }),
          makeToken('abrams-nva-g2', 'guerrilla', 'NVA', { type: 'guerrilla', activity: 'active' }),
          makeToken('abrams-nva-base2', 'base', 'NVA', { type: 'base', tunnel: 'tunneled' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('assault'),
      params: {
        targetSpaces: [space],
        $abramsSpace: [space],
        $arvnFollowupSpaces: [],
      },
    }).state;

    assert.equal(
      countTokens(final, space, (token) => token.type === 'base' && token.props.faction === 'NVA'),
      1,
      'Abrams unshaded must not force removal of tunneled Bases',
    );
    assert.equal(
      countTokens(final, space, (token) => token.type === 'guerrilla' && token.props.faction === 'NVA'),
      0,
      'Normal Assault order should remove non-Base enemy first when Base is tunneled',
    );
  });

  it('US Abrams unshaded applies to exactly one selected US Assault space', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const abramsSpace = 'saigon:none';
    const normalSpace = 'hue:none';
    const start = clearAllZones(initialState(def, 22013, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...start.globalMarkers,
        cap_abrams: 'unshaded',
      },
      zones: {
        ...start.zones,
        [abramsSpace]: [
          makeToken('abrams-us-a', 'troops', 'US', { type: 'troops' }),
          makeToken('abrams-vc-g-a', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('abrams-vc-b-a', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        ],
        [normalSpace]: [
          makeToken('abrams-us-b', 'troops', 'US', { type: 'troops' }),
          makeToken('abrams-vc-g-b', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('abrams-vc-b-b', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('assault'),
      params: {
        targetSpaces: [abramsSpace, normalSpace],
        $abramsSpace: [abramsSpace],
        $arvnFollowupSpaces: [],
      },
    }).state;

    assert.equal(
      countTokens(final, abramsSpace, (token) => token.type === 'base' && token.props.faction === 'VC'),
      0,
      'Selected Abrams space should remove Base first',
    );
    assert.equal(
      countTokens(final, normalSpace, (token) => token.type === 'base' && token.props.faction === 'VC'),
      1,
      'Non-selected space should retain Base when only 1 damage is available',
    );
  });

  it('ARVN Assault remains unaffected by Abrams unshaded', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'hue:none';
    const start = clearAllZones(initialState(def, 22014, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...start.globalVars,
        arvnResources: 3,
        mom_bodyCount: false,
      },
      globalMarkers: {
        ...start.globalMarkers,
        cap_abrams: 'unshaded',
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('abrams-arvn-t', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('abrams-arvn-p', 'police', 'ARVN', { type: 'police' }),
          makeToken('abrams-arvn-vc-g', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('abrams-arvn-vc-b', 'base', 'VC', { type: 'base', tunnel: 'untunneled' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('assault'),
      params: { targetSpaces: [space] },
    }).state;

    assert.equal(
      countTokens(final, space, (token) => token.type === 'base' && token.props.faction === 'VC'),
      1,
      'ARVN Assault should still remove non-Base enemy before Base regardless of Abrams unshaded',
    );
    assert.equal(
      countTokens(final, space, (token) => token.type === 'guerrilla' && token.props.faction === 'VC'),
      0,
      'ARVN Assault should remove the guerrilla first with 1 damage',
    );
  });

  it('US M48 unshaded applies +2 removal only in selected non-Lowland US Assault spaces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const lowland = 'quang-tin-quang-ngai:none';
    const highland = 'binh-dinh:none';
    const start = clearAllZones(initialState(def, 22016, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...start.globalMarkers,
        cap_m48Patton: 'unshaded',
      },
      zones: {
        ...start.zones,
        [lowland]: [
          makeToken('m48-us-lowland', 'troops', 'US', { type: 'troops' }),
          makeToken('m48-vc-lowland-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('m48-vc-lowland-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('m48-vc-lowland-3', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
        [highland]: [
          makeToken('m48-us-highland-a', 'troops', 'US', { type: 'troops' }),
          makeToken('m48-us-highland-b', 'troops', 'US', { type: 'troops' }),
          makeToken('m48-vc-highland-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('m48-vc-highland-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('m48-vc-highland-3', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(
      def,
      configured,
      {
        actionId: asActionId('assault'),
        params: {
          targetSpaces: [lowland, highland],
          $arvnFollowupSpaces: [],
        },
      },
      {
        overrides: [
          {
            when: (request) => request.name.includes('m48Spaces'),
            value: [highland],
          },
        ],
      },
    ).state;

    assert.equal(
      countTokens(final, lowland, (token) => token.props.faction === 'VC'),
      2,
      'Lowland should take only normal US Assault removal (no M48 bonus)',
    );
    assert.equal(
      countTokens(final, highland, (token) => token.props.faction === 'VC'),
      0,
      'Selected non-Lowland should apply M48 +2 removal on top of normal US Assault damage',
    );
  });

  it('ARVN Assault ignores M48 unshaded bonus entirely', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'binh-dinh:none';
    const start = clearAllZones(initialState(def, 22017, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(1),
      globalVars: {
        ...start.globalVars,
        arvnResources: 3,
        mom_bodyCount: false,
      },
      globalMarkers: {
        ...start.globalMarkers,
        cap_m48Patton: 'unshaded',
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('m48-arvn-t1', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('m48-arvn-t2', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('m48-arvn-t3', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('m48-vc-a', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('m48-vc-b', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('m48-vc-c', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('assault'),
      params: { targetSpaces: [space] },
    }).state;

    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'VC'),
      2,
      'ARVN Assault should apply only normal ARVN damage with no M48 extra removals',
    );
  });

  it('US Abrams shaded caps Assault space selection to max 2', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const a = 'saigon:none';
    const b = 'hue:none';
    const c = 'quang-tin-quang-ngai:none';
    const start = clearAllZones(initialState(def, 22015, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...start.globalMarkers,
        cap_abrams: 'shaded',
      },
      zones: {
        ...start.zones,
        [a]: [makeToken('abrams-shaded-us-a', 'troops', 'US', { type: 'troops' }), makeToken('abrams-shaded-vc-a', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
        [b]: [makeToken('abrams-shaded-us-b', 'troops', 'US', { type: 'troops' }), makeToken('abrams-shaded-vc-b', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
        [c]: [makeToken('abrams-shaded-us-c', 'troops', 'US', { type: 'troops' }), makeToken('abrams-shaded-vc-c', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
      },
    };

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, configured, {
          actionId: asActionId('assault'),
          params: { targetSpaces: [a, b, c], $arvnFollowupSpaces: [] },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });

  it('routes M48 unshaded Assault bonus only through the US Assault profile', () => {
    const { parsed } = compileProductionSpec();
    assertNoErrors(parsed);

    const macrosById = new Map((parsed.doc.effectMacros ?? []).map((macro: any) => [macro.id, macro]));
    const m48Macro = macrosById.get('cap-assault-m48-unshaded-bonus-removal');
    assert.ok(m48Macro, 'Expected shared M48 Assault macro');
    assert.equal(m48Macro.params?.[0]?.name, 'targetSpaces');
    assert.equal(
      m48Macro.params?.[0]?.type,
      'bindingName',
      'Expected M48 macro targetSpaces to be binding-aware for macro hygiene rewrites',
    );

    const usProfile = getParsedProfile('assault-us-profile');
    const usStage = usProfile.stages.find((candidate: any) => candidate.stage === 'cap-m48-patton-bonus-removal');
    assert.ok(usStage, 'Expected assault-us-profile M48 stage');
    const usRefs = findDeep(usStage.effects, (node: any) => node?.macro === 'cap-assault-m48-unshaded-bonus-removal');
    assert.equal(usRefs.length, 1, 'Expected assault-us-profile to call shared M48 macro exactly once');

    const arvnProfile = getParsedProfile('assault-arvn-profile');
    const arvnStage = arvnProfile.stages.find((candidate: any) => candidate.stage === 'cap-m48-patton-bonus-removal');
    assert.equal(arvnStage, undefined, 'Expected assault-arvn-profile to omit M48 bonus stage');
  });

  it('models Arc Light with dedicated no-COIN Province slot and per-space >1 removal shaded shift trigger', () => {
    const profile = getParsedProfile('air-strike-profile');

    const arcSlotSelector = findDeep(profile.stages, (node: any) => node?.chooseN?.bind === '$arcLightNoCoinProvinces');
    assert.ok(arcSlotSelector.length >= 1, 'Expected explicit Arc Light no-COIN Province selector');

    const mainSelectorUsesReducedCap = findDeep(profile.stages, (node: any) =>
      node?.chooseN?.bind === 'spaces' &&
      node?.chooseN?.max?.if?.else?.op === '-' &&
      node?.chooseN?.max?.if?.else?.left === 6 &&
      node?.chooseN?.max?.if?.else?.right?.aggregate?.query?.name === '$arcLightNoCoinProvinces',
    );
    assert.ok(mainSelectorUsesReducedCap.length >= 1, 'Expected main Air Strike selector max to subtract selected Arc Light no-COIN Provinces');

    const shadedShiftTrigger = findDeep(profile.stages, (node: any) =>
      node?.shiftMarker?.marker === 'supportOpposition' &&
      node?.shiftMarker?.delta?.if?.when?.args?.some(
        (clause: any) => clause?.left?.ref === 'binding' && clause?.left?.name === '$removedInSpace' && clause?.right === 1,
      ),
    );
    assert.ok(shadedShiftTrigger.length >= 1, 'Expected Arc Light shaded shift trigger to key off removed-in-space count');
  });

  it('Air Strike cap_lgbs shaded reduces removal budget to 4 at runtime', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const space = 'saigon:none';
    const start = initialState(def, 1001, 4).state;
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...start.globalMarkers,
        cap_lgbs: 'shaded',
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('lgbs-us-t', 'troops', 'US', { type: 'troops' }),
          makeToken('lgbs-nva-1', 'troops', 'NVA', { type: 'troops' }),
          makeToken('lgbs-nva-2', 'troops', 'NVA', { type: 'troops' }),
          makeToken('lgbs-nva-3', 'troops', 'NVA', { type: 'troops' }),
          makeToken('lgbs-vc-1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('lgbs-vc-2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space],
        $degradeTrail: 'no',
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.airStrikeCount, 1);
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      1,
      'With 5 enemies initially and cap_lgbs shaded, Air Strike should remove 4 max',
    );
  });

  it('Air Strike cap_topGun unshaded degrades Trail by 2 and suppresses cap_migs shaded troop loss', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const space = 'saigon:none';
    const start = initialState(def, 1002, 4).state;
    const modifiedStart: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...start.globalVars,
        trail: 3,
      },
      globalMarkers: {
        ...start.globalMarkers,
        cap_topGun: 'unshaded',
        cap_migs: 'shaded',
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('topgun-us-t', 'troops', 'US', { type: 'troops' }),
          makeToken('topgun-nva-t', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
    };

    const usTroopsBefore = countTokens(
      modifiedStart,
      space,
      (token) => token.props.faction === 'US' && token.type === 'troops',
    );

    const result = applyMoveWithResolvedDecisionIds(def, modifiedStart, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space],
        $degradeTrail: 'yes',
      },
    });

    const final = result.state;
    assert.equal(final.globalVars.trail, 1, 'cap_topGun unshaded should degrade Trail by 2');
    assert.equal(
      countTokens(final, space, (token) => token.props.faction === 'US' && token.type === 'troops'),
      usTroopsBefore,
      'cap_topGun unshaded should suppress cap_migs shaded troop loss branch',
    );
  });

  it('Air Strike cap_topGun shaded degrades Trail by 1 only on roll 4-6 when degrade is declared', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'saigon:none';

    const runFromSeed = (seed: number): number => {
      const start = initialState(def, seed, 4).state;
      const configured: GameState = {
        ...start,
        activePlayer: asPlayerId(0),
        globalVars: {
          ...start.globalVars,
          trail: 3,
        },
        globalMarkers: {
          ...start.globalMarkers,
          cap_topGun: 'shaded',
        },
        zones: {
          ...start.zones,
          [space]: [
            makeToken(`topgun-shaded-us-${seed}`, 'troops', 'US', { type: 'troops' }),
            makeToken(`topgun-shaded-nva-a-${seed}`, 'troops', 'NVA', { type: 'troops' }),
            makeToken(`topgun-shaded-nva-b-${seed}`, 'troops', 'NVA', { type: 'troops' }),
          ],
        },
      };

      return applyMoveWithResolvedDecisionIds(def, configured, {
        actionId: asActionId('airStrike'),
        params: {
          spaces: [space],
          $degradeTrail: 'yes',
        },
      }).state.globalVars.trail as number;
    };

    let successTrail: number | undefined;
    let failTrail: number | undefined;
    for (let seed = 1; seed <= 100 && (successTrail === undefined || failTrail === undefined); seed += 1) {
      const trailAfter = runFromSeed(seed);
      if (trailAfter === 2) successTrail = trailAfter;
      if (trailAfter === 3) failTrail = trailAfter;
    }

    assert.equal(successTrail, 2, 'Expected at least one deterministic seed with topGun shaded roll success (4-6)');
    assert.equal(failTrail, 3, 'Expected at least one deterministic seed with topGun shaded roll failure (1-3)');
  });

  it('Air Strike cap_topGun shaded does not attempt Trail degrade when $degradeTrail is no', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const space = 'saigon:none';

    const start = initialState(def, 21002, 4).state;
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalVars: {
        ...start.globalVars,
        trail: 2,
      },
      globalMarkers: {
        ...start.globalMarkers,
        cap_topGun: 'shaded',
      },
      zones: {
        ...start.zones,
        [space]: [
          makeToken('topgun-shaded-no-degrade-us', 'troops', 'US', { type: 'troops' }),
          makeToken('topgun-shaded-no-degrade-nva', 'troops', 'NVA', { type: 'troops' }),
        ],
      },
    };

    const result = applyMoveWithResolvedDecisionIds(def, configured, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [space],
        $degradeTrail: 'no',
      },
    }).state;

    assert.equal(result.globalVars.trail, 2, 'Declining degrade should bypass topGun shaded roll gate entirely');
  });

  it('Arc Light unshaded allows exactly 1 no-COIN Province (including foreign Provinces) without reducing normal Air Strike space cap', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const regularSpace = 'saigon:none';
    const arcSpace = 'central-laos:none';
    const secondArcSpace = 'north-vietnam:none';

    const base = clearAllZones(initialState(def, 21003, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...base.globalMarkers,
        cap_arcLight: 'unshaded',
      },
      zones: {
        ...base.zones,
        [regularSpace]: [
          makeToken('arc-regular-us', 'troops', 'US', { type: 'troops' }),
          makeToken('arc-regular-nva', 'troops', 'NVA', { type: 'troops' }),
        ],
        [arcSpace]: [makeToken('arc-foreign-vc', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
        [secondArcSpace]: [makeToken('arc-foreign-nva', 'troops', 'NVA', { type: 'troops' })],
      },
    };

    const legal = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [regularSpace],
        $arcLightNoCoinProvinces: [arcSpace],
        $degradeTrail: 'no',
      },
    }).state;

    assert.equal(
      countTokens(legal, regularSpace, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      0,
      'Regular Air Strike space should still resolve normally',
    );
    assert.equal(
      countTokens(legal, arcSpace, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      0,
      'Arc Light space without COIN pieces should be legal and resolve removals',
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, setup, {
          actionId: asActionId('airStrike'),
          params: {
            spaces: [regularSpace],
            $arcLightNoCoinProvinces: [arcSpace, secondArcSpace],
            $degradeTrail: 'no',
          },
        }),
      /chooseN/,
      'Arc Light unshaded must allow at most one no-COIN Province',
    );
  });

  it('Arc Light unshaded no-COIN exception is Province-only and Base still counts as a COIN piece', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const provinceWithBase = 'quang-nam:none';
    const arcProvince = 'the-fishhook:none';
    const cityWithoutCoin = 'hue:none';

    const base = clearAllZones(initialState(def, 21004, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...base.globalMarkers,
        cap_arcLight: 'unshaded',
      },
      markers: {
        ...base.markers,
        [provinceWithBase]: {
          ...(base.markers[provinceWithBase] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zones: {
        ...base.zones,
        [provinceWithBase]: [
          makeToken('arc-base-us', 'base', 'US', { type: 'base' }),
          makeToken('arc-base-vc', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
        [arcProvince]: [makeToken('arc-province-nva', 'troops', 'NVA', { type: 'troops' })],
        [cityWithoutCoin]: [makeToken('arc-city-vc', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
      },
    };

    const legal = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [provinceWithBase],
        $arcLightNoCoinProvinces: [arcProvince],
        $degradeTrail: 'no',
      },
    }).state;

    assert.equal(
      countTokens(legal, provinceWithBase, (token) => token.props.faction === 'NVA' || token.props.faction === 'VC'),
      0,
      'US Base should satisfy the normal COIN-piece target requirement',
    );

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, setup, {
          actionId: asActionId('airStrike'),
          params: {
            spaces: [provinceWithBase],
            $arcLightNoCoinProvinces: [cityWithoutCoin],
            $degradeTrail: 'no',
          },
        }),
      /chooseN/,
      'Arc Light no-COIN exception must not apply to cities',
    );
  });

  it('Arc Light shaded shifts each qualifying Air Strike space by 2 only when that space removes more than 1 piece', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const twoHitSpace = 'quang-nam:none';
    const oneHitSpace = 'saigon:none';

    const base = clearAllZones(initialState(def, 21005, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...base.globalMarkers,
        cap_arcLight: 'shaded',
      },
      markers: {
        ...base.markers,
        [twoHitSpace]: {
          ...(base.markers[twoHitSpace] ?? {}),
          supportOpposition: 'neutral',
        },
        [oneHitSpace]: {
          ...(base.markers[oneHitSpace] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zones: {
        ...base.zones,
        [twoHitSpace]: [
          makeToken('arc-shaded-us-a', 'troops', 'US', { type: 'troops' }),
          makeToken('arc-shaded-vc-a1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('arc-shaded-vc-a2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
        [oneHitSpace]: [
          makeToken('arc-shaded-us-b', 'troops', 'US', { type: 'troops' }),
          makeToken('arc-shaded-vc-b1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [twoHitSpace, oneHitSpace],
        $degradeTrail: 'no',
      },
    }).state;

    assert.equal(final.markers[twoHitSpace]?.supportOpposition, 'activeOpposition', 'Space removing 2 pieces should shift by 2');
    assert.equal(final.markers[oneHitSpace]?.supportOpposition, 'passiveOpposition', 'Space removing 1 piece should shift by 1');
  });

  it('Arc Light shaded applies 2-level shift even when only one space is selected', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const target = 'quang-duc-long-khanh:none';
    const base = clearAllZones(initialState(def, 21006, 4).state);
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...base.globalMarkers,
        cap_arcLight: 'shaded',
      },
      markers: {
        ...base.markers,
        [target]: {
          ...(base.markers[target] ?? {}),
          supportOpposition: 'neutral',
        },
      },
      zones: {
        ...base.zones,
        [target]: [
          makeToken('arc-shaded-single-us', 'troops', 'US', { type: 'troops' }),
          makeToken('arc-shaded-single-vc1', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
          makeToken('arc-shaded-single-vc2', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' }),
        ],
      },
    };

    const final = applyMoveWithResolvedDecisionIds(def, setup, {
      actionId: asActionId('airStrike'),
      params: {
        spaces: [target],
        $degradeTrail: 'no',
      },
    }).state;

    assert.equal(final.markers[target]?.supportOpposition, 'activeOpposition');
  });

  it('Monsoon allows Arc Light no-COIN Province only when total Air Strike spaces stay at 2', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const regularSpace = 'saigon:none';
    const arcSpace = 'the-fishhook:none';
    const base = withMonsoonLookahead(clearAllZones(initialState(def, 21007, 4).state));
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...base.globalMarkers,
        cap_arcLight: 'unshaded',
      },
      zones: {
        ...base.zones,
        [regularSpace]: [
          makeToken('arc-monsoon-us', 'troops', 'US', { type: 'troops' }),
          makeToken('arc-monsoon-nva', 'troops', 'NVA', { type: 'troops' }),
        ],
        [arcSpace]: [makeToken('arc-monsoon-vc', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
      },
    };

    assert.doesNotThrow(() =>
      applyMoveWithResolvedDecisionIds(def, setup, {
        actionId: asActionId('airStrike'),
        params: {
          spaces: [regularSpace],
          $arcLightNoCoinProvinces: [arcSpace],
          $degradeTrail: 'no',
        },
      }),
    );
  });

  it('Monsoon rejects Arc Light selections that exceed 2 total Air Strike spaces', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const spaceA = 'saigon:none';
    const spaceB = 'hue:none';
    const arcSpace = 'the-fishhook:none';
    const base = withMonsoonLookahead(clearAllZones(initialState(def, 21008, 4).state));
    const setup: GameState = {
      ...base,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...base.globalMarkers,
        cap_arcLight: 'unshaded',
      },
      zones: {
        ...base.zones,
        [spaceA]: [
          makeToken('arc-monsoon-a-us', 'troops', 'US', { type: 'troops' }),
          makeToken('arc-monsoon-a-nva', 'troops', 'NVA', { type: 'troops' }),
        ],
        [spaceB]: [
          makeToken('arc-monsoon-b-us', 'troops', 'US', { type: 'troops' }),
          makeToken('arc-monsoon-b-nva', 'troops', 'NVA', { type: 'troops' }),
        ],
        [arcSpace]: [makeToken('arc-monsoon-c-vc', 'guerrilla', 'VC', { type: 'guerrilla', activity: 'active' })],
      },
    };

    assert.throws(
      () =>
        applyMoveWithResolvedDecisionIds(def, setup, {
          actionId: asActionId('airStrike'),
          params: {
            spaces: [spaceA, spaceB],
            $arcLightNoCoinProvinces: [arcSpace],
            $degradeTrail: 'no',
          },
        }),
      /(?:Illegal move|choiceRuntimeValidationFailed|outside options domain)/,
    );
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
