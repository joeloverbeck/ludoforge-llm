// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baselineAgents, candidateParamRef, compileCandidateParamsDoc } from './candidate-params-fixture.js';

describe('candidate.params parser namespace', () => {
  it('rejects retired singular refs and compiles plural refs', () => {
    const singular = compileCandidateParamsDoc(baselineAgents({
      retired: {
        scopes: ['move'],
        weight: 1,
        value: { boolToNumber: { eq: [{ ref: 'candidate.param.mode' }, 'A'] } },
      },
    }));

    assert.equal(singular.gameDef, null);
    assert.ok(singular.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAM_REF_INVALID'
        && diagnostic.message.includes('candidate.param.* refs are removed'),
    ));

    const plural = compileCandidateParamsDoc(baselineAgents({
      preferModeA: {
        scopes: ['move'],
        weight: 1,
        value: { boolToNumber: { eq: [{ ref: candidateParamRef('mode') }, 'A'] } },
      },
    }));

    assert.equal(plural.gameDef === null, false);
    assert.equal(plural.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(plural.gameDef?.agents?.candidateParamDefs.urgent, { type: 'boolean' });
    assert.deepEqual(
      plural.gameDef?.agents?.compiled.considerations.preferModeA?.value,
      {
        kind: 'op',
        op: 'boolToNumber',
        args: [
          {
            kind: 'op',
            op: 'eq',
            args: [
              { kind: 'ref', ref: { kind: 'candidateParam', id: 'mode', onMissing: 'unavailable' } },
              { kind: 'literal', value: 'A' },
            ],
          },
        ],
      },
    );
  });
});
