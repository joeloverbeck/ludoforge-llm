import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyMove,
  asActionId,
  asPlayerId,
  asTokenId,
  initialState,
  pickDeterministicChoiceValue,
  resolveMoveDecisionSequence,
  type GameState,
  type Token,
} from '../../src/kernel/index.js';
import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { clearAllZones } from '../helpers/isolated-state-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

type CapabilitySide = 'unshaded' | 'shaded';

const makeToken = (id: string, type: string, faction: string, extra?: Record<string, unknown>): Token => ({
  id: asTokenId(id),
  type,
  props: { faction, ...extra },
});

const countTokens = (state: GameState, zone: string, predicate: (token: Token) => boolean): number =>
  (state.zones[zone] ?? []).filter(predicate).length;

function getParsedProfile(profileId: string): any {
  const { parsed } = compileProductionSpec();
  const profile = parsed.doc.actionPipelines?.find((candidate: { id: string }) => candidate.id === profileId);
  assert.ok(profile, `Expected ${profileId}`);
  return profile;
}

function collectReferencedMacros(profile: any, macrosById: Map<string, any>): any[] {
  const seen = new Set<string>();
  const queue: string[] = findDeep(profile.stages ?? [], (node: any) => typeof node?.macro === 'string').map((node: any) => node.macro);
  const defs: any[] = [];

  while (queue.length > 0) {
    const macroId = queue.shift()!;
    if (seen.has(macroId)) continue;
    seen.add(macroId);

    const def = macrosById.get(macroId);
    if (def === undefined) continue;
    defs.push(def);

    const nestedRefs = findDeep(def.effects ?? [], (node: any) => typeof node?.macro === 'string').map((node: any) => node.macro);
    queue.push(...nestedRefs);
  }

  return defs;
}

function collectMarkerSides(profileId: string, marker: string): Set<CapabilitySide> {
  const { parsed } = compileProductionSpec();
  const profile = getParsedProfile(profileId);
  const macrosById = new Map((parsed.doc.effectMacros ?? []).map((macro: any) => [macro.id, macro]));
  const macroDefs = collectReferencedMacros(profile, macrosById);

  const sideValues = new Set<CapabilitySide>();
  const searchRoots = [profile.stages ?? [], ...macroDefs.map((macro) => macro.effects ?? [])];
  for (const root of searchRoots) {
    const checks = findDeep(root, (node: any) =>
      node?.if?.when !== undefined &&
      JSON.stringify(node.if.when).includes('"ref":"globalMarkerState"') &&
      JSON.stringify(node.if.when).includes(`"marker":"${marker}"`),
    );
    for (const check of checks) {
      const text = JSON.stringify(check.if.when);
      if (text.includes('"unshaded"')) sideValues.add('unshaded');
      if (text.includes('"shaded"')) sideValues.add('shaded');
    }
  }

  return sideValues;
}

describe('FITL capability branches (Train/Patrol/Rally)', () => {
  it('compiles production spec with train/patrol/rally capability side checks', () => {
    const { parsed, compiled } = compileProductionSpec();
    assertNoErrors(parsed);
    assert.notEqual(compiled.gameDef, null);

    const checks: Array<{ profileId: string; marker: string; expectedSide: CapabilitySide; forbiddenSide?: CapabilitySide }> = [
      { profileId: 'train-us-profile', marker: 'cap_caps', expectedSide: 'unshaded', forbiddenSide: 'shaded' },
      { profileId: 'train-us-profile', marker: 'cap_cords', expectedSide: 'unshaded' },
      { profileId: 'train-us-profile', marker: 'cap_cords', expectedSide: 'shaded' },
      { profileId: 'train-arvn-profile', marker: 'cap_caps', expectedSide: 'unshaded', forbiddenSide: 'shaded' },
      { profileId: 'train-arvn-profile', marker: 'cap_cords', expectedSide: 'unshaded' },
      { profileId: 'train-arvn-profile', marker: 'cap_cords', expectedSide: 'shaded' },
      { profileId: 'patrol-us-profile', marker: 'cap_m48Patton', expectedSide: 'shaded', forbiddenSide: 'unshaded' },
      { profileId: 'patrol-arvn-profile', marker: 'cap_m48Patton', expectedSide: 'shaded', forbiddenSide: 'unshaded' },
      { profileId: 'rally-nva-profile', marker: 'cap_aaa', expectedSide: 'unshaded', forbiddenSide: 'shaded' },
      { profileId: 'rally-nva-profile', marker: 'cap_sa2s', expectedSide: 'shaded', forbiddenSide: 'unshaded' },
      { profileId: 'rally-vc-profile', marker: 'cap_cadres', expectedSide: 'shaded', forbiddenSide: 'unshaded' },
    ];

    for (const check of checks) {
      const sides = collectMarkerSides(check.profileId, check.marker);
      assert.ok(
        sides.has(check.expectedSide),
        `Expected ${check.profileId} to check ${check.marker}=${check.expectedSide}; found sides: ${[...sides].join(', ') || '(none)'}`,
      );
      if (check.forbiddenSide !== undefined) {
        assert.equal(
          sides.has(check.forbiddenSide),
          false,
          `Did not expect ${check.profileId} to check ${check.marker}=${check.forbiddenSide}`,
        );
      }
    }
  });

  it('declares m48PatrolMoved as a boolean runtime prop on Patrol-moved cube types', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const expectedPieceTypes = ['us-troops', 'arvn-troops', 'arvn-police'];
    for (const pieceTypeId of expectedPieceTypes) {
      const tokenType = def.tokenTypes.find((candidate) => candidate.id === pieceTypeId);
      assert.notEqual(tokenType, undefined, `Expected token type ${pieceTypeId} in compiled GameDef`);
      assert.equal(
        tokenType!.props.m48PatrolMoved,
        'boolean',
        `Expected ${pieceTypeId} to declare m48PatrolMoved as boolean`,
      );
    }
  });

  it('uses CORDS unshaded to allow 2 Train sub-action spaces and preserves default max 1', () => {
    const trainUs = getParsedProfile('train-us-profile');
    const trainArvn = getParsedProfile('train-arvn-profile');

    for (const profile of [trainUs, trainArvn]) {
      const cordsBranch = findDeep(profile.stages, (node: any) =>
        node?.if?.when?.left?.ref === 'globalMarkerState' &&
        node?.if?.when?.left?.marker === 'cap_cords' &&
        node?.if?.when?.right === 'unshaded',
      );
      assert.ok(cordsBranch.length >= 1, `Expected cap_cords unshaded branch in ${profile.id}`);

      const hasMaxTwo = findDeep(cordsBranch[0], (node: any) => node?.chooseN?.bind === '$subActionSpaces' && node?.chooseN?.max === 2);
      const hasMaxOneFallback = findDeep(cordsBranch[0], (node: any) => node?.chooseN?.bind === '$subActionSpaces' && node?.chooseN?.max === 1);
      assert.ok(hasMaxTwo.length >= 1, `Expected cap_cords unshaded to set max 2 in ${profile.id}`);
      assert.ok(hasMaxOneFallback.length >= 1, `Expected cap_cords fallback to preserve max 1 in ${profile.id}`);
    }
  });

  it('applies Patrol M48 shaded penalty through a shared post-patrol up-to-2 moved-cube macro', () => {
    const { parsed } = compileProductionSpec();
    const macrosById = new Map((parsed.doc.effectMacros ?? []).map((macro: any) => [macro.id, macro]));

    const penaltyMacro = macrosById.get('cap-patrol-m48-shaded-moved-cube-penalty');
    assert.ok(penaltyMacro, 'Expected shared patrol M48 penalty macro');

    const hasShadedGuard = findDeep(penaltyMacro.effects ?? [], (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_m48Patton' &&
      node?.if?.when?.right === 'shaded',
    );
    const hasRoll = findDeep(penaltyMacro.effects ?? [], (node: any) => node?.rollRandom !== undefined);
    const hasChooseUpToTwo = findDeep(penaltyMacro.effects ?? [], (node: any) =>
      node?.chooseN?.bind === '$m48PenaltyCubes' && node?.chooseN?.max === 2,
    );
    const hasUsToCasualties = findDeep(penaltyMacro.effects ?? [], (node: any) =>
      node?.moveToken?.to === 'casualties-US:none',
    );
    const hasArvnToAvailable = findDeep(penaltyMacro.effects ?? [], (node: any) =>
      node?.moveToken?.to === 'available-ARVN:none',
    );
    const hasCleanup = findDeep(penaltyMacro.effects ?? [], (node: any) =>
      node?.setTokenProp?.prop === 'm48PatrolMoved' && node?.setTokenProp?.value === false,
    );

    assert.ok(hasShadedGuard.length >= 1, 'Expected cap_m48Patton shaded guard in patrol penalty macro');
    assert.equal(hasRoll.length, 0, 'Expected patrol penalty macro to avoid die-roll gating');
    assert.ok(hasChooseUpToTwo.length >= 1, 'Expected patrol penalty macro to choose up to 2 moved cubes');
    assert.ok(hasUsToCasualties.length >= 1, 'Expected patrol penalty macro to send US cubes to Casualties');
    assert.ok(hasArvnToAvailable.length >= 1, 'Expected patrol penalty macro to send ARVN cubes to Available');
    assert.ok(hasCleanup.length >= 1, 'Expected patrol penalty macro to clear temporary moved-cube flags');

    const hasNvaChooser = findDeep(penaltyMacro.effects ?? [], (node: any) =>
      node?.chooseN?.bind === '$m48PenaltyCubes' && node?.chooseN?.chooser === 'NVA',
    );
    assert.ok(hasNvaChooser.length >= 1, 'Expected M48 patrol penalty chooseN to have NVA as chooser');

    for (const profileId of ['patrol-us-profile', 'patrol-arvn-profile']) {
      const profile = getParsedProfile(profileId);
      const penaltyStage = profile.stages.find((stage: any) => stage?.stage === 'cap-m48-patrol-penalty');
      assert.ok(penaltyStage, `Expected ${profileId} to include cap-m48-patrol-penalty stage`);
      const macroRefs = findDeep(penaltyStage.effects, (node: any) => node?.macro === 'cap-patrol-m48-shaded-moved-cube-penalty');
      assert.ok(macroRefs.length >= 1, `Expected ${profileId} penalty stage to call cap-patrol-m48-shaded-moved-cube-penalty`);
    }
  });

  it('M48 shaded patrol penalty compiles chooser NVA to player id 2 in GameDef', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;

    const m48PenaltyChooseN = findDeep([def], (node: any) =>
      node?.chooseN?.bind?.includes('m48PenaltyCubes') && node?.chooseN?.chooser !== undefined,
    );
    assert.ok(m48PenaltyChooseN.length >= 1, 'Expected compiled GameDef to contain M48 penalty chooseN with chooser');

    const chooser = m48PenaltyChooseN[0]?.chooseN?.chooser;
    assert.deepEqual(chooser, { id: 2 }, 'Expected chooser NVA to compile to { id: 2 }');
  });

  it('M48 shaded after US Patrol removes up to 2 moved US cubes to Casualties', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const locA = 'loc-saigon-can-tho:none';
    const locB = 'loc-da-nang-qui-nhon:none';
    const start = clearAllZones(initialState(def, 22018, 4).state);
    const configured: GameState = {
      ...start,
      activePlayer: asPlayerId(0),
      globalMarkers: {
        ...start.globalMarkers,
        cap_m48Patton: 'shaded',
      },
      globalVars: {
        ...start.globalVars,
        nvaResources: 3,
      },
      zones: {
        ...start.zones,
        [locA]: [makeToken('m48-us-a', 'troops', 'US', { type: 'troops' }), makeToken('m48-us-b', 'troops', 'US', { type: 'troops' })],
        [locB]: [makeToken('m48-us-c', 'troops', 'US', { type: 'troops' })],
      },
    };

    const baseMove = {
      actionId: asActionId('patrol'),
      params: {
        targetLoCs: [locA, locB],
        $assaultLoCs: [],
      },
    };
    const resolved = resolveMoveDecisionSequence(def, configured, baseMove, {
      choose: (request) => {
        if (request.name === 'targetLoCs') {
          return [locA, locB];
        }
        if (request.name.includes('assaultLoCs')) {
          return [];
        }
        if (request.name.includes('$movingCubes')) {
          return request.options.map((option) => option.value as string | number | boolean);
        }
        if (request.name.includes('m48PenaltyCubes')) {
          assert.equal(
            request.decisionPlayer,
            2,
            'M48 penalty chooseN should route decision to NVA (player 2) via cross-seat chooser',
          );
          return request.options.slice(0, 2).map((option) => option.value as string | number | boolean);
        }
        return pickDeterministicChoiceValue(request);
      },
    });
    assert.equal(resolved.complete, true, 'Expected US Patrol decision sequence to resolve completely');
    const final = applyMove(def, configured, resolved.move).state;

    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US' && token.type === 'troops'),
      2,
      'M48 shaded should send up to two moved US cubes to Casualties after US Patrol',
    );
    assert.equal(
      countTokens(final, locA, (token) => token.props.faction === 'US' && token.type === 'troops')
        + countTokens(final, locB, (token) => token.props.faction === 'US' && token.type === 'troops'),
      1,
      'M48 shaded should remove only two of three moved US cubes total across all selected LoCs',
    );
  });

  it('M48 shaded after ARVN Patrol sends moved ARVN cubes to ARVN Available, not Casualties', () => {
    const { compiled } = compileProductionSpec();
    assert.notEqual(compiled.gameDef, null);
    const def = compiled.gameDef!;
    const loc = 'loc-saigon-can-tho:none';
    const start = clearAllZones(initialState(def, 22019, 4).state);
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
        cap_m48Patton: 'shaded',
      },
      zones: {
        ...start.zones,
        'saigon:none': [
          makeToken('m48-arvn-a', 'troops', 'ARVN', { type: 'troops' }),
          makeToken('m48-arvn-b', 'police', 'ARVN', { type: 'police' }),
        ],
      },
    };

    const baseMove = {
      actionId: asActionId('patrol'),
      params: {
        targetLoCs: [loc],
        $assaultLoCs: [],
      },
    };
    const resolved = resolveMoveDecisionSequence(def, configured, baseMove, {
      choose: (request) => {
        if (request.name === 'targetLoCs') {
          return [loc];
        }
        if (request.name.includes('assaultLoCs')) {
          return [];
        }
        if (request.name.includes('$movingCubes')) {
          return request.options.map((option) => option.value as string | number | boolean);
        }
        if (request.name.includes('m48PenaltyCubes')) {
          return request.options.map((option) => option.value as string | number | boolean);
        }
        return pickDeterministicChoiceValue(request);
      },
    });
    assert.equal(resolved.complete, true, 'Expected ARVN Patrol decision sequence to resolve completely');
    const final = applyMove(def, configured, resolved.move).state;

    assert.equal(
      countTokens(final, 'available-ARVN:none', (token) => token.props.faction === 'ARVN' && (token.type === 'troops' || token.type === 'police')),
      2,
      'M48 shaded should route moved ARVN cubes to ARVN Available',
    );
    assert.equal(
      countTokens(final, 'casualties-US:none', (token) => token.props.faction === 'US'),
      0,
      'M48 shaded ARVN Patrol should not add US casualties',
    );
  });

  it('encodes Rally trail and cadres branches with side-specific constraints', () => {
    const rallyNva = getParsedProfile('rally-nva-profile');
    const rallyVc = getParsedProfile('rally-vc-profile');

    const aaaUnshadedBranch = findDeep(rallyNva.stages, (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_aaa' &&
      node?.if?.when?.right === 'unshaded',
    );
    assert.ok(aaaUnshadedBranch.length >= 1, 'Expected cap_aaa unshaded branch in rally-nva trail improvement');
    const trailMaxOne = findDeep(aaaUnshadedBranch[0], (node: any) => node?.chooseN?.bind === '$trailImproveSpaces' && node?.chooseN?.max === 1);
    assert.ok(trailMaxOne.length >= 1, 'Expected cap_aaa unshaded to cap Rally trail-improvement spaces at 1');

    const sa2sShadedBranch = findDeep(rallyNva.stages, (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_sa2s' &&
      node?.if?.when?.right === 'shaded',
    );
    assert.ok(sa2sShadedBranch.length >= 1, 'Expected cap_sa2s shaded branch in rally-nva trail improvement');

    const cadresShadedBranch = findDeep(rallyVc.stages, (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_cadres' &&
      node?.if?.when?.right === 'shaded',
    );
    assert.ok(cadresShadedBranch.length >= 1, 'Expected cap_cadres shaded branch in rally-vc');

    const cadresAgitateCap = findDeep(cadresShadedBranch[0], (node: any) => node?.chooseN?.bind === '$cadresAgitateSpaces' && node?.chooseN?.max === 1);
    const cadresShift = findDeep(cadresShadedBranch[0], (node: any) => node?.shiftMarker?.marker === 'supportOpposition' && node?.shiftMarker?.delta === -1);
    assert.ok(cadresAgitateCap.length >= 1, 'Expected cap_cadres shaded to limit Rally agitate bonus to 1 space');
    assert.ok(cadresShift.length >= 1, 'Expected cap_cadres shaded to add Rally agitate shift effect');
  });
});

/* eslint-enable @typescript-eslint/no-explicit-any */
