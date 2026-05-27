import type { PolicyPlanTrace } from '../kernel/types.js';
import type { PlanProposalResult } from './plan-proposal.js';

export const buildPlanProposalTrace = (result: PlanProposalResult): PolicyPlanTrace => ({
  status: result.status,
  ...(result.capClass === undefined ? {} : { capClass: result.capClass }),
  ...(result.capLimit === undefined ? {} : { capLimit: result.capLimit }),
  ...(result.selected === undefined
    ? {}
    : {
        selectedTemplate: result.selected.templateId,
        selectedIntent: result.selected.intent,
        selectedRootStableMoveKey: result.selected.rootStableMoveKey,
      }),
  activeDoctrines: result.activeDoctrines,
  rejectedDoctrines: result.rejectedDoctrines,
  filteredOutTemplates: result.filteredOutTemplates,
  roleBindings: result.selected === undefined
    ? []
    : Object.values(result.selected.roleBindings)
      .sort((left, right) => compareStable(left.role, right.role))
      .map((binding) => ({
        role: binding.role,
        selectedId: binding.selectedId,
        quality: binding.quality,
        rank: binding.rank,
        components: binding.components,
      })),
  alternatives: result.alternatives.map((alternative) => ({
    templateId: alternative.templateId,
    rootStableMoveKey: alternative.rootStableMoveKey,
    score: alternative.score,
    priorityTier: alternative.priorityTier,
    stableKey: alternative.stableKey,
    ...(alternative.compoundAvailability === undefined
      ? {}
      : { compoundAvailability: alternative.compoundAvailability }),
  })),
  posture: result.posture,
});

function compareStable(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
