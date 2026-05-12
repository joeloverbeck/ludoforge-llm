// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPolicyAgentDecisionTrace } from '../../../src/agents/policy-diagnostics.js';
import { evaluatePolicyMove } from '../../../src/agents/policy-eval.js';
import { asActionId, asPlayerId, initialState, type GameDef, type Move } from '../../../src/kernel/index.js';
import { createRng } from '../../../src/kernel/prng.js';
import { baselineAgents, candidateParamRef, compileCandidateParamsDoc } from './candidate-params-fixture.js';

function createDef(): GameDef {
  const result = compileCandidateParamsDoc(baselineAgents({
    preferModeA: {
      scopes: ['move'],
      weight: 10,
      value: { boolToNumber: { eq: [{ ref: candidateParamRef('mode') }, 'A'] } },
      candidateParamFallback: { onUnavailable: 'noContribution' },
    },
  }));
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.gameDef !== null);
  return result.gameDef;
}

function createMixedFallbackDef(): GameDef {
  const result = compileCandidateParamsDoc(baselineAgents({
    mixedFallback: {
      scopes: ['move'],
      weight: 10,
      value: {
        add: [
          { boolToNumber: { eq: [{ ref: candidateParamRef('mode') }, 'A'] } },
          {
            lookup: {
              surface: 'policyState',
              collection: 'zones',
              keyType: 'ZoneId',
              key: 'missing-zone',
              path: ['properties', 'population'],
              onMissing: 'unavailable',
            },
          },
        ],
      },
      candidateParamFallback: { onUnavailable: 'noContribution' },
      lookupFallback: { onUnavailable: 'noContribution' },
    },
  }));
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.gameDef !== null);
  return result.gameDef;
}

function evaluate(def: GameDef) {
  const state = initialState(def, 1, 2).state;
  const legalMoves: readonly Move[] = [
    { actionId: asActionId('chooseMode'), params: { mode: 'A', urgent: true } },
    { actionId: asActionId('chooseRole'), params: { role: 'red', urgent: false } },
  ];
  return evaluatePolicyMove({
    def,
    state,
    playerId: asPlayerId(0),
    legalMoves,
    trustedMoveIndex: new Map(),
    rng: createRng(1n),
    traceLevel: 'verbose',
    encodedStateMode: 'disabled',
  });
}

describe('candidate param trace aggregation', () => {
  it('records unknown candidate params and candidateParamFallbackFired counts per candidate and frontier', () => {
    const def = createDef();
    const result = evaluate(def);

    const readyCandidate = result.metadata.candidates.find((candidate) => candidate.actionId === 'chooseMode');
    const missingCandidate = result.metadata.candidates.find((candidate) => candidate.actionId === 'chooseRole');
    assert.notEqual(readyCandidate, undefined);
    assert.notEqual(missingCandidate, undefined);

    assert.deepEqual(readyCandidate?.unknownCandidateParamRefs, []);
    assert.equal(readyCandidate?.candidateParamFallbackFired, undefined);
    assert.deepEqual(readyCandidate?.unknownPreviewRefs, []);
    assert.deepEqual(readyCandidate?.unknownLookupRefs, []);

    assert.deepEqual(missingCandidate?.unknownCandidateParamRefs, [
      { refId: 'candidate.params.mode', reason: 'missing' },
    ]);
    assert.deepEqual(missingCandidate?.candidateParamFallbackFired, { preferModeA: 1 });
    assert.deepEqual(missingCandidate?.unknownPreviewRefs, []);
    assert.deepEqual(missingCandidate?.unknownLookupRefs, []);
    assert.equal(result.metadata.candidateParamFallbackFiredCount, 1);

    const trace = buildPolicyAgentDecisionTrace(result.metadata, 'verbose');
    assert.equal(trace.candidateParamFallbackFiredCount, 1);
    assert.deepEqual(
      trace.candidates?.find((candidate) => candidate.actionId === 'chooseRole')?.candidateParamFallbackFired,
      { preferModeA: 1 },
    );
  });

  it('records candidate-param and lookup fallback evidence for mixed-surface unavailable values', () => {
    const def = createMixedFallbackDef();
    const result = evaluate(def);
    const missingCandidate = result.metadata.candidates.find((candidate) => candidate.actionId === 'chooseRole');
    assert.notEqual(missingCandidate, undefined);

    assert.deepEqual(missingCandidate?.unknownCandidateParamRefs, [
      { refId: 'candidate.params.mode', reason: 'missing' },
    ]);
    assert.deepEqual(missingCandidate?.candidateParamFallbackFired, { mixedFallback: 1 });
    assert.deepEqual(missingCandidate?.lookupFallbackFired, {
      termId: 'mixedFallback',
      kind: 'noContribution',
    });
    assert.equal(result.metadata.candidateParamFallbackFiredCount, 1);
  });
});
