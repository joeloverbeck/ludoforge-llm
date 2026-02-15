import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  KERNEL_LEGALITY_OUTCOMES,
  LEGALITY_OUTCOME_PROJECTIONS,
  shouldEnumerateLegalMoveForOutcome,
  toApplyMoveIllegalMetadataCode,
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
    } as const;

    for (const outcome of KERNEL_LEGALITY_OUTCOMES) {
      assert.equal(LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveCode, expected[outcome]);
      assert.equal(toApplyMoveIllegalMetadataCode(outcome), LEGALITY_OUTCOME_PROJECTIONS[outcome].applyMoveCode);
    }
  });

  it('marks canonical legality outcomes as move-excluding for legalMoves', () => {
    for (const outcome of KERNEL_LEGALITY_OUTCOMES) {
      assert.equal(LEGALITY_OUTCOME_PROJECTIONS[outcome].enumerateLegalMove, false);
      assert.equal(shouldEnumerateLegalMoveForOutcome(outcome), LEGALITY_OUTCOME_PROJECTIONS[outcome].enumerateLegalMove);
    }
  });
});
