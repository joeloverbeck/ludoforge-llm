import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EFFECT_RUNTIME_REASONS,
  ILLEGAL_MOVE_REASONS,
  KERNEL_RUNTIME_REASONS,
  PIPELINE_RUNTIME_REASONS,
  RUNTIME_CONTRACT_REASONS,
} from '../../../src/kernel/index.js';

describe('runtime reason taxonomy', () => {
  it('publishes stable canonical contract and pipeline runtime reasons', () => {
    assert.deepEqual(RUNTIME_CONTRACT_REASONS, {
      INVALID_SELECTOR_SPEC: 'invalidSelectorSpec',
    });
    assert.deepEqual(PIPELINE_RUNTIME_REASONS, {
      APPLICABILITY_EVALUATION_FAILED: 'applicabilityEvaluationFailed',
      PREDICATE_EVALUATION_FAILED: 'pipelinePredicateEvaluationFailed',
    });
  });

  it('publishes stable canonical effect runtime reasons', () => {
    assert.deepEqual(EFFECT_RUNTIME_REASONS, {
      EFFECT_BUDGET_CONFIG_INVALID: 'effectBudgetConfigInvalid',
      SUBSET_RUNTIME_VALIDATION_FAILED: 'subsetRuntimeValidationFailed',
      CHOICE_RUNTIME_VALIDATION_FAILED: 'choiceRuntimeValidationFailed',
      CONTROL_FLOW_RUNTIME_VALIDATION_FAILED: 'controlFlowRuntimeValidationFailed',
      RESOURCE_RUNTIME_VALIDATION_FAILED: 'resourceRuntimeValidationFailed',
      CONCEAL_RUNTIME_VALIDATION_FAILED: 'concealRuntimeValidationFailed',
      REVEAL_RUNTIME_VALIDATION_FAILED: 'revealRuntimeValidationFailed',
      TOKEN_RUNTIME_VALIDATION_FAILED: 'tokenRuntimeValidationFailed',
      TURN_FLOW_RUNTIME_VALIDATION_FAILED: 'turnFlowRuntimeValidationFailed',
      VARIABLE_RUNTIME_VALIDATION_FAILED: 'variableRuntimeValidationFailed',
    });
  });

  it('publishes stable canonical illegal-move runtime reasons', () => {
    assert.deepEqual(ILLEGAL_MOVE_REASONS, {
      MOVE_NOT_LEGAL_IN_CURRENT_STATE: 'moveNotLegalInCurrentState',
      MOVE_HAS_INCOMPLETE_PARAMS: 'moveHasIncompleteParams',
      MOVE_PARAMS_INVALID: 'moveParamsInvalid',
      MOVE_PARAMS_NOT_LEGAL_FOR_ACTION: 'moveParamsNotLegalForAction',
      UNKNOWN_ACTION_ID: 'unknownActionId',
      SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED: 'specialActivityAccompanyingOpDisallowed',
      SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED: 'specialActivityCompoundParamConstraintFailed',
      TURN_FLOW_ACTION_CLASS_MISMATCH: 'turnFlowActionClassMismatch',
      FREE_OPERATION_NOT_GRANTED: 'freeOperationNotGranted',
      ACTION_ACTOR_NOT_APPLICABLE: 'actionActorNotApplicable',
      ACTION_EXECUTOR_NOT_APPLICABLE: 'actionExecutorNotApplicable',
      ACTION_NOT_LEGAL_IN_CURRENT_STATE: 'actionNotLegalInCurrentState',
      ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED: 'actionPipelineLegalityPredicateFailed',
      ACTION_PIPELINE_COST_VALIDATION_FAILED: 'actionPipelineCostValidationFailed',
      SIMULTANEOUS_SUBMISSION_COMPOUND_UNSUPPORTED: 'simultaneousSubmissionCompoundUnsupported',
      SIMULTANEOUS_RUNTIME_STATE_REQUIRED: 'simultaneousRuntimeStateRequired',
    });
  });

  it('maintains a deduplicated global runtime reason registry', () => {
    assert.deepEqual(KERNEL_RUNTIME_REASONS, [
      'moveNotLegalInCurrentState',
      'moveHasIncompleteParams',
      'moveParamsInvalid',
      'moveParamsNotLegalForAction',
      'unknownActionId',
      'specialActivityAccompanyingOpDisallowed',
      'specialActivityCompoundParamConstraintFailed',
      'turnFlowActionClassMismatch',
      'freeOperationNotGranted',
      'actionActorNotApplicable',
      'actionExecutorNotApplicable',
      'actionNotLegalInCurrentState',
      'actionPipelineLegalityPredicateFailed',
      'actionPipelineCostValidationFailed',
      'simultaneousSubmissionCompoundUnsupported',
      'simultaneousRuntimeStateRequired',
      'invalidSelectorSpec',
      'applicabilityEvaluationFailed',
      'pipelinePredicateEvaluationFailed',
      'effectBudgetConfigInvalid',
      'subsetRuntimeValidationFailed',
      'choiceRuntimeValidationFailed',
      'controlFlowRuntimeValidationFailed',
      'resourceRuntimeValidationFailed',
      'concealRuntimeValidationFailed',
      'revealRuntimeValidationFailed',
      'tokenRuntimeValidationFailed',
      'turnFlowRuntimeValidationFailed',
      'variableRuntimeValidationFailed',
    ]);
    assert.equal(new Set(KERNEL_RUNTIME_REASONS).size, KERNEL_RUNTIME_REASONS.length);
  });
});
