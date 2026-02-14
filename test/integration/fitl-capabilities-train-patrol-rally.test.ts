import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findDeep } from '../helpers/ast-search-helpers.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

type CapabilitySide = 'unshaded' | 'shaded';

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

  it('applies Patrol M48 shaded penalty through a shared roll-gated macro', () => {
    const { parsed } = compileProductionSpec();
    const macrosById = new Map((parsed.doc.effectMacros ?? []).map((macro: any) => [macro.id, macro]));

    const penaltyMacro = macrosById.get('cap-patrol-m48-shaded-moved-cube-penalty');
    assert.ok(penaltyMacro, 'Expected shared patrol M48 penalty macro');

    const hasShadedGuard = findDeep(penaltyMacro.effects ?? [], (node: any) =>
      node?.if?.when?.left?.ref === 'globalMarkerState' &&
      node?.if?.when?.left?.marker === 'cap_m48Patton' &&
      node?.if?.when?.right === 'shaded',
    );
    const hasRoll = findDeep(penaltyMacro.effects ?? [], (node: any) => node?.rollRandom?.bind === '$m48PatrolDie');
    const hasPenaltyRemoval = findDeep(penaltyMacro.effects ?? [], (node: any) =>
      node?.moveToken?.to?.zoneExpr?.concat !== undefined,
    );

    assert.ok(hasShadedGuard.length >= 1, 'Expected cap_m48Patton shaded guard in patrol penalty macro');
    assert.ok(hasRoll.length >= 1, 'Expected patrol penalty macro to include rollRandom');
    assert.ok(hasPenaltyRemoval.length >= 1, 'Expected patrol penalty macro to move one moved cube to Available');

    for (const profileId of ['patrol-us-profile', 'patrol-arvn-profile']) {
      const profile = getParsedProfile(profileId);
      const macroRefs = findDeep(profile.stages, (node: any) => node?.macro === 'cap-patrol-m48-shaded-moved-cube-penalty');
      assert.ok(macroRefs.length >= 1, `Expected ${profileId} to use cap-patrol-m48-shaded-moved-cube-penalty`);
    }
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
