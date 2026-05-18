import type { ProbeOutcome } from '../probe-types.js';
import { error, type AssertionContext } from './common.js';

export const evaluateGuardrailFired = (_context: AssertionContext): ProbeOutcome =>
  error('requires Spec 183 guardrails — not yet available');
