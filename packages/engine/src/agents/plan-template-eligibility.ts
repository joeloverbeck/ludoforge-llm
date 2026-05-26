import type { StrategyModuleDef } from '../kernel/types.js';

export interface FilteredOutPlanTemplate {
  readonly templateId: string;
  readonly gatedBy: readonly string[];
  readonly reason: 'notEnabled' | 'suppressed';
}

export interface PlanTemplateEligibility {
  readonly eligible: readonly string[];
  readonly filteredOut: readonly FilteredOutPlanTemplate[];
}

export function eligiblePlanTemplates(input: {
  readonly profileStrategyModules: readonly string[];
  readonly compiledStrategyModules: Readonly<Record<string, StrategyModuleDef>> | undefined;
  readonly activeDoctrines: readonly string[];
  readonly templateIds: readonly string[];
}): PlanTemplateEligibility {
  const activeIdSet = new Set(input.activeDoctrines);
  const activeModules = input.profileStrategyModules
    .filter((moduleId) => activeIdSet.has(moduleId))
    .map((moduleId) => input.compiledStrategyModules?.[moduleId])
    .filter((module): module is StrategyModuleDef => module !== undefined);
  const enables = new Map<string, string[]>();
  const suppresses = new Map<string, string[]>();
  const enablingModules: string[] = [];

  for (const module of activeModules) {
    if (module.enablesPlanTemplates.length > 0) {
      enablingModules.push(module.id);
      for (const templateId of module.enablesPlanTemplates) {
        addModule(enables, String(templateId), module.id);
      }
    }
    for (const templateId of module.suppressesPlanTemplates) {
      addModule(suppresses, String(templateId), module.id);
    }
  }

  const eligible: string[] = [];
  const filteredOut: FilteredOutPlanTemplate[] = [];
  for (const templateId of input.templateIds) {
    const suppressingModules = suppresses.get(templateId);
    if (suppressingModules !== undefined) {
      filteredOut.push({
        templateId,
        gatedBy: [...suppressingModules].sort(compareStable),
        reason: 'suppressed',
      });
      continue;
    }
    if (enablingModules.length > 0 && !enables.has(templateId)) {
      filteredOut.push({
        templateId,
        gatedBy: [...enablingModules].sort(compareStable),
        reason: 'notEnabled',
      });
      continue;
    }
    eligible.push(templateId);
  }

  return { eligible, filteredOut };
}

function addModule(target: Map<string, string[]>, templateId: string, moduleId: string): void {
  const modules = target.get(templateId) ?? [];
  modules.push(moduleId);
  target.set(templateId, modules);
}

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
