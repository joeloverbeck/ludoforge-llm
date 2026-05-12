// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyEvaluationContext, type PolicyEvaluationCandidate } from '../../../src/agents/policy-evaluation-core.js';
import { executeBytecode } from '../../../src/agents/policy-vm/index.js';
import { compilePolicyBytecode } from '../../../src/cnl/policy-bytecode/index.js';
import { buildEncodedState, buildEncodedStateLayout } from '../../../src/kernel/encoded-state/index.js';
import {
  asActionId,
  asPlayerId,
  initialState,
  type CompiledAgentPolicyRef,
  type CompiledPolicyExpr,
  type GameDef,
  type MoveParamValue,
} from '../../../src/kernel/index.js';
import { baselineAgents, compileCandidateParamsDoc } from './candidate-params-fixture.js';

const candidateParamRef = (
  id: string,
  onMissing: Extract<CompiledAgentPolicyRef, { readonly kind: 'candidateParam' }>['onMissing'] = 'unavailable',
): Extract<CompiledAgentPolicyRef, { readonly kind: 'candidateParam' }> => ({
  kind: 'candidateParam',
  id,
  onMissing,
});

const refExpr = (ref: CompiledAgentPolicyRef): CompiledPolicyExpr => ({ kind: 'ref', ref });

const literal = (value: number | string | boolean): CompiledPolicyExpr => ({ kind: 'literal', value });

const eqExpr = (left: CompiledPolicyExpr, right: CompiledPolicyExpr): CompiledPolicyExpr => ({
  kind: 'op',
  op: 'eq',
  args: [left, right],
});

function createDef(): GameDef {
  const result = compileCandidateParamsDoc(baselineAgents({}));
  assert.deepEqual(result.diagnostics, []);
  assert.ok(result.gameDef !== null);
  return result.gameDef;
}

function createEvaluation(def: GameDef, candidates: readonly PolicyEvaluationCandidate[]): PolicyEvaluationContext {
  const state = initialState(def, 1, 2).state;
  return new PolicyEvaluationContext({
    def,
    state,
    playerId: asPlayerId(0),
    seatId: 'p1',
    catalog: def.agents!,
    parameterValues: {},
    trustedMoveIndex: new Map(),
  }, [...candidates]);
}

function createCandidate(def: GameDef, params: Readonly<Record<string, MoveParamValue>>): PolicyEvaluationCandidate {
  return {
    move: { actionId: asActionId('chooseMode'), params },
    actionId: 'chooseMode',
    stableMoveKey: JSON.stringify(params),
    previewRefIds: new Set(),
    unknownPreviewRefs: new Map(),
    unknownLookupRefs: new Map(),
    unknownCandidateParamRefs: new Map(),
  };
}

describe('candidate param runtime resolver and trace map', () => {
  it('records missing and typeMismatch reasons without preview or lookup fallout', () => {
    const def = createDef();
    const missingCandidate = createCandidate(def, {});
    const typeMismatchCandidate = createCandidate(def, { mode: 7 });
    const evaluation = createEvaluation(def, [missingCandidate, typeMismatchCandidate]);
    try {
      assert.equal(evaluation.resolveCompiledPolicyRef(candidateParamRef('mode'), missingCandidate), undefined);
      assert.deepEqual([...missingCandidate.unknownCandidateParamRefs.entries()], [
        ['candidate.params.mode', 'missing'],
      ]);
      assert.deepEqual([...missingCandidate.unknownPreviewRefs.entries()], []);
      assert.deepEqual([...missingCandidate.unknownLookupRefs.entries()], []);

      assert.equal(evaluation.resolveCompiledPolicyRef(candidateParamRef('mode'), typeMismatchCandidate), undefined);
      assert.deepEqual([...typeMismatchCandidate.unknownCandidateParamRefs.entries()], [
        ['candidate.params.mode', 'typeMismatch'],
      ]);
    } finally {
      evaluation.dispose();
    }
  });

  it('uses onMissing constants without populating unknownCandidateParamRefs', () => {
    const def = createDef();
    const candidate = createCandidate(def, {});
    const evaluation = createEvaluation(def, [candidate]);
    try {
      assert.equal(
        evaluation.resolveCompiledPolicyRef(candidateParamRef('mode', { kind: 'constant', value: 'A' }), candidate),
        'A',
      );
      assert.deepEqual([...candidate.unknownCandidateParamRefs.entries()], []);
    } finally {
      evaluation.dispose();
    }
  });

  it('preserves suffix binding fallback before applying onMissing', () => {
    const def = createDef();
    const candidate = createCandidate(def, { 'chooseMode::mode': 'B' });
    const evaluation = createEvaluation(def, [candidate]);
    try {
      assert.equal(evaluation.resolveCompiledPolicyRef(candidateParamRef('mode'), candidate), 'B');
      assert.deepEqual([...candidate.unknownCandidateParamRefs.entries()], []);
    } finally {
      evaluation.dispose();
    }
  });

  it('mirrors onMissing constant semantics in bytecode VM', () => {
    const def = createDef();
    const candidate = createCandidate(def, {});
    const state = initialState(def, 1, 2).state;
    const layout = buildEncodedStateLayout(def);
    const expr = eqExpr(
      refExpr(candidateParamRef('mode', { kind: 'constant', value: 'A' })),
      literal('A'),
    );
    const bytecode = compilePolicyBytecode(expr, def, layout);
    const evaluation = createEvaluation(def, [candidate]);
    try {
      const interpreted = evaluation.evaluateCompiledExpr(expr, candidate);
      const vm = executeBytecode(bytecode, buildEncodedState(state, layout), {
        def,
        layout,
        state,
        playerId: Number(asPlayerId(0)),
        seatId: 'p1',
        candidateIndex: 0,
        legalMoves: [candidate.move],
      });
      assert.equal(interpreted, true);
      assert.equal(vm.value, true);
    } finally {
      evaluation.dispose();
    }
  });
});
