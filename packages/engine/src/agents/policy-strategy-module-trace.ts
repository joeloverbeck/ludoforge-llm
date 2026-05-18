import type {
  AgentPolicyCatalog,
  PolicyModuleTrace,
} from '../kernel/types.js';
import type { StrategyModuleEvaluationView } from './policy-strategy-module-eval.js';

export type StrategyModuleTraceLevel = 'summary' | 'verbose' | 'debug';

export function buildStrategyModuleTrace(
  views: Iterable<StrategyModuleEvaluationView>,
  catalog: AgentPolicyCatalog,
  traceLevel: StrategyModuleTraceLevel = 'summary',
  selectedStableMoveKey?: string,
): PolicyModuleTrace | undefined {
  const viewsByModule = new Map<string, StrategyModuleEvaluationView>();
  for (const view of views) {
    if (
      view.candidateStableMoveKey !== undefined
      && view.candidateStableMoveKey !== selectedStableMoveKey
    ) {
      continue;
    }
    const prior = viewsByModule.get(view.moduleId);
    if (prior === undefined || prior.candidateStableMoveKey === undefined) {
      viewsByModule.set(view.moduleId, view);
    }
  }

  const active = [...viewsByModule.values()]
    .filter((view) => view.active && view.inactiveReason === undefined)
    .map((view) => {
      const module = catalog.compiled.strategyModules?.[view.moduleId];
      return {
        id: view.moduleId,
        traceLabel: module?.traceLabel ?? view.moduleId,
        priorityTier: module?.priority.tier ?? 0,
        activationValue: view.priorityValue ?? null,
        contribution: view.contribution,
        scoreGroups: Object.fromEntries([...view.scoreGroups.entries()].sort(([left], [right]) => left.localeCompare(right))),
      };
    })
    .sort(compareModuleActiveTraceEntries);
  const inactiveTopReasons = [...viewsByModule.values()]
    .filter((view) => !view.active || view.inactiveReason !== undefined)
    .map((view) => {
      const module = catalog.compiled.strategyModules?.[view.moduleId];
      return {
        id: view.moduleId,
        priorityTier: module?.priority.tier ?? 0,
        reason: view.inactiveReason ?? 'conditionFalse',
      };
    })
    .sort(compareModuleInactiveTraceEntries)
    .map(({ id, reason }) => ({ id, reason }));

  const cap = traceLevel === 'debug' ? Number.POSITIVE_INFINITY : traceLevel === 'verbose' ? 5 : 3;
  const trace = {
    active: active.slice(0, cap),
    inactiveTopReasons: inactiveTopReasons.slice(0, cap),
  };
  return trace.active.length === 0 && trace.inactiveTopReasons.length === 0 ? undefined : trace;
}

function compareModuleActiveTraceEntries(
  left: PolicyModuleTrace['active'][number],
  right: PolicyModuleTrace['active'][number],
): number {
  return right.priorityTier - left.priorityTier || left.id.localeCompare(right.id);
}

function compareModuleInactiveTraceEntries(
  left: { readonly id: string; readonly priorityTier: number },
  right: { readonly id: string; readonly priorityTier: number },
): number {
  return right.priorityTier - left.priorityTier || left.id.localeCompare(right.id);
}
