import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import { applyMove, asActionId, initialState, type Move } from '../../src/kernel/index.js';

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

describe('FITL US/ARVN special activities integration', () => {
  it('compiles US/ARVN special-activity operation profiles with linked windows from fixture data', () => {
    const markdown = readCompilerFixture('fitl-special-us-arvn.md');
    const parsed = parseGameSpec(markdown);
    const validatorDiagnostics = validateGameSpec(parsed.doc, { sourceMap: parsed.sourceMap });
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.equal(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length, 0);
    assert.deepEqual(validatorDiagnostics, []);
    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);
    assert.deepEqual(
      compiled.gameDef?.operationProfiles?.map((profile) => ({
        id: profile.id,
        actionId: String(profile.actionId),
        windows: profile.linkedSpecialActivityWindows ?? [],
      })),
      [
        { id: 'advise-profile', actionId: 'advise', windows: ['us-special-window'] },
        { id: 'air-lift-profile', actionId: 'airLift', windows: ['us-special-window'] },
        { id: 'air-strike-profile', actionId: 'airStrike', windows: ['us-special-window'] },
        { id: 'govern-profile', actionId: 'govern', windows: ['arvn-special-window'] },
        { id: 'transport-profile', actionId: 'transport', windows: ['arvn-special-window'] },
        { id: 'raid-profile', actionId: 'raid', windows: ['arvn-special-window'] },
      ],
    );
  });

  it('executes US/ARVN special activities through compiled operationProfiles instead of fallback action effects', () => {
    const markdown = readCompilerFixture('fitl-special-us-arvn.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);

    const start = initialState(compiled.gameDef!, 113, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('advise'), params: {} },
      { actionId: asActionId('airLift'), params: {} },
      { actionId: asActionId('airStrike'), params: {} },
      { actionId: asActionId('govern'), params: {} },
      { actionId: asActionId('transport'), params: {} },
      { actionId: asActionId('raid'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    assert.equal(final.globalVars.usResources, 4);
    assert.equal(final.globalVars.arvnResources, 2);
    assert.equal(final.globalVars.adviseCount, 1);
    assert.equal(final.globalVars.airLiftCount, 1);
    assert.equal(final.globalVars.airStrikeCount, 1);
    assert.equal(final.globalVars.governCount, 1);
    assert.equal(final.globalVars.transportCount, 1);
    assert.equal(final.globalVars.raidCount, 1);
    assert.equal(final.globalVars.fallbackUsed, 0);
  });

  it('rejects airStrike when cross-faction cost validation fails under partialExecution forbid', () => {
    const markdown = readCompilerFixture('fitl-special-us-arvn.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);

    let state = initialState(compiled.gameDef!, 211, 2);
    state = {
      ...state,
      globalVars: {
        ...state.globalVars,
        arvnResources: 0,
      },
    };

    assert.throws(
      () => applyMove(compiled.gameDef!, state, { actionId: asActionId('airStrike'), params: {} }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
            readonly partialExecutionMode?: string;
          };
        };

        assert.equal(details.reason, 'operation profile cost validation failed');
        assert.equal(details.metadata?.code, 'OPERATION_COST_BLOCKED');
        assert.equal(details.metadata?.profileId, 'air-strike-profile');
        assert.equal(details.metadata?.partialExecutionMode, 'forbid');
        return true;
      },
    );
  });
});
