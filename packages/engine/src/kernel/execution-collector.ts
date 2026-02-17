import type { EffectTraceEntry, ExecutionCollector, ExecutionOptions, RuntimeWarning } from './types.js';

export function createCollector(options?: ExecutionOptions): ExecutionCollector {
  return {
    warnings: [],
    trace: options?.trace === true ? [] : null,
  };
}

export function emitWarning(collector: ExecutionCollector | undefined, warning: RuntimeWarning): void {
  if (collector === undefined) return;
  collector.warnings.push(warning);
}

export function emitTrace(collector: ExecutionCollector | undefined, entry: EffectTraceEntry): void {
  if (collector === undefined || collector.trace === null) return;
  collector.trace.push(entry);
}
