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
  roleBindingStatuses: result.roleBindingStatuses,
  alternatives: result.alternatives.map((alternative) => ({
    templateId: alternative.templateId,
    rootStableMoveKey: alternative.rootStableMoveKey,
    score: alternative.score,
    priorityTier: alternative.priorityTier,
    stableKey: alternative.stableKey,
    ...(alternative.compoundAvailability === undefined
      ? {}
      : { compoundAvailability: alternative.compoundAvailability }),
    ...(alternative.decisionSurfaceMatch === undefined
      ? {}
      : { decisionSurfaceMatch: alternative.decisionSurfaceMatch }),
    ...(alternative.rejectedByConstraint === undefined
      ? {}
      : { rejectedByConstraint: alternative.rejectedByConstraint }),
    ...(alternative.rejectedByConstraintTruncatedCount === undefined
      ? {}
      : { rejectedByConstraintTruncatedCount: alternative.rejectedByConstraintTruncatedCount }),
  })),
  posture: result.posture,
});
