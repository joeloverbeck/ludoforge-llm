import { TURN_FLOW_ACTION_CLASS_VALUES } from './turn-flow-action-class-contract.js';

export const TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES = [
  'emitAlways',
  'requireUsableAtIssue',
  'requireUsableForEventPlay',
] as const;

export type TurnFlowFreeOperationGrantViabilityPolicy =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES)[number];

const TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_SET = new Set<string>(
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_VALUES,
);

export const isTurnFlowFreeOperationGrantViabilityPolicy = (
  value: string,
): value is TurnFlowFreeOperationGrantViabilityPolicy =>
  TURN_FLOW_FREE_OPERATION_GRANT_VIABILITY_POLICY_SET.has(value);

export const TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES = [
  'required',
] as const;

export type TurnFlowFreeOperationGrantCompletionPolicy =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES)[number];

const TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_SET = new Set<string>(
  TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES,
);

export const isTurnFlowFreeOperationGrantCompletionPolicy = (
  value: string,
): value is TurnFlowFreeOperationGrantCompletionPolicy =>
  TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_SET.has(value);

export const TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES = [
  'mustChangeGameplayState',
] as const;

export type TurnFlowFreeOperationGrantOutcomePolicy =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES)[number];

const TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_SET = new Set<string>(
  TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_VALUES,
);

export const isTurnFlowFreeOperationGrantOutcomePolicy = (
  value: string,
): value is TurnFlowFreeOperationGrantOutcomePolicy =>
  TURN_FLOW_FREE_OPERATION_GRANT_OUTCOME_POLICY_SET.has(value);

export const TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES = [
  'resumeCardFlow',
] as const;

export type TurnFlowFreeOperationGrantPostResolutionTurnFlow =
  (typeof TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES)[number];

const TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_SET = new Set<string>(
  TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES,
);

export const isTurnFlowFreeOperationGrantPostResolutionTurnFlow = (
  value: string,
): value is TurnFlowFreeOperationGrantPostResolutionTurnFlow =>
  TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_SET.has(value);

export type TurnFlowFreeOperationGrantContractCandidate = {
  readonly operationClass?: string;
  readonly uses?: number;
  readonly viabilityPolicy?: string | null;
  readonly moveZoneBindings?: readonly unknown[] | null;
  readonly moveZoneProbeBindings?: readonly unknown[] | null;
  readonly completionPolicy?: string | null;
  readonly outcomePolicy?: string | null;
  readonly postResolutionTurnFlow?: string | null;
  readonly sequence?: {
    readonly batch?: unknown;
    readonly step?: unknown;
  } | null;
  readonly sequenceContext?: {
    readonly captureMoveZoneCandidatesAs?: unknown;
    readonly requireMoveZoneCandidatesFrom?: unknown;
  } | null;
  readonly executionContext?: Readonly<Record<string, unknown>> | null;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isScalar = (value: unknown): value is string | number | boolean =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const isExecutionContextValueCandidate = (value: unknown): boolean =>
  isScalar(value)
  || (
    Array.isArray(value)
    && value.every((entry) => isScalar(entry))
  )
  || isRecord(value);

export const turnFlowFreeOperationGrantPolicyRank = (
  grant: Pick<
    TurnFlowFreeOperationGrantContractCandidate,
    'completionPolicy' | 'outcomePolicy' | 'postResolutionTurnFlow'
  >,
): readonly [number, number, number] => [
  grant.completionPolicy === 'required' ? 1 : 0,
  grant.outcomePolicy === 'mustChangeGameplayState' ? 1 : 0,
  grant.postResolutionTurnFlow === 'resumeCardFlow' ? 1 : 0,
];

export const compareTurnFlowFreeOperationGrantPriority = (
  left: Pick<
    TurnFlowFreeOperationGrantContractCandidate,
    'completionPolicy' | 'outcomePolicy' | 'postResolutionTurnFlow'
  >,
  right: Pick<
    TurnFlowFreeOperationGrantContractCandidate,
    'completionPolicy' | 'outcomePolicy' | 'postResolutionTurnFlow'
  >,
): number => {
  const leftRank = turnFlowFreeOperationGrantPolicyRank(left);
  const rightRank = turnFlowFreeOperationGrantPolicyRank(right);
  for (let index = 0; index < leftRank.length; index += 1) {
    const delta = rightRank[index]! - leftRank[index]!;
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
};

export type TurnFlowFreeOperationGrantContractViolationCode =
  | 'operationClassInvalid'
  | 'usesInvalid'
  | 'viabilityPolicyInvalid'
  | 'moveZoneBindingsInvalid'
  | 'moveZoneProbeBindingsInvalid'
  | 'completionPolicyInvalid'
  | 'outcomePolicyInvalid'
  | 'postResolutionTurnFlowInvalid'
  | 'requiredPostResolutionTurnFlowMissing'
  | 'postResolutionTurnFlowRequiresRequiredCompletionPolicy'
  | 'sequenceBatchInvalid'
  | 'sequenceStepInvalid'
  | 'sequenceContextInvalid'
  | 'sequenceContextRequiresSequence'
  | 'executionContextInvalid';

export type TurnFlowFreeOperationGrantContractViolation = {
  readonly code: TurnFlowFreeOperationGrantContractViolationCode;
  readonly path: readonly string[];
  readonly message: string;
};

export const TURN_FLOW_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID_MESSAGE =
  'sequenceContext must declare at least one capture/require key.';
export const TURN_FLOW_FREE_OPERATION_EXECUTION_CONTEXT_INVALID_MESSAGE =
  'executionContext must be an object whose values are scalar literals, scalar arrays, or ValueExpr-compatible objects.';

export type TurnFlowFreeOperationGrantContractSurfaceViolation = {
  readonly path: string;
  readonly message: string;
};

export const renderTurnFlowFreeOperationGrantContractViolation = (
  violation: TurnFlowFreeOperationGrantContractViolation,
  options?: {
    readonly basePath?: string;
    readonly label?: string;
  },
): TurnFlowFreeOperationGrantContractSurfaceViolation => {
  const label = options?.label ?? 'grantFreeOperation';
  const suffix = violation.path.join('.');
  const path = options?.basePath === undefined ? suffix : `${options.basePath}.${suffix}`;
  if (violation.code === 'sequenceContextRequiresSequence') {
    return {
      path,
      message: `${label}.sequenceContext requires ${label}.sequence.`,
    };
  }
  return {
    path,
    message: `${label}.${violation.message}`,
  };
};

export const collectTurnFlowFreeOperationGrantContractViolations = (
  grant: TurnFlowFreeOperationGrantContractCandidate,
): readonly TurnFlowFreeOperationGrantContractViolation[] => {
  const violations: TurnFlowFreeOperationGrantContractViolation[] = [];

  if (
    grant.operationClass !== undefined
    && !(TURN_FLOW_ACTION_CLASS_VALUES as readonly string[]).includes(grant.operationClass)
  ) {
    violations.push({
      code: 'operationClassInvalid',
      path: ['operationClass'],
      message: `operationClass is invalid: "${grant.operationClass}".`,
    });
  }

  if (grant.uses !== undefined && (!Number.isSafeInteger(grant.uses) || grant.uses <= 0)) {
    violations.push({
      code: 'usesInvalid',
      path: ['uses'],
      message: 'uses must be a positive integer.',
    });
  }

  if (
    grant.viabilityPolicy !== undefined
    && grant.viabilityPolicy !== null
    && !isTurnFlowFreeOperationGrantViabilityPolicy(grant.viabilityPolicy)
  ) {
    violations.push({
      code: 'viabilityPolicyInvalid',
      path: ['viabilityPolicy'],
      message: `viabilityPolicy is invalid: "${grant.viabilityPolicy}".`,
    });
  }

  if (
    grant.moveZoneBindings !== undefined &&
    (
      !Array.isArray(grant.moveZoneBindings)
      || grant.moveZoneBindings.length === 0
      || grant.moveZoneBindings.some((entry) => typeof entry !== 'string' || entry.length === 0)
    )
  ) {
    violations.push({
      code: 'moveZoneBindingsInvalid',
      path: ['moveZoneBindings'],
      message: 'moveZoneBindings must be a non-empty string array.',
    });
  }

  if (
    grant.moveZoneProbeBindings !== undefined &&
    (
      !Array.isArray(grant.moveZoneProbeBindings)
      || grant.moveZoneProbeBindings.length === 0
      || grant.moveZoneProbeBindings.some((entry) => typeof entry !== 'string' || entry.length === 0)
    )
  ) {
    violations.push({
      code: 'moveZoneProbeBindingsInvalid',
      path: ['moveZoneProbeBindings'],
      message: 'moveZoneProbeBindings must be a non-empty string array.',
    });
  }

  if (
    grant.completionPolicy !== undefined
    && grant.completionPolicy !== null
    && !isTurnFlowFreeOperationGrantCompletionPolicy(grant.completionPolicy)
  ) {
    violations.push({
      code: 'completionPolicyInvalid',
      path: ['completionPolicy'],
      message: `completionPolicy is invalid: "${grant.completionPolicy}".`,
    });
  }

  if (
    grant.outcomePolicy !== undefined
    && grant.outcomePolicy !== null
    && !isTurnFlowFreeOperationGrantOutcomePolicy(grant.outcomePolicy)
  ) {
    violations.push({
      code: 'outcomePolicyInvalid',
      path: ['outcomePolicy'],
      message: `outcomePolicy is invalid: "${grant.outcomePolicy}".`,
    });
  }

  if (
    grant.postResolutionTurnFlow !== undefined
    && grant.postResolutionTurnFlow !== null
    && !isTurnFlowFreeOperationGrantPostResolutionTurnFlow(grant.postResolutionTurnFlow)
  ) {
    violations.push({
      code: 'postResolutionTurnFlowInvalid',
      path: ['postResolutionTurnFlow'],
      message: `postResolutionTurnFlow is invalid: "${grant.postResolutionTurnFlow}".`,
    });
  }

  if (grant.completionPolicy === 'required' && grant.postResolutionTurnFlow === undefined) {
    violations.push({
      code: 'requiredPostResolutionTurnFlowMissing',
      path: ['postResolutionTurnFlow'],
      message: 'postResolutionTurnFlow is required when completionPolicy is required.',
    });
  }

  if (
    grant.postResolutionTurnFlow !== undefined
    && grant.postResolutionTurnFlow !== null
    && grant.completionPolicy !== 'required'
  ) {
    violations.push({
      code: 'postResolutionTurnFlowRequiresRequiredCompletionPolicy',
      path: ['completionPolicy'],
      message: 'postResolutionTurnFlow requires completionPolicy: required.',
    });
  }

  const sequenceStep = grant.sequence?.step;
  if (
    grant.sequence !== undefined
    && grant.sequence !== null
    && (typeof grant.sequence.batch !== 'string' || grant.sequence.batch.length === 0)
  ) {
    violations.push({
      code: 'sequenceBatchInvalid',
      path: ['sequence', 'batch'],
      message: 'sequence.batch must be a non-empty string.',
    });
  }

  if (
    grant.sequence !== undefined
    && grant.sequence !== null
    && (typeof sequenceStep !== 'number' || !Number.isSafeInteger(sequenceStep) || sequenceStep < 0)
  ) {
    violations.push({
      code: 'sequenceStepInvalid',
      path: ['sequence', 'step'],
      message: 'sequence.step must be a non-negative integer.',
    });
  }

  if (grant.sequenceContext !== undefined && grant.sequenceContext !== null) {
    if (
      grant.sequenceContext.captureMoveZoneCandidatesAs === undefined
      && grant.sequenceContext.requireMoveZoneCandidatesFrom === undefined
    ) {
      violations.push({
        code: 'sequenceContextInvalid',
        path: ['sequenceContext'],
        message: TURN_FLOW_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID_MESSAGE,
      });
    }
    if (grant.sequence === undefined || grant.sequence === null) {
      violations.push({
        code: 'sequenceContextRequiresSequence',
        path: ['sequenceContext'],
        message: 'sequenceContext requires sequence.',
      });
    }
  }

  if (
    grant.executionContext !== undefined
    && grant.executionContext !== null
    && (
      !isRecord(grant.executionContext)
      || Object.entries(grant.executionContext).some(([key, value]) => key.length === 0 || !isExecutionContextValueCandidate(value))
    )
  ) {
    violations.push({
      code: 'executionContextInvalid',
      path: ['executionContext'],
      message: TURN_FLOW_FREE_OPERATION_EXECUTION_CONTEXT_INVALID_MESSAGE,
    });
  }

  return violations;
};
