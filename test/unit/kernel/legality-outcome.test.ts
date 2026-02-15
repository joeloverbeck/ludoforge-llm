import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ILLEGAL_MOVE_REASONS,
  KERNEL_LEGALITY_OUTCOMES,
  LEGALITY_OUTCOME_PROJECTIONS,
  shouldEnumerateLegalMoveForOutcome,
  toApplyMoveIllegalMetadataCode,
  toApplyMoveIllegalReason,
  toChoiceIllegalReason,
} from '../../../src/kernel/index.js';

describe('legality outcome projections', () => {
  it('publishes a stable canonical legality outcome list', () => {
    assert.deepEqual(KERNEL_LEGALITY_OUTCOMES, [
      'phaseMismatch',
      'actorNotApplicable',
      'executorNotApplicable',
      'actionLimitExceeded',
      'pipelineNotApplicable',
      'pipelineLegalityFailed',
      'pipelineAtomicCostValidationFailed',
    ]);
  });

  it('projects every canonical outcome to stable legalChoices reasons', () => {
    for (const outcome of KERNEL_LEGALITY_OUTCOMES) {
      assert.equal(toChoiceIllegalReason(outcome), LEGALITY_OUTCOME_PROJECTIONS[outcome].choiceReason);
    }
  });

  it('projects every canonical outcome to stable applyMove metadata codes', () => {
    const expected = {
      phaseMismatch: 'ACTION_PHASE_MISMATCH',
      actorNotApplicable: 'ACTION_ACTOR_NOT_APPLICABLE',
      executorNotApplicable: 'ACTION_EXECUTOR_NOT_APPLICABLE',
      actionLimitExceeded: 'ACTION_LIMIT_EXCEEDED',
      pipelineNotApplicable: 'ACTION_PIPELINE_NOT_APPLICABLE',
      pipelineLegalityFailed: 'OPERATION_LEGALITY_FAILED',
      pipelineAtomicCostValidationFailed: 'OPERATION_COST_BLOCKED',
    } as const;

    for (const outcome of KERNEL_LEGALITY_OUTCOMES) {
      assert.equal(LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveCode, expected[outcome]);
      assert.equal(toApplyMoveIllegalMetadataCode(outcome), LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveCode);
    }
  });

  it('projects every canonical outcome to stable applyMove illegal reasons', () => {
    const expected = {
      phaseMismatch: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
      actorNotApplicable: ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE,
      executorNotApplicable: ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE,
      actionLimitExceeded: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
      pipelineNotApplicable: ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
      pipelineLegalityFailed: ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED,
      pipelineAtomicCostValidationFailed: ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED,
    } as const;

    for (const outcome of KERNEL_LEGALITY_OUTCOMES) {
      assert.equal(LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveReason, expected[outcome]);
      assert.equal(toApplyMoveIllegalReason(outcome), LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveReason);
    }
  });

  it('marks canonical legality outcomes as move-excluding for legalMoves', () => {
    for (const outcome of KERNEL_LEGALITY_OUTCOMES) {
      assert.equal(LEGALITY_OUTCOME_PROJECTIONS[outcome].enumerateLegalMove, false);
      assert.equal(shouldEnumerateLegalMoveForOutcome(outcome), LEGALITY_OUTCOME_PROJECTIONS[outcome].enumerateLegalMove);
    }
  });
});
