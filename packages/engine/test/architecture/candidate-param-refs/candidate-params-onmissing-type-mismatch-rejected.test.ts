// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baselineAgents, compileCandidateParamsDoc } from './candidate-params-fixture.js';

describe('candidate.params onMissing type validation', () => {
  it('rejects constants that do not match the declared scalar type', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      idMismatch: {
        scopes: ['move'],
        weight: 1,
        value: {
          boolToNumber: {
            eq: [
              { ref: { 'candidate.params.mode': { onMissing: { kind: 'constant', value: 0 } } } },
              'A',
            ],
          },
        },
      },
    }));

    assert.equal(result.gameDef, null);
    assert.ok(result.diagnostics.some(
      (diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH',
    ));
  });

  it('rejects constants for idList candidate params', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      idListConstant: {
        scopes: ['move'],
        weight: 1,
        value: {
          boolToNumber: {
            in: [
              'alpha',
              { ref: { 'candidate.params.$targets': { onMissing: { kind: 'constant', value: 'alpha' } } } },
            ],
          },
        },
      },
    }));

    assert.equal(result.gameDef, null);
    assert.ok(result.diagnostics.some(
      (diagnostic) => diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAMS_ONMISSING_TYPE_MISMATCH',
    ));
  });
});
