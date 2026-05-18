import type { GameDef, GameState } from '../../../../src/kernel/index.js';
import type {
  Probe,
  ProbeAssertion,
  ProbeMatch,
  ProbeOutcome,
  PreviewRefStatus,
} from '../probe-types.js';

export interface AssertionContext {
  readonly probe: Probe;
  readonly assertion: ProbeAssertion;
  readonly matches: readonly ProbeMatch[];
  readonly def?: GameDef;
  readonly state?: GameState;
}

export const pass = (): ProbeOutcome => ({ kind: 'pass' });

export const fail = (assertion: ProbeAssertion, reason: string): ProbeOutcome => ({
  kind: 'fail',
  assertionId: assertion.id ?? assertion.kind,
  reason,
});

export const error = (message: string): ProbeOutcome => ({ kind: 'error', message });

export const requireSingleMatch = (context: AssertionContext): ProbeMatch | ProbeOutcome => {
  if (context.matches.length !== 1) {
    return error(`assertion ${context.assertion.kind} requires exactly one matched decision, got ${String(context.matches.length)}`);
  }
  return context.matches[0]!;
};

export const requireEveryOccurrence = (context: AssertionContext): ProbeOutcome | null => (
  context.probe.decisionBinding.occurrence === 'every'
    ? null
    : error(`aggregate assertion ${context.assertion.kind} requires occurrence "every"`)
);

export const selectedTraceCandidate = (match: ProbeMatch) => {
  const trace = match.trace;
  if (trace === null || trace.selectedStableMoveKey === null) {
    return null;
  }
  return trace.candidates?.find((candidate) => candidate.stableMoveKey === trace.selectedStableMoveKey) ?? null;
};

export const getDottedField = (value: unknown, path: string): unknown => {
  let current = value;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = (current as Readonly<Record<string, unknown>>)[segment];
  }
  return current;
};

export const previewUnknownReasonToStatus = (reason: string): PreviewRefStatus => {
  switch (reason) {
    case 'stochastic':
    case 'random':
    case 'hidden':
    case 'unresolved':
    case 'failed':
    case 'depthCap':
    case 'postGrantCap':
    case 'noPreviewDecision':
    case 'gated':
      return reason;
    default:
      return 'failed';
  }
};

export const assertNever = (value: never): never => {
  throw new Error(`Unhandled assertion kind: ${JSON.stringify(value)}`);
};
