import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  asActionId,
  asPhaseId,
  ILLEGAL_MOVE_REASONS,
  PIPELINE_RUNTIME_REASONS,
  RUNTIME_CONTRACT_REASONS,
  illegalMoveError,
  kernelRuntimeError,
  pipelineApplicabilityEvaluationError,
  pipelinePredicateEvaluationError,
  runtimeContractInvalidError,
  type ActionDef,
  type KernelRuntimeErrorContext,
  type Move,
} from '../../../src/kernel/index.js';

describe('runtime error context contracts', () => {
  const action: ActionDef = {
    id: asActionId('operate'),
    actor: 'active',
    executor: 'actor',
    phase: [asPhaseId('main')],
    params: [],
    pre: null,
    cost: [],
    effects: [],
    limits: [],
  };

  it('illegalMoveError emits ILLEGAL_MOVE context contract', () => {
    const move: Move = {
      actionId: action.id,
      params: { operation: 'train' },
    };

    const error = illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE);

    assert.equal(error.code, 'ILLEGAL_MOVE');
    assert.equal(error.actionId, move.actionId);
    assert.deepEqual(error.params, move.params);
    const context: KernelRuntimeErrorContext<'ILLEGAL_MOVE'> = error.context!;
    assert.equal(context.actionId, move.actionId);
    assert.deepEqual(context.params, move.params);
    assert.equal(context.reason, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE);
    assert.equal(context.metadata, undefined);
  });

  it('pipeline applicability helper emits deterministic context contract', () => {
    const error = pipelineApplicabilityEvaluationError(action, 'profile-op', new Error('boom'));

    assert.equal(error.code, 'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED');
    const context: KernelRuntimeErrorContext<'ACTION_PIPELINE_APPLICABILITY_EVALUATION_FAILED'> = error.context!;
    assert.equal(context.actionId, action.id);
    assert.equal(context.profileId, 'profile-op');
    assert.equal(context.reason, PIPELINE_RUNTIME_REASONS.APPLICABILITY_EVALUATION_FAILED);
  });

  it('pipeline predicate helper emits deterministic context contract', () => {
    const error = pipelinePredicateEvaluationError(action, 'profile-op', 'legality', new Error('boom'));

    assert.equal(error.code, 'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED');
    const context: KernelRuntimeErrorContext<'ACTION_PIPELINE_PREDICATE_EVALUATION_FAILED'> = error.context!;
    assert.equal(context.actionId, action.id);
    assert.equal(context.profileId, 'profile-op');
    assert.equal(context.predicate, 'legality');
    assert.equal(context.reason, PIPELINE_RUNTIME_REASONS.PREDICATE_EVALUATION_FAILED);
  });

  it('runtime contract helper emits selector runtime context contract', () => {
    const error = runtimeContractInvalidError('invalid actor selector', {
      surface: 'applyMove',
      selector: 'actor',
      actionId: action.id,
      reason: RUNTIME_CONTRACT_REASONS.INVALID_SELECTOR_SPEC,
      selectorContractViolations: [{ role: 'actor', kind: 'bindingMalformed', binding: '$bad' }],
    });

    assert.equal(error.code, 'RUNTIME_CONTRACT_INVALID');
    const context: KernelRuntimeErrorContext<'RUNTIME_CONTRACT_INVALID'> = error.context!;
    assert.equal(context.surface, 'applyMove');
    assert.equal(context.selector, 'actor');
    assert.equal(context.actionId, action.id);
    assert.equal(context.reason, RUNTIME_CONTRACT_REASONS.INVALID_SELECTOR_SPEC);
    assert.deepEqual(context.selectorContractViolations, [{ role: 'actor', kind: 'bindingMalformed', binding: '$bad' }]);
  });

  it('kernelRuntimeError enforces per-code context contract for kernel-emitted codes', () => {
    const error = kernelRuntimeError('TERMINAL_MARGIN_NON_NUMERIC', 'margin must be numeric', {
      faction: 'US',
    });

    assert.equal(error.code, 'TERMINAL_MARGIN_NON_NUMERIC');
    const context: KernelRuntimeErrorContext<'TERMINAL_MARGIN_NON_NUMERIC'> = error.context!;
    assert.equal(context.faction, 'US');
  });
});
