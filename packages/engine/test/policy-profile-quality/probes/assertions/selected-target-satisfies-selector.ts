import type { ProbeOutcome } from '../probe-types.js';
import { error, type AssertionContext } from './common.js';

export const evaluateSelectedTargetSatisfiesSelector = (_context: AssertionContext): ProbeOutcome =>
  error('requires Spec 181 ticket 006 selectors — not yet available');
