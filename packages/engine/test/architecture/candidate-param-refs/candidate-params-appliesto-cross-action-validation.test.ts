// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { baselineAgents, compileCandidateParamsDoc } from './candidate-params-fixture.js';

const modeRefForActions = (appliesToActions: readonly string[]) => ({
  ref: {
    'candidate.params.mode': {
      appliesToActions,
    },
  },
});

describe('candidate.params appliesToActions validation', () => {
  it('accepts actions that declare the param', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      modeOnly: {
        scopes: ['move'],
        weight: 1,
        value: { boolToNumber: { eq: [modeRefForActions(['chooseMode']), 'A'] } },
        candidateParamFallback: { onUnavailable: 'noContribution' },
      },
    }));

    assert.equal(result.gameDef === null, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error'), false);
    assert.deepEqual(
      result.gameDef?.agents?.compiled.considerations.modeOnly?.value,
      {
        kind: 'op',
        op: 'boolToNumber',
        args: [
          {
            kind: 'op',
            op: 'eq',
            args: [
              {
                kind: 'ref',
                ref: {
                  kind: 'candidateParam',
                  id: 'mode',
                  onMissing: 'unavailable',
                  appliesToActions: ['chooseMode'],
                },
              },
              { kind: 'literal', value: 'A' },
            ],
          },
        ],
      },
    );
  });

  it('rejects existing actions that do not declare the param', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      wrongAction: {
        scopes: ['move'],
        weight: 1,
        value: { boolToNumber: { eq: [modeRefForActions(['chooseRole']), 'A'] } },
      },
    }));

    assert.equal(result.gameDef, null);
    assert.ok(result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN'
        && diagnostic.path === 'doc.agents.library.considerations.wrongAction.value.boolToNumber.eq.0.ref.appliesToActions.0',
    ));
  });

  it('rejects missing actions', () => {
    const result = compileCandidateParamsDoc(baselineAgents({
      missingAction: {
        scopes: ['move'],
        weight: 1,
        value: { boolToNumber: { eq: [modeRefForActions(['doesNotExist']), 'A'] } },
      },
    }));

    assert.equal(result.gameDef, null);
    assert.ok(result.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_AGENT_CANDIDATE_PARAMS_UNKNOWN_ACTION'
        && diagnostic.path === 'doc.agents.library.considerations.missingAction.value.boolToNumber.eq.0.ref.appliesToActions.0',
    ));
  });
});
