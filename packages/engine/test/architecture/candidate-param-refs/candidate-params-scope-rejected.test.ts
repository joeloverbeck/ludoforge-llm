// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baselineAgents, candidateParamRef, compileCandidateParamsDoc } from './candidate-params-fixture.js';

describe('candidate.params scope validation', () => {
  it('rejects candidate params from microturn-scope considerations', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      microturnParam: {
        scopes: ['microturn'],
        weight: 1,
        value: { boolToNumber: { eq: [{ ref: candidateParamRef('mode') }, 'A'] } },
      },
    }));

    assert.equal(result.gameDef, null);
    assert.ok(result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAMS_SCOPE_INVALID'
        && diagnostic.path === 'doc.agents.library.considerations.microturnParam',
    ));
  });
});
