import { z } from 'zod';

import { TURN_FLOW_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID_MESSAGE } from '../contracts/index.js';

export const FreeOperationSequenceContextSchema = z
  .object({
    captureMoveZoneCandidatesAs: z.string().min(1).optional(),
    requireMoveZoneCandidatesFrom: z.string().min(1).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.captureMoveZoneCandidatesAs !== undefined
      || value.requireMoveZoneCandidatesFrom !== undefined,
    {
      message: TURN_FLOW_FREE_OPERATION_SEQUENCE_CONTEXT_INVALID_MESSAGE,
    },
  );
