import { z } from 'zod';

import {
  collectTurnFlowFreeOperationGrantContractViolations,
  type TurnFlowFreeOperationGrantContractViolationCode,
  TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES,
  TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES,
} from '../contracts/index.js';

const REQUIRED_COMPLETION_POLICY = TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES[0] satisfies 'required';
const SKIP_IF_NO_LEGAL_COMPLETION_POLICY = TURN_FLOW_FREE_OPERATION_GRANT_COMPLETION_POLICY_VALUES[1] satisfies 'skipIfNoLegalCompletion';
const REQUIRED_POST_RESOLUTION_TURN_FLOW = TURN_FLOW_FREE_OPERATION_GRANT_POST_RESOLUTION_TURN_FLOW_VALUES[0];
const PREFLIGHT_CONTRACT_VIOLATION_CODES = new Set<TurnFlowFreeOperationGrantContractViolationCode>([
  'completionPolicyInvalid',
  'moveZoneBindingsInvalid',
  'moveZoneProbeBindingsInvalid',
  'postResolutionTurnFlowInvalid',
  'progressionPolicyInvalid',
  'requiredPostResolutionTurnFlowMissing',
  'postResolutionTurnFlowRequiresRequiredCompletionPolicy',
  'executionContextInvalid',
]);

export const createTurnFlowFreeOperationGrantSchema = <Shape extends z.ZodRawShape>(
  shape: Shape,
): z.ZodTypeAny => {
  const structuralSchema = z.union([
    z
      .object({
        ...shape,
      })
      .strict(),
    z
      .object({
        ...shape,
        completionPolicy: z.literal(REQUIRED_COMPLETION_POLICY),
        postResolutionTurnFlow: z.literal(REQUIRED_POST_RESOLUTION_TURN_FLOW),
      })
      .strict(),
    z
      .object({
        ...shape,
        completionPolicy: z.literal(SKIP_IF_NO_LEGAL_COMPLETION_POLICY),
        postResolutionTurnFlow: z.literal(REQUIRED_POST_RESOLUTION_TURN_FLOW),
      })
      .strict(),
  ]);

  return z
    .any()
    .superRefine((value, ctx) => {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        for (const violation of collectTurnFlowFreeOperationGrantContractViolations(value as Record<string, unknown>)) {
          if (!PREFLIGHT_CONTRACT_VIOLATION_CODES.has(violation.code)) {
            continue;
          }
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: violation.message,
            path: [...violation.path],
          });
        }
      }
    })
    .pipe(structuralSchema);
};

export const superRefineTurnFlowFreeOperationGrantContract = (
  value: Record<string, unknown>,
  ctx: z.RefinementCtx,
): void => {
  for (const violation of collectTurnFlowFreeOperationGrantContractViolations(value)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: violation.message,
      path: [...violation.path],
    });
  }
};
