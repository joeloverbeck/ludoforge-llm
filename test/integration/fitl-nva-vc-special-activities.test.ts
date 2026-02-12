import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec, validateGameSpec } from '../../src/cnl/index.js';
import { applyMove, asActionId, initialState, type Move } from '../../src/kernel/index.js';

const readCompilerFixture = (name: string): string =>
  readFileSync(join(process.cwd(), 'test', 'fixtures', 'cnl', 'compiler', name), 'utf8');

describe('FITL NVA/VC special activities integration', () => {
  it('compiles NVA/VC special-activity profiles and ambush targeting metadata from fixture data', () => {
    const markdown = readCompilerFixture('fitl-special-nva-vc.md');
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
        { id: 'infiltrate-profile', actionId: 'infiltrate', windows: ['nva-special-window'] },
        { id: 'bombard-profile', actionId: 'bombard', windows: ['nva-special-window'] },
        { id: 'nva-ambush-profile', actionId: 'ambushNva', windows: ['nva-special-window'] },
        { id: 'tax-profile', actionId: 'tax', windows: ['vc-special-window'] },
        { id: 'subvert-profile', actionId: 'subvert', windows: ['vc-special-window'] },
        { id: 'vc-ambush-profile', actionId: 'ambushVc', windows: ['vc-special-window'] },
      ],
    );

    const nvaAmbush = compiled.gameDef!.operationProfiles!.find((profile) => profile.id === 'nva-ambush-profile');
    const vcAmbush = compiled.gameDef!.operationProfiles!.find((profile) => profile.id === 'vc-ambush-profile');
    assert.equal(nvaAmbush?.targeting.tieBreak, 'basesLast');
    assert.equal(vcAmbush?.targeting.tieBreak, 'lexicographicSpaceId');
  });

  it('executes NVA/VC special activities through compiled operationProfiles instead of fallback action effects', () => {
    const markdown = readCompilerFixture('fitl-special-nva-vc.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);

    const start = initialState(compiled.gameDef!, 131, 2);
    const sequence: readonly Move[] = [
      { actionId: asActionId('infiltrate'), params: {} },
      { actionId: asActionId('bombard'), params: {} },
      { actionId: asActionId('ambushNva'), params: {} },
      { actionId: asActionId('tax'), params: {} },
      { actionId: asActionId('subvert'), params: {} },
      { actionId: asActionId('ambushVc'), params: {} },
    ];

    const final = sequence.reduce((state, move) => applyMove(compiled.gameDef!, state, move).state, start);

    assert.equal(final.globalVars.nvaResources, 2);
    assert.equal(final.globalVars.vcResources, 1);
    assert.equal(final.globalVars.infiltrateCount, 1);
    assert.equal(final.globalVars.bombardCount, 1);
    assert.equal(final.globalVars.nvaAmbushCount, 1);
    assert.equal(final.globalVars.taxCount, 1);
    assert.equal(final.globalVars.subvertCount, 1);
    assert.equal(final.globalVars.vcAmbushCount, 1);
    assert.equal(final.globalVars.fallbackUsed, 0);
  });

  it('rejects infiltrate when profile legality fails', () => {
    const markdown = readCompilerFixture('fitl-special-nva-vc.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);

    let state = initialState(compiled.gameDef!, 313, 2);
    state = {
      ...state,
      globalVars: {
        ...state.globalVars,
        nvaResources: 1,
      },
    };

    assert.throws(
      () => applyMove(compiled.gameDef!, state, { actionId: asActionId('infiltrate'), params: {} }),
      (error: unknown) => {
        const details = error as {
          readonly reason?: string;
          readonly metadata?: {
            readonly code?: string;
            readonly profileId?: string;
          };
        };

        assert.equal(details.reason, 'action is not legal in current state');
        return true;
      },
    );
  });

  it('rejects subvert when profile cost validation fails under partialExecution forbid', () => {
    const markdown = readCompilerFixture('fitl-special-nva-vc.md');
    const parsed = parseGameSpec(markdown);
    const compiled = compileGameSpecToGameDef(parsed.doc, { sourceMap: parsed.sourceMap });

    assert.deepEqual(compiled.diagnostics, []);
    assert.notEqual(compiled.gameDef, null);

    let state = initialState(compiled.gameDef!, 227, 2);
    state = {
      ...state,
      globalVars: {
        ...state.globalVars,
        vcResources: 1,
        nvaResources: 2,
      },
    };

    assert.throws(
      () => applyMove(compiled.gameDef!, state, { actionId: asActionId('subvert'), params: {} }),
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
