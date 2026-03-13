import { z } from 'zod';

export const FreeOperationSequenceKeySchema = z.string().min(1);
