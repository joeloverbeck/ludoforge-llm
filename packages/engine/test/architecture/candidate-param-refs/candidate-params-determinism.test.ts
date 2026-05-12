// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMove, type PolicyEvaluationMetadata } from '../../../src/agents/policy-eval.js';
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

function run(def: GameDef): PolicyEvaluationMetadata {
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
  }).metadata;
}

describe('candidate param fallback fired determinism', () => {
  it('replays candidateParamFallbackFired maps and count byte-identically', () => {
    const def = createDef();
    const first = run(def);
    const second = run(def);

    assert.equal(JSON.stringify(first.candidates), JSON.stringify(second.candidates));
    assert.equal(first.candidateParamFallbackFiredCount, 1);
    assert.equal(JSON.stringify(first.candidateParamFallbackFiredCount), JSON.stringify(second.candidateParamFallbackFiredCount));
    assert.deepEqual(
      first.candidates.map((candidate) => candidate.candidateParamFallbackFired ?? null),
      second.candidates.map((candidate) => candidate.candidateParamFallbackFired ?? null),
    );
  });
});
