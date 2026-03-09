import { z } from 'zod';

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
      message: 'sequenceContext must include captureMoveZoneCandidatesAs or requireMoveZoneCandidatesFrom.',
    },
  );
