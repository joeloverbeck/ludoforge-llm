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
  type ActionPipelineDef,
  type FreeOperationBlockExplanation,
  type IllegalMoveContextInput,
  type IllegalMoveReason,
  type IllegalMoveReasonsRequiringContext,
  type IllegalMoveReasonsWithNoContext,
  type IllegalMoveReasonsWithOptionalContext,
  type KernelRuntimeErrorContext,
  type Move,
  type TurnFlowActionClass,
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

    const freeOperationDenial: FreeOperationBlockExplanation = {
      cause: 'actionIdMismatch',
      activeSeat: '2',
      actionClass: 'operation',
      actionId: 'operate',
      matchingGrantIds: ['grant-1'],
    };

    const error = illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED, {
      freeOperationDenial,
    });

    assert.equal(error.code, 'ILLEGAL_MOVE');
    assert.equal(error.reason, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);
    const context: KernelRuntimeErrorContext<'ILLEGAL_MOVE'> = error.context!;
    assert.equal(context.reason, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);
    if (context.reason === ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED) {
      assert.deepEqual(context.freeOperationDenial, freeOperationDenial);
    } else {
      assert.fail('expected FREE_OPERATION_NOT_GRANTED context');
    }
  });

  it('illegalMoveError rejects missing required context for FREE_OPERATION_NOT_GRANTED on untyped invocation paths', () => {
    const move: Move = {
      actionId: action.id,
      params: {},
      freeOperation: true,
    };
    const invokeUntypedIllegalMoveError = illegalMoveError as unknown as (
      moveArg: Move,
      reasonArg: string,
      contextArg?: unknown,
    ) => Error;

    assert.throws(
      () => invokeUntypedIllegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED, {}),
      (error: unknown) =>
        error instanceof TypeError
        && error.message === 'freeOperationNotGranted requires freeOperationDenial in ILLEGAL_MOVE context.',
    );
  });

  it('illegalMoveError rejects missing required context for other required-context reasons on untyped invocation paths', () => {
    const move: Move = {
      actionId: action.id,
      params: {},
    };
    const invokeUntypedIllegalMoveError = illegalMoveError as unknown as (
      moveArg: Move,
      reasonArg: string,
      contextArg?: unknown,
    ) => Error;

    assert.throws(
      () =>
        invokeUntypedIllegalMoveError(move, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED, {
          operationActionId: 'operate',
          specialActivityActionId: 'assist',
        }),
      (error: unknown) =>
        error instanceof TypeError
        && error.message === 'specialActivityAccompanyingOpDisallowed requires profileId in ILLEGAL_MOVE context.',
    );
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

  it('illegalMoveError type contract enforces an exhaustive reason-group matrix', () => {
    const move: Move = {
      actionId: action.id,
      params: {},
    };

    const requiredContextReasons = [
      ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED,
      ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED,
      ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH,
      ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED,
    ] as const satisfies readonly IllegalMoveReasonsRequiringContext[];

    const optionalContextReasons = [
      ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE,
      ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS,
      ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID,
      ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
      ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED,
      ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED,
      ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID,
    ] as const satisfies readonly IllegalMoveReasonsWithOptionalContext[];

    const noContextReasons = [
      ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION,
      ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID,
      ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE,
      ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE,
      ILLEGAL_MOVE_REASONS.SIMULTANEOUS_SUBMISSION_COMPOUND_UNSUPPORTED,
      ILLEGAL_MOVE_REASONS.SIMULTANEOUS_RUNTIME_STATE_REQUIRED,
    ] as const satisfies readonly IllegalMoveReasonsWithNoContext[];

    const requiredContextFixtures: Readonly<{
      [R in IllegalMoveReasonsRequiringContext]: IllegalMoveContextInput<R>;
    }> = {
      [ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED]: {
        operationActionId: action.id,
        specialActivityActionId: asActionId('assist'),
        profileId: 'profile-op',
      },
      [ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED]: {
        operationActionId: action.id,
        specialActivityActionId: asActionId('assist'),
        profileId: 'profile-op',
        relation: 'subset',
        operationParam: 'target',
        specialActivityParam: 'auxTarget',
      },
      [ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH]: {
        mappedActionClass: 'operation',
        submittedActionClass: 'legacy-operation',
      },
      [ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED]: {
        freeOperationDenial: {
          cause: 'actionIdMismatch',
          activeSeat: '1',
          actionClass: 'operation',
          actionId: action.id,
          matchingGrantIds: [],
        },
      },
    };

    const optionalContextFixtures: Readonly<{
      [R in IllegalMoveReasonsWithOptionalContext]: IllegalMoveContextInput<R>;
    }> = {
      [ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE]: { detail: 'reason detail' },
      [ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS]: { nextDecisionId: 'next-decision' },
      [ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID]: { detail: 'invalid params' },
      [ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE]: { detail: 'action blocked' },
      [ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED]: { profileId: 'profile-op' },
      [ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED]: { partialExecutionMode: 'partial' },
      [ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID]: { timing: 'during' },
    };

    type ListedRequiredReasons = (typeof requiredContextReasons)[number];
    type ListedOptionalReasons = (typeof optionalContextReasons)[number];
    type ListedNoContextReasons = (typeof noContextReasons)[number];
    type ListedReasons = ListedRequiredReasons | ListedOptionalReasons | ListedNoContextReasons;
    const assertRequiredReasonCoverage: Exclude<IllegalMoveReasonsRequiringContext, ListedRequiredReasons> extends never
      ? true
      : never = true;
    const assertOptionalReasonCoverage: Exclude<IllegalMoveReasonsWithOptionalContext, ListedOptionalReasons> extends never
      ? true
      : never = true;
    const assertNoContextReasonCoverage: Exclude<IllegalMoveReasonsWithNoContext, ListedNoContextReasons> extends never
      ? true
      : never = true;
    const assertNoExtraRequiredReasons: Exclude<ListedRequiredReasons, IllegalMoveReasonsRequiringContext> extends never
      ? true
      : never = true;
    const assertNoExtraOptionalReasons: Exclude<ListedOptionalReasons, IllegalMoveReasonsWithOptionalContext> extends never
      ? true
      : never = true;
    const assertNoExtraNoContextReasons: Exclude<ListedNoContextReasons, IllegalMoveReasonsWithNoContext> extends never
      ? true
      : never = true;
    const assertAllReasonsListed: Exclude<IllegalMoveReason, ListedReasons> extends never ? true : never = true;
    const assertOnlyIllegalMoveReasonsListed: Exclude<ListedReasons, IllegalMoveReason> extends never ? true : never = true;
    void assertRequiredReasonCoverage;
    void assertOptionalReasonCoverage;
    void assertNoContextReasonCoverage;
    void assertNoExtraRequiredReasons;
    void assertNoExtraOptionalReasons;
    void assertNoExtraNoContextReasons;
    void assertAllReasonsListed;
    void assertOnlyIllegalMoveReasonsListed;
    assert.equal(
      requiredContextReasons.length + optionalContextReasons.length + noContextReasons.length,
      Object.keys(ILLEGAL_MOVE_REASONS).length,
    );
    assert.equal(
      new Set([...requiredContextReasons, ...optionalContextReasons, ...noContextReasons]).size,
      Object.keys(ILLEGAL_MOVE_REASONS).length,
    );

    const assertCompileTimeReasonMatrix = (): void => {
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED,
        requiredContextFixtures[ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED],
      );
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED,
        requiredContextFixtures[ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED],
      );
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH,
        requiredContextFixtures[ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH],
      );
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED,
        requiredContextFixtures[ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED],
      );
      // @ts-expect-error required-context reasons must reject missing context
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_ACCOMPANYING_OP_DISALLOWED);
      // @ts-expect-error required-context reasons must reject missing context
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.SPECIAL_ACTIVITY_COMPOUND_PARAM_CONSTRAINT_FAILED);
      // @ts-expect-error required-context reasons must reject missing context
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH);
      // @ts-expect-error required-context reasons must reject missing context
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.FREE_OPERATION_NOT_GRANTED);

      illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE);
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE,
        optionalContextFixtures[ILLEGAL_MOVE_REASONS.MOVE_NOT_LEGAL_IN_CURRENT_STATE],
      );
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS);
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS,
        optionalContextFixtures[ILLEGAL_MOVE_REASONS.MOVE_HAS_INCOMPLETE_PARAMS],
      );
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID);
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID,
        optionalContextFixtures[ILLEGAL_MOVE_REASONS.MOVE_PARAMS_INVALID],
      );
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE);
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE,
        optionalContextFixtures[ILLEGAL_MOVE_REASONS.ACTION_NOT_LEGAL_IN_CURRENT_STATE],
      );
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED);
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED,
        optionalContextFixtures[ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_LEGALITY_PREDICATE_FAILED],
      );
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED);
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED,
        optionalContextFixtures[ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED],
      );
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID);
      illegalMoveError(
        move,
        ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID,
        optionalContextFixtures[ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID],
      );

      illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION);
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE);
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE);
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.SIMULTANEOUS_SUBMISSION_COMPOUND_UNSUPPORTED);
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.SIMULTANEOUS_RUNTIME_STATE_REQUIRED);
      // @ts-expect-error no-context reasons must reject payload objects
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.MOVE_PARAMS_NOT_LEGAL_FOR_ACTION, {});
      // @ts-expect-error no-context reasons must reject payload objects
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID, {});
      // @ts-expect-error no-context reasons must reject payload objects
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_ACTOR_NOT_APPLICABLE, {});
      // @ts-expect-error no-context reasons must reject payload objects
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_EXECUTOR_NOT_APPLICABLE, {});
      // @ts-expect-error no-context reasons must reject payload objects
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.SIMULTANEOUS_SUBMISSION_COMPOUND_UNSUPPORTED, {});
      // @ts-expect-error no-context reasons must reject payload objects
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.SIMULTANEOUS_RUNTIME_STATE_REQUIRED, {});
    };
    void assertCompileTimeReasonMatrix;

    const unknownActionError = illegalMoveError(move, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
    assert.equal(unknownActionError.reason, ILLEGAL_MOVE_REASONS.UNKNOWN_ACTION_ID);
  });

  it('illegalMoveError context fields are assignable from canonical kernel contract types', () => {
    const move: Move = {
      actionId: action.id,
      params: {},
    };
    const assertCompileTimeDerivedContracts = (): void => {
      const mappedActionClass: TurnFlowActionClass = 'event';
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH, {
        mappedActionClass,
        submittedActionClass: 'custom-action-class',
      });
      // @ts-expect-error mappedActionClass must be a canonical turn-flow action class
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH, { mappedActionClass: 'custom', submittedActionClass: 'x' });

      const atomicity: ActionPipelineDef['atomicity'] = 'partial';
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED, {
        partialExecutionMode: atomicity,
      });
      // @ts-expect-error partialExecutionMode must be ActionPipelineDef atomicity
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.ACTION_PIPELINE_COST_VALIDATION_FAILED, { partialExecutionMode: 'bestEffort' });

      const timing: NonNullable<Move['compound']>['timing'] = 'during';
      const invalidField: keyof Pick<NonNullable<Move['compound']>, 'insertAfterStage' | 'replaceRemainingStages'> = 'insertAfterStage';
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID, {
        timing,
        invalidField,
      });
      // @ts-expect-error timing must come from CompoundMovePayload timing contract
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID, { timing: 'midway' });
      // @ts-expect-error invalidField must come from CompoundMovePayload compound override fields
      illegalMoveError(move, ILLEGAL_MOVE_REASONS.COMPOUND_TIMING_CONFIGURATION_INVALID, { invalidField: 'timing' });
    };
    void assertCompileTimeDerivedContracts;

    const error = illegalMoveError(move, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH, {
      mappedActionClass: 'operation',
      submittedActionClass: 'legacy-operation',
    });
    assert.equal(error.reason, ILLEGAL_MOVE_REASONS.TURN_FLOW_ACTION_CLASS_MISMATCH);
  });
});
