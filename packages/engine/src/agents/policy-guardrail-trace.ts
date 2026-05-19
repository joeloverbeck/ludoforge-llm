import type {
  GuardrailSeverity,
  PolicyGuardrailTrace,
} from '../kernel/types.js';

export type GuardrailTraceLevel = 'summary' | 'verbose' | 'debug';
export type GuardrailNotFiredTraceInput = PolicyGuardrailTrace['notFiredTop'][number] & {
  readonly severity?: GuardrailSeverity;
};

const GUARDRAIL_TRACE_VERBOSE_CAP = 5;
const GUARDRAIL_TRACE_SUMMARY_CAP = 3;

const SEVERITY_ORDER: Readonly<Record<GuardrailSeverity, number>> = {
  prune: 0,
  demote: 1,
  warn: 2,
  auditOnly: 3,
};

export function buildGuardrailTrace(input: {
  readonly fired: Iterable<PolicyGuardrailTrace['fired'][number]>;
  readonly notFired: Iterable<GuardrailNotFiredTraceInput>;
  readonly allPrunedFallback?: PolicyGuardrailTrace['allPrunedFallback'];
  readonly traceLevel?: GuardrailTraceLevel;
}): PolicyGuardrailTrace | undefined {
  const traceLevel = input.traceLevel ?? 'summary';
  const cap = traceLevel === 'debug'
    ? Number.POSITIVE_INFINITY
    : traceLevel === 'verbose'
      ? GUARDRAIL_TRACE_VERBOSE_CAP
      : GUARDRAIL_TRACE_SUMMARY_CAP;
  const fired = [...input.fired].sort(compareGuardrailFiredEntries).slice(0, cap);
  const notFiredTop = [...input.notFired]
    .sort(compareGuardrailNotFiredEntries)
    .slice(0, cap)
    .map(({ id, reason, onUnavailable }) => ({
      id,
      reason,
      ...(onUnavailable === undefined ? {} : { onUnavailable }),
    }));

  if (fired.length === 0 && notFiredTop.length === 0 && input.allPrunedFallback === undefined) {
    return undefined;
  }
  return {
    fired,
    notFiredTop,
    ...(input.allPrunedFallback === undefined ? {} : { allPrunedFallback: input.allPrunedFallback }),
  };
}

function compareGuardrailFiredEntries(
  left: PolicyGuardrailTrace['fired'][number],
  right: PolicyGuardrailTrace['fired'][number],
): number {
  return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    || compareStableIds(left.id, right.id);
}

function compareGuardrailNotFiredEntries(
  left: GuardrailNotFiredTraceInput,
  right: GuardrailNotFiredTraceInput,
): number {
  return guardrailSeverityRank(left.severity) - guardrailSeverityRank(right.severity)
    || compareStableIds(left.id, right.id);
}

function compareStableIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function guardrailSeverityRank(severity: GuardrailSeverity | undefined): number {
  return severity === undefined ? Number.POSITIVE_INFINITY : SEVERITY_ORDER[severity];
}
