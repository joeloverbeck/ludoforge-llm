// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluatePolicyMoveCore } from '../../../src/agents/policy-eval.js';
import { asActionId, asPlayerId, enumerateLegalMoves, initialState } from '../../../src/kernel/index.js';
import { compileProductionSpec } from '../../helpers/production-spec-helpers.js';
import {
  alphaPlayerId,
  conformanceMoves,
  createConformanceState,
  createGuardrail,
  createGuardrailConformanceDef,
  literal,
} from './guardrail-conformance-test-fixtures.js';

describe('guardrail conformance: prune severity', () => {
  it('prunes the migrated FITL pass guardrail when non-pass alternatives exist', () => {
    const def = compileProductionSpec().compiled.gameDef;
    const state = initialState(def, 145, 4).state;
    const legalMoves = enumerateLegalMoves(def, state).moves.map((entry) => entry.move);
    assert.ok(legalMoves.some((move) => String(move.actionId) === 'pass'));
    assert.ok(legalMoves.some((move) => String(move.actionId) !== 'pass'));

    const result = evaluatePolicyMoveCore({
      def,
      state,
      playerId: asPlayerId(0),
      legalMoves,
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled',
      traceLevel: 'summary',
    });

    assert.equal(result.kind, 'success');
    assert.deepEqual(
      result.metadata.candidates.find((candidate) => candidate.actionId === 'pass')?.prunedBy,
      ['dropPassWhenOtherMovesExist'],
    );
    assert.deepEqual(result.metadata.guardrails?.fired, [{
      id: 'dropPassWhenOtherMovesExist',
      traceLabel: 'drop pass when other moves exist',
      severity: 'prune',
      status: 'ready',
    }]);
  });

  it('prunes fired candidates before selection', () => {
    const def = createGuardrailConformanceDef(createGuardrail({
      severity: 'prune',
      safe: true,
      onAllPruned: { actionId: asActionId('pass'), traceLabel: 'fallback pass' },
    }));
    const state = createConformanceState(def);

    const result = evaluatePolicyMoveCore({
      def,
      state,
      playerId: alphaPlayerId,
      legalMoves: conformanceMoves.tagged,
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled',
      traceLevel: 'summary',
    });

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.move, { actionId: 'goodMove', params: {} });
    assert.deepEqual(result.metadata.candidates.find((candidate) => candidate.actionId === 'badMove')?.prunedBy, ['avoidBadMove']);
    assert.deepEqual(result.metadata.guardrails?.fired, [{
      id: 'avoidBadMove',
      traceLabel: 'avoid bad move',
      severity: 'prune',
      status: 'ready',
    }]);
  });

  it('publishes the declared fallback frame when a safe prune guardrail removes every candidate', () => {
    const def = createGuardrailConformanceDef(createGuardrail({
      when: literal(true),
      costClass: 'state',
      severity: 'prune',
      safe: true,
      onAllPruned: { actionId: asActionId('pass'), traceLabel: 'fallback pass' },
    }));
    const state = createConformanceState(def);

    const result = evaluatePolicyMoveCore({
      def,
      state,
      playerId: alphaPlayerId,
      legalMoves: conformanceMoves.passOnly,
      trustedMoveIndex: new Map(),
      rng: { state: state.rng },
      diagnosticsMode: 'enabled',
      traceLevel: 'summary',
    });

    assert.equal(result.kind, 'success');
    assert.deepEqual(result.move, { actionId: 'pass', params: {} });
    assert.equal(result.metadata.selectedReason, 'fallbackExplicit');
    assert.deepEqual(result.metadata.guardrails?.allPrunedFallback, {
      guardrailId: 'avoidBadMove',
      actionId: 'pass',
      traceLabel: 'fallback pass',
    });
  });
});
