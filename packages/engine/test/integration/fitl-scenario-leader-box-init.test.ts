import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, parseGameSpec } from '../../src/cnl/index.js';
import { initialState } from '../../src/kernel/index.js';
import { assertNoErrors } from '../helpers/diagnostic-helpers.js';
import { readProductionSpec } from '../helpers/production-spec-helpers.js';

function compileScenarioGameDef(scenarioId: 'fitl-scenario-full' | 'fitl-scenario-short' | 'fitl-scenario-medium') {
  const markdown = readProductionSpec();
  const parsed = parseGameSpec(markdown);
  assertNoErrors(parsed);
  assert.notEqual(parsed.doc.metadata, null, 'Expected production spec metadata');

  const metadata = parsed.doc.metadata!;

  const docWithScenario = {
    ...parsed.doc,
    metadata: {
      ...metadata,
      defaultScenarioAssetId: scenarioId,
    },
  };

  const compiled = compileGameSpecToGameDef(docWithScenario, { sourceMap: parsed.sourceMap });
  const compileErrors = compiled.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  assert.deepEqual(
    compileErrors,
    [],
    `Expected compile without errors for ${scenarioId}; got: ${compileErrors.map((d) => `${d.code}@${d.path}`).join(', ')}`,
  );
  assert.notEqual(compiled.gameDef, null, `Expected gameDef for ${scenarioId}`);
  return compiled.gameDef!;
}

describe('FITL scenario leader box initialization', () => {
  it('initializes scenario track and global marker state by selected scenario', () => {
    const scenarios = [
      {
        id: 'fitl-scenario-full',
        expectedLeaderBox: 0,
        expectedLeader: 'minh',
        expectedMarkerStates: [] as ReadonlyArray<readonly [string, string]>,
      },
      {
        id: 'fitl-scenario-short',
        expectedLeaderBox: 2,
        expectedLeader: 'youngTurks',
        expectedMarkerStates: [['cap_aaa', 'shaded']] as ReadonlyArray<readonly [string, string]>,
      },
      {
        id: 'fitl-scenario-medium',
        expectedLeaderBox: 3,
        expectedLeader: 'ky',
        expectedMarkerStates: [
          ['cap_aaa', 'shaded'],
          ['cap_mainForceBns', 'shaded'],
          ['cap_sa2s', 'shaded'],
          ['cap_searchAndDestroy', 'shaded'],
          ['cap_arcLight', 'unshaded'],
          ['cap_m48Patton', 'unshaded'],
        ] as ReadonlyArray<readonly [string, string]>,
      },
    ] as const;

    for (const scenario of scenarios) {
      const def = compileScenarioGameDef(scenario.id);
      const state = initialState(def, 9150, 4).state;
      assert.notEqual(state.globalMarkers, undefined, `Expected globalMarkers for ${scenario.id}`);
      const globalMarkers = state.globalMarkers ?? {};
      assert.equal(
        Number(state.globalVars.leaderBoxCardCount),
        scenario.expectedLeaderBox,
        `Expected leaderBoxCardCount=${scenario.expectedLeaderBox} for ${scenario.id}`,
      );
      assert.equal(String(globalMarkers.activeLeader), scenario.expectedLeader, `Expected activeLeader for ${scenario.id}`);
      for (const [markerId, markerState] of scenario.expectedMarkerStates) {
        assert.equal(String(globalMarkers[markerId]), markerState, `Expected ${markerId}=${markerState} for ${scenario.id}`);
      }
    }
  });
});
