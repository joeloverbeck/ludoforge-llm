import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import { applyMove, asActionId, initialState, type Move } from '../../src/kernel/index.js';

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

describe('FITL COIN operations integration', () => {
  it('compiles COIN Train/Patrol/Sweep/Assault operation profiles from fixture data', () => {
    const markdown = readCompilerFixture('fitl-operations-coin.md');
    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(validatorDiagnostics, []);
    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(
      compiled.gameDef?.operationProfiles?.map((profile) => ({ id: profile.id, actionId: String(profile.actionId) })),
      [
        { id: 'train-us-profile', actionId: 'train' },
        { id: 'train-arvn-profile', actionId: 'train' },
        { id: 'patrol-profile', actionId: 'patrol' },
        { id: 'sweep-profile', actionId: 'sweep' },
        { id: 'assault-profile', actionId: 'assault' },
      ],
    );
  });

  it('executes stub COIN operations through compiled operationProfiles instead of fallback action effects', () => {
    const markdown = readCompilerFixture('fitl-operations-coin.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);

    // Train requires complex params (chooseN/chooseOne decisions) — tested separately.
    // Patrol, Sweep, Assault are stubs that take empty params.
    const start = initialState(compiled.gameDef!, 73, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('patrol'), params: {} },
      { actionId: asActionId('sweep'), params: {} },
      { actionId: asActionId('assault'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    // coinResources: 10 - 2 (patrol) - 1 (sweep) - 3 (assault) = 4
    assert.equal(final.globalVars.coinResources, 4);
    assert.equal(final.globalVars.patrolCount, 1);
    assert.equal(final.globalVars.sweepCount, 1);
    assert.equal(final.globalVars.assaultCount, 1);
    assert.equal(final.globalVars.fallbackUsed, 0);
  });

  describe('train-arvn-profile structure', () => {
    const getArvnProfile = () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);
      const profile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'train-arvn-profile');
      assert.ok(profile, 'train-arvn-profile must exist');
      return profile;
    };

    it('compiles train-arvn-profile without diagnostics', () => {
      getArvnProfile();
    });

    it('has three resolution stages: select-spaces, resolve-per-space, sub-action', () => {
      const profile = getArvnProfile();
      assert.deepEqual(
        profile.resolution.map((s) => s.stage),
        ['select-spaces', 'resolve-per-space', 'sub-action'],
      );
    });

    it('uses actionId train', () => {
      const profile = getArvnProfile();
      assert.equal(String(profile.actionId), 'train');
    });

    it('has legality when: true (always legal)', () => {
      const profile = getArvnProfile();
      assert.equal(profile.legality.when, true);
    });

    it('has no top-level cost (cost is per-space in resolution)', () => {
      const profile = getArvnProfile();
      assert.equal(profile.cost.spend, undefined);
    });

    it('forbids partial execution', () => {
      const profile = getArvnProfile();
      assert.equal(profile.partialExecution.mode, 'forbid');
    });
  });

  describe('applicability dispatch for train profiles', () => {
    it('compiles applicability conditions for both train profiles', () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);

      const usProfile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'train-us-profile');
      const arvnProfile = compiled.gameDef!.operationProfiles!.find((p) => p.id === 'train-arvn-profile');
      assert.ok(usProfile, 'train-us-profile must exist');
      assert.ok(arvnProfile, 'train-arvn-profile must exist');

      assert.deepEqual(usProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: '0' });
      assert.deepEqual(arvnProfile.applicability, { op: '==', left: { ref: 'activePlayer' }, right: '1' });
    });

    it('profiles without applicability (patrol/sweep/assault) remain undefined', () => {
      const markdown = readCompilerFixture('fitl-operations-coin.md');
      const parsed = parseGameSpec(markdown);
      const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });
      assert.deepEqual(compiled.diagnostics, []);

      for (const id of ['patrol-profile', 'sweep-profile', 'assault-profile']) {
        const profile = compiled.gameDef!.operationProfiles!.find((p) => p.id === id);
        assert.ok(profile, `${id} must exist`);
        assert.equal(profile.applicability, undefined);
      }
    });
  });
});
