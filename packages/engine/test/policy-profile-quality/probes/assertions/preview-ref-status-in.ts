import type { ProbeOutcome, PreviewRefStatus } from '../probe-types.js';
import { fail, pass, previewUnknownReasonToStatus, requireSingleMatch, selectedTraceCandidate, type AssertionContext } from './common.js';

export const evaluatePreviewRefStatusIn = (context: AssertionContext): ProbeOutcome => {
  const match = requireSingleMatch(context);
  if ('kind' in match) {
    return match;
  }
  const assertion = context.assertion;
  if (assertion.kind !== 'previewRefStatusIn') {
    return fail(assertion, 'internal assertion kind mismatch');
  }
  const candidate = selectedTraceCandidate(match);
  const status = statusForRef(assertion.ref, candidate?.previewRefIds ?? [], candidate?.unknownPreviewRefs ?? []);
  return assertion.allowed.includes(status)
    ? pass()
    : fail(assertion, `preview ref \`${assertion.ref}\` had status \`${status}\`, expected one of ${assertion.allowed.join(', ')}`);
};

const statusForRef = (
  ref: string,
  readyRefs: readonly string[],
  unknownRefs: readonly { readonly refId: string; readonly reason: string }[],
): PreviewRefStatus => {
  const unknown = unknownRefs.find((entry) => entry.refId === ref);
  if (unknown !== undefined) {
    return previewUnknownReasonToStatus(unknown.reason);
  }
  return readyRefs.includes(ref) ? 'ready' : 'failed';
};
