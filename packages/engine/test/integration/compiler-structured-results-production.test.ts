import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CompileSectionResults } from '../../src/cnl/index.js';
import { compileProductionSpec } from '../helpers/production-spec-helpers.js';

describe('compiler structured section results production coverage', () => {
  it('production FITL section values align with gameDef for populated section fields', () => {
    const production = compileProductionSpec();
    const { compiled } = production;

    assert.notEqual(compiled.gameDef, null);
    assert.equal(compiled.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);

    const keys: ReadonlyArray<keyof CompileSectionResults> = [
      'metadata',
      'constants',
      'globalVars',
      'globalMarkerLattices',
      'perPlayerVars',
      'zones',
      'tokenTypes',
      'setup',
      'turnStructure',
      'turnOrder',
      'actionPipelines',
      'derivedMetrics',
      'terminal',
      'actions',
      'triggers',
      'eventDecks',
    ];

    for (const key of keys) {
      const sectionValue = compiled.sections[key];
      if (sectionValue !== null) {
        assert.deepEqual(sectionValue, compiled.gameDef?.[key]);
      }
    }
  });
});
