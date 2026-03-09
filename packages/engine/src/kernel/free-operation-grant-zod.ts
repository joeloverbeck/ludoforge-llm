import { z } from 'zod';

import { collectTurnFlowFreeOperationGrantContractViolations } from '../contracts/index.js';

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
