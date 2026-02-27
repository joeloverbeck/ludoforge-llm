import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asPlayerId, asTokenId, initialState, type GameState, type Token } from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { applyMoveWithResolvedDecisionIds } from '../helpers/decision-param-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

const countTokens = (state: GameState, space: string, predicate: (token: Token) => boolean): number =>
  (state.zones[space] ?? []).filter(predicate).length;

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
      { profileId: 'assault-arvn-profile', marker: 'cap_abrams', side: 'unshaded' },
      { profileId: 'assault-arvn-profile', marker: 'cap_abrams', side: 'shaded' },
      { profileId: 'assault-arvn-profile', marker: 'cap_cobras', side: 'shaded' },
      { profileId: 'assault-arvn-profile', marker: 'cap_m48Patton', side: 'unshaded' },
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

  it('caps Assault space selection for cap_abrams shaded branch (US fixed cap, ARVN body-count-aware affordability)', () => {
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

    const arvnShadedChecks = findDeep(arvn.stages, (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_abrams' &&
      node?.if?.when?.right === 'shaded',
    );
    assert.ok(arvnShadedChecks.length >= 1);
    const arvnBodyCountBypass = findDeep(arvnShadedChecks[0], (node: any) =>
      node?.chooseN?.max?.if?.when?.op === '==' &&
      node?.chooseN?.max?.if?.when?.left?.ref === 'gvar' &&
      node?.chooseN?.max?.if?.when?.left?.var === 'mom_bodyCount' &&
      node?.chooseN?.max?.if?.when?.right === true &&
      node?.chooseN?.max?.if?.then === 99,
    );
    const arvnMinAffordability = findDeep(arvnShadedChecks[0], (node: any) =>
      node?.chooseN?.max?.if?.else?.op === 'min' &&
      node?.chooseN?.max?.if?.else?.left === 2 &&
      node?.chooseN?.max?.if?.else?.right?.op === 'floorDiv' &&
      node?.chooseN?.max?.if?.else?.right?.left?.ref === 'gvar' &&
      node?.chooseN?.max?.if?.else?.right?.left?.var === 'arvnResources' &&
      node?.chooseN?.max?.if?.else?.right?.right === 3,
    );
    const arvnElseAffordability = findDeep(arvnShadedChecks[0], (node: any) =>
      node?.chooseN?.max?.if?.else?.op === 'floorDiv' &&
      node?.chooseN?.max?.if?.else?.left?.ref === 'gvar' &&
      node?.chooseN?.max?.if?.else?.left?.var === 'arvnResources' &&
      node?.chooseN?.max?.if?.else?.right === 3,
    );
    assert.ok(arvnBodyCountBypass.length >= 2, 'Expected ARVN Body Count max bypass in both cap_abrams branches');
    assert.ok(arvnMinAffordability.length >= 1, 'Expected ARVN cap_abrams shaded branch max equivalent to min(2, floorDiv(arvnResources, 3))');
    assert.ok(arvnElseAffordability.length >= 1, 'Expected ARVN cap_abrams else branch to use floorDiv(arvnResources, 3)');
  });

  it('routes M48 unshaded Assault bonus through one shared macro in both US and ARVN profiles', () => {
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

    const assertProfileUsesM48Macro = (profileId: string): void => {
      const profile = getParsedProfile(profileId);
      const stage = profile.stages.find((candidate: any) => candidate.stage === 'cap-m48-patton-bonus-removal');
      assert.ok(stage, `Expected ${profileId} M48 stage`);
      const refs = findDeep(stage.effects, (node: any) => node?.macro === 'cap-assault-m48-unshaded-bonus-removal');
      assert.equal(refs.length, 1, `Expected ${profileId} to call shared M48 macro exactly once`);
    };

    assertProfileUsesM48Macro('assault-us-profile');
    assertProfileUsesM48Macro('assault-arvn-profile');
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
});

/* eslint-enable @typescript-eslint/no-explicit-any */
