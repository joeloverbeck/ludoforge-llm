import type { ProbeOutcome } from '../probe-types.js';
import { fail, pass, type AssertionContext } from './common.js';

const UNREGISTERED_PREVIEW_DRIVE_SIGNAL = 'POLICY_TURNSHAPE_UNREGISTERED_PREVIEW_DRIVE';

export const evaluateTurnShapeNoAdditionalPreviewDrive = (context: AssertionContext): ProbeOutcome => {
  const assertion = context.assertion;
  if (assertion.kind !== 'turnShapeNoAdditionalPreviewDrive') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const failure = context.matches.find((match) => match.runtimeFailure?.signal === UNREGISTERED_PREVIEW_DRIVE_SIGNAL)
    ?.runtimeFailure;
  return failure === undefined
    ? pass()
    : fail(assertion, failure.message);
};
