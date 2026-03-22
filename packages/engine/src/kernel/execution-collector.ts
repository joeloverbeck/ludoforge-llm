import type {
  ConditionTraceEntry,
  DecisionTraceEntry,
  EffectTraceEntry,
  ExecutionCollector,
  ExecutionOptions,
  RuntimeWarning,
  SelectorTraceEntry,
} from './types.js';

export function createCollector(options?: ExecutionOptions): ExecutionCollector {
  return {
    warnings: [],
    trace: options?.trace === true ? [] : null,
    conditionTrace: options?.conditionTrace === true ? [] : null,
    decisionTrace: options?.decisionTrace === true ? [] : null,
    selectorTrace: options?.selectorTrace === true ? [] : null,
    nextSeq: 0,
  };
}

export function createCollectorLike(collector: ExecutionCollector): ExecutionCollector {
  return {
    warnings: [],
    trace: collector.trace === null ? null : [],
    conditionTrace: collector.conditionTrace === null ? null : [],
    decisionTrace: collector.decisionTrace === null ? null : [],
    selectorTrace: collector.selectorTrace === null ? null : [],
    nextSeq: collector.nextSeq,
  };
}

export function emitWarning(collector: ExecutionCollector | undefined, warning: RuntimeWarning): void {
  if (collector === undefined) return;
  collector.warnings.push(warning);
}

export function emitTrace(collector: ExecutionCollector | undefined, entry: EffectTraceEntry): void {
  if (collector === undefined || collector.trace === null) return;
  const seq = collector.nextSeq++;
  collector.trace.push({ ...entry, seq });
}

export function emitConditionTrace(
  collector: ExecutionCollector | undefined,
  entry: Omit<ConditionTraceEntry, 'seq'>,
): void {
  if (collector === undefined || collector.conditionTrace === null) return;
  const seq = collector.nextSeq++;
  collector.conditionTrace.push({ ...entry, seq });
}

export function emitDecisionTrace(
  collector: ExecutionCollector | undefined,
  entry: Omit<DecisionTraceEntry, 'seq'>,
): void {
  if (collector === undefined || collector.decisionTrace === null) return;
  const seq = collector.nextSeq++;
  collector.decisionTrace.push({ ...entry, seq });
}

export function emitSelectorTrace(
  collector: ExecutionCollector | undefined,
  entry: Omit<SelectorTraceEntry, 'seq'>,
): void {
  if (collector === undefined || collector.selectorTrace === null) return;
  const seq = collector.nextSeq++;
  collector.selectorTrace.push({ ...entry, seq });
}
