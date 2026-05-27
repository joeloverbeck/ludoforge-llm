import type { CompoundAvailability } from './microturn/compound-availability-probe.js';

export interface PolicyPlanTraceRoleBinding {
  readonly role: string;
  readonly selectedId: string;
  readonly quality: number;
  readonly rank: number;
  readonly components: Readonly<Record<string, number>>;
}

export type PolicyPlanTraceRoleBindingStatus =
  | { readonly kind: 'ready'; readonly binding: PolicyPlanTraceRoleBinding }
  | { readonly kind: 'unavailable'; readonly reason: 'noSelectorMatch' | 'allConstraintsFailed' | 'hiddenScope' };

export interface PolicyPlanTraceRoleBindingStatusEntry {
  readonly role: string;
  readonly status: PolicyPlanTraceRoleBindingStatus;
}

export type DecisionSurfaceMatch =
  | { readonly kind: 'matched' }
  | { readonly kind: 'mismatched'; readonly expected: string; readonly observed: string };

export interface PolicyPlanTraceAlternative {
  readonly templateId: string;
  readonly rootStableMoveKey: string;
  readonly score: number;
  readonly priorityTier: number;
  readonly stableKey: string;
  readonly compoundAvailability?: CompoundAvailability;
  readonly decisionSurfaceMatch?: DecisionSurfaceMatch;
}

export interface PolicyPlanTracePostureMustViolation {
  readonly id: string;
  readonly action: 'demote' | 'veto';
  readonly penalty?: number;
}

export interface PolicyPlanTracePosturePreferContribution {
  readonly id: string;
  readonly status: string;
  readonly value?: number;
  readonly weight?: number;
  readonly contribution: number;
  readonly fallbackReason?: string;
}

export interface PolicyPlanTraceAllyWeightActiveRole {
  readonly relationshipId: string;
  readonly role: string;
  readonly seat: string;
  readonly priority: number;
  readonly gainValue?: number;
}

export interface PolicyPlanTraceAllyWeightFlip {
  readonly contributionId: string;
  readonly allyRole: string;
  readonly thresholdRole: string;
  readonly seat: string;
  readonly fired: boolean;
}

export interface PolicyPlanTraceAllyWeightContext {
  readonly activeRoles: readonly PolicyPlanTraceAllyWeightActiveRole[];
  readonly flips: readonly PolicyPlanTraceAllyWeightFlip[];
}

export interface PolicyPlanTracePosture {
  readonly status: string;
  readonly mustViolations: readonly PolicyPlanTracePostureMustViolation[];
  readonly preferContributions: readonly PolicyPlanTracePosturePreferContribution[];
  readonly allyWeightContext?: PolicyPlanTraceAllyWeightContext;
}

export interface PolicyPlanMicroturnTrace {
  readonly expectedStep: string | null;
  readonly matchedRole: string | null;
  readonly selectedLegalOption: string;
  readonly match: 'exact' | 'reselected' | 'fallback';
  readonly deviation?: string;
  readonly fallbackReason?: string;
}

export interface PolicyPlanTrace {
  readonly status: 'selected' | 'noTemplate' | 'noEligibleTemplate' | 'noRootMatch' | 'noRoleBinding';
  readonly capClass?: string;
  readonly capLimit?: number;
  readonly selectedTemplate?: string;
  readonly selectedIntent?: string;
  readonly selectedRootStableMoveKey?: string;
  readonly activeDoctrines: readonly string[];
  readonly rejectedDoctrines: readonly {
    readonly doctrineId: string;
    readonly reason: 'inactive' | 'noRootMatch';
  }[];
  readonly filteredOutTemplates: readonly {
    readonly templateId: string;
    readonly gatedBy: readonly string[];
    readonly reason: 'notEnabled' | 'suppressed';
  }[];
  readonly roleBindingStatuses: readonly PolicyPlanTraceRoleBindingStatusEntry[];
  readonly alternatives: readonly PolicyPlanTraceAlternative[];
  readonly posture: PolicyPlanTracePosture;
  readonly microturns?: readonly PolicyPlanMicroturnTrace[];
}
