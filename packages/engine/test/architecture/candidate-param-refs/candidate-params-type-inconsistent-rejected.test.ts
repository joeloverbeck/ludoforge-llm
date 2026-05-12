// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baselineAgents, createCandidateParamsDoc } from './candidate-params-fixture.js';
import { compileGameSpecToGameDef } from '../../../src/cnl/index.js';

describe('candidate.params type consistency validation', () => {
  it('rejects refs whose param defs were dropped after cross-action type inconsistency', () => {
    const doc = createCandidateParamsDoc(baselineAgents({
      inconsistent: {
        scopes: ['move'],
        weight: 1,
        value: { boolToNumber: { eq: [{ ref: 'candidate.params.paramX' }, 'A'] } },
      },
    }));
    assert.ok(doc.actions !== null);
    const result = compileGameSpecToGameDef({
      ...doc,
      actions: [
        {
          ...doc.actions[0]!,
          params: [{ name: 'paramX', domain: { query: 'enums', values: ['A', 'B'] } }],
        },
        {
          ...doc.actions[1]!,
          params: [{ name: 'paramX', domain: { query: 'intsInRange', min: 1, max: 2 } }],
        },
      ],
    });

    assert.equal(result.gameDef, null);
    assert.ok(result.diagnostics.some(
      (diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAMS_TYPE_INCONSISTENT',
    ));
  });
});
