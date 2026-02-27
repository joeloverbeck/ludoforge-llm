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
    assert.equal('metadata' in context, false);
  });

  it('illegalMoveError exposes typed free-operation denial context for FREE_OPERATION_NOT_GRANTED', () => {
    const move: Move = {
      actionId: action.id,
      params: {},
      freeOperation: true,
    };

    const error = illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED, {
      freeOperationDenial: {
        cause: 'actionIdMismatch',
        activeSeat: '2',
        actionClass: 'operation',
        actionId: 'operate',
        matchingGrantIds: ['grant-1'],
      },
    });

    assert.equal(error.code, 'ILLEGAL_MOVE');
    assert.equal(error.reason, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);
    const context: KernelRuntimeErrorContext<'ILLEGAL_MOVE'> = error.context!;
    assert.equal(context.reason, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);
    if (context.reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED) {
      assert.deepEqual(context.freeOperationDenial, {
        cause: 'actionIdMismatch',
        activeSeat: '2',
        actionClass: 'operation',
        actionId: 'operate',
        matchingGrantIds: ['grant-1'],
      });
    } else {
      assert.fail('expected FREE_OPERATION_NOT_GRANTED context');
    }
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
      seat: 'US',
    });

    assert.equal(error.code, 'TERMINAL_MARGIN_NON_NUMERIC');
    const context: KernelRuntimeErrorContext<'TERMINAL_MARGIN_NON_NUMERIC'> = error.context!;
    assert.equal(context.seat, 'US');
  });

  it('illegalMoveError type contract requires context for reasons with required payload fields', () => {
    const move: Move = {
      actionId: action.id,
      params: {},
    };
    const assertCompileTimeContracts = (): void => {
      // @ts-expect-error FREE_OPERATION_NOT_GRANTED requires freeOperationDenial context
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);
      // @ts-expect-error SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED requires operation/specialActivity/profile context
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED);
      // @ts-expect-error FREE_OPERATION_NOT_GRANTED context must include freeOperationDenial
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED, {});
    };
    void assertCompileTimeContracts;

    const unknownActionError = illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
    assert.equal(unknownActionError.reason, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
  });
});
