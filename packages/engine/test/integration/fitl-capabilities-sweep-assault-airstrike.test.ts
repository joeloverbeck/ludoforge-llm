import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, asTokenId, initialState, type GameState, type Token } from '../../src/kernel/index.js';
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

  it('caps Sweep space selection to 2 only for cap_caps shaded branch', () => {
    const us = getParsedProfile('sweep-us-profile');
    const arvn = getParsedProfile('sweep-arvn-profile');

    for (const profile of [us, arvn]) {
      const shadedChecks = findDeep(profile.stages, (node: any) =>
        node?.if?.when?.left?.ref === 'globalMarkerState' &&
        node?.if?.when?.left?.marker === 'cap_caps' &&
        node?.if?.when?.right === 'shaded',
      );
      assert.ok(shadedChecks.length >= 1);

      const hasMaxTwo = findDeep(shadedChecks[0], (node: any) => node?.chooseN?.max === 2);
      const hasMaxNinetyNine = findDeep(shadedChecks[0], (node: any) => node?.chooseN?.max === 99);
      assert.ok(hasMaxTwo.length >= 1, 'Expected cap_caps shaded branch to set max 2');
      assert.ok(hasMaxNinetyNine.length >= 1, 'Expected cap_caps else branch to preserve max 99');
    }
  });

  it('caps Assault space selection to 2 only for cap_abrams shaded branch', () => {
    const us = getParsedProfile('assault-us-profile');
    const arvn = getParsedProfile('assault-arvn-profile');

    for (const profile of [us, arvn]) {
      const shadedChecks = findDeep(profile.stages, (node: any) =>
        node?.if?.when?.left?.ref === 'globalMarkerState' &&
        node?.if?.when?.left?.marker === 'cap_abrams' &&
        node?.if?.when?.right === 'shaded',
      );
      assert.ok(shadedChecks.length >= 1);

      const hasMaxTwo = findDeep(shadedChecks[0], (node: any) => node?.chooseN?.max === 2);
      const hasMaxNinetyNine = findDeep(shadedChecks[0], (node: any) => node?.chooseN?.max === 99);
      assert.ok(hasMaxTwo.length >= 1, 'Expected cap_abrams shaded branch to set max 2');
      assert.ok(hasMaxNinetyNine.length >= 1, 'Expected cap_abrams else branch to preserve max 99');
    }
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
    const start = initialState(def, 1001, 2).state;
    const modifiedStart: GameState = {
      ...start,
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
    const start = initialState(def, 1002, 2).state;
    const modifiedStart: GameState = {
      ...start,
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
});

/* eslint-enable @typescript-eslint/no-explicit-any */
