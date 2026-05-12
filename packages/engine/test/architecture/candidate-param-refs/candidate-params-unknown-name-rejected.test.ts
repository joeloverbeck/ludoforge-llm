// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baselineAgents, candidateParamRef, compileCandidateParamsDoc } from './candidate-params-fixture.js';

describe('candidate.params name validation', () => {
  it('rejects unknown param names', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      missingParam: {
        scopes: ['move'],
        weight: 1,
        value: { boolToNumber: { eq: [{ ref: candidateParamRef('missingName') }, 'A'] } },
      },
    }));

    assert.equal(result.gameDef, null);
    assert.ok(result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN'
        && diagnostic.path === 'doc.agents.library.considerations.missingParam.value.boolToNumber.eq.0.ref',
    ));
  });
});
