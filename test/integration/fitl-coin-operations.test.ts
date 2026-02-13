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
});
