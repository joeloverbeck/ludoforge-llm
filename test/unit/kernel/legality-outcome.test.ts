import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  shouldEnumerateLegalMoveForOutcome,
  toApplyMoveIllegalMetadataCode,
  toChoiceIllegalReason,
  type KernelLegalityOutcome,
} from '../../../src/kernel/index.js';

const OUTCOMES: readonly KernelLegalityOutcome[] = [
  'phaseMismatch',
  'actorNotApplicable',
  'executorNotApplicable',
  'actionLimitExceeded',
  'pipelineNotApplicable',
  'pipelineLegalityFailed',
];

describe('legality outcome projections', () => {
  it('projects every canonical outcome to stable legalChoices reasons', () => {
    const expected: Record<KernelLegalityOutcome, string> = {
      phaseMismatch: 'phaseMismatch',
      actorNotApplicable: 'actorNotApplicable',
      executorNotApplicable: 'executorNotApplicable',
      actionLimitExceeded: 'actionLimitExceeded',
      pipelineNotApplicable: 'pipelineNotApplicable',
      pipelineLegalityFailed: 'pipelineLegalityFailed',
    };

    for (const outcome of OUTCOMES) {
      assert.equal(toChoiceIllegalReason(outcome), expected[outcome]);
    }
  });

  it('projects every canonical outcome to stable applyMove metadata codes', () => {
    const expected: Record<KernelLegalityOutcome, string> = {
      phaseMismatch: 'ACTION_PHASE_MISMATCH',
      actorNotApplicable: 'ACTION_ACTOR_NOT_APPLICABLE',
      executorNotApplicable: 'ACTION_EXECUTOR_NOT_APPLICABLE',
      actionLimitExceeded: 'ACTION_LIMIT_EXCEEDED',
      pipelineNotApplicable: 'ACTION_PIPELINE_NOT_APPLICABLE',
      pipelineLegalityFailed: 'OPERATION_LEGALITY_FAILED',
    };

    for (const outcome of OUTCOMES) {
      assert.equal(toApplyMoveIllegalMetadataCode(outcome), expected[outcome]);
    }
  });

  it('marks canonical legality outcomes as move-excluding for legalMoves', () => {
    for (const outcome of OUTCOMES) {
      assert.equal(shouldEnumerateLegalMoveForOutcome(outcome), false);
    }
  });
});
