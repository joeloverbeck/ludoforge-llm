import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import { applyMove, asActionId, initialState, type Move } from '../../src/kernel/index.js';
import { assertNoDiagnostics, assertNoErrors } from '../helpers/diagnostic-helpers.js';

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

describe('FITL insurgent operations integration', () => {
  it('compiles insurgent Rally/March/Attack/Terror operation profiles from fixture data', () => {
    const markdown = readCompilerFixture('fitl-operations-insurgent.md');
    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoErrors(parsed);
    assert.deepEqual(validatorDiagnostics, []);
    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(
      compiled.gameDef?.operationProfiles?.map((profile) => ({ id: profile.id, actionId: String(profile.actionId) })),
      [
        { id: 'rally-profile', actionId: 'rally' },
        { id: 'march-profile', actionId: 'march' },
        { id: 'attack-profile', actionId: 'attack' },
        { id: 'terror-profile', actionId: 'terror' },
      ],
    );
  });

  it('executes insurgent operations through compiled operationProfiles instead of fallback action effects', () => {
    const markdown = readCompilerFixture('fitl-operations-insurgent.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);

    const start = initialState(compiled.gameDef!, 101, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('rally'), params: {} },
      { actionId: asActionId('march'), params: {} },
      { actionId: asActionId('attack'), params: {} },
      { actionId: asActionId('terror'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    assert.equal(final.globalVars.insurgentResources, 2);
    assert.equal(final.globalVars.rallyCount, 1);
    assert.equal(final.globalVars.marchCount, 1);
    assert.equal(final.globalVars.attackCount, 1);
    assert.equal(final.globalVars.terrorCount, 1);
    assert.equal(final.globalVars.fallbackUsed, 0);
  });

  it('rejects attack when profile cost validation fails under partialExecution forbid', () => {
    const markdown = readCompilerFixture('fitl-operations-insurgent.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assertNoDiagnostics(compiled);
    assert.notEqual(compiled.gameDef, null);

    let state = initialState(compiled.gameDef!, 77, 2);
    state = {
      ...state,
      globalVars: {
        ...state.globalVars,
        insurgentResources: 1,
      },
    };

    assert.throws(
      () => applyMove(compiled.gameDef!, state, { actionId: asActionId('attack'), params: {} }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
            readonly partialExecutionMode?: string;
          };
        };

        assert.equal(details.reason, 'action is not legal in current state');
        return true;
      },
    );
  });
});
