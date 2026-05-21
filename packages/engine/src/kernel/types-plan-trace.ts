export interface PolicyPlanTraceRoleBinding {
  readonly role: string;
  readonly selectedId: string;
  readonly quality: number;
  readonly rank: number;
  readonly components: Readonly<Record<string, number>>;
}

export interface PolicyPlanTraceAlternative {
  readonly templateId: string;
  readonly rootStableMoveKey: string;
  readonly score: number;
  readonly priorityTier: number;
  readonly stableKey: string;
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

export interface PolicyPlanTracePosture {
  readonly status: string;
  readonly mustViolations: readonly PolicyPlanTracePostureMustViolation[];
  readonly preferContributions: readonly PolicyPlanTracePosturePreferContribution[];
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
  readonly status: 'selected' | 'noTemplate' | 'noRootMatch' | 'noRoleBinding';
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
  readonly roleBindings: readonly PolicyPlanTraceRoleBinding[];
  readonly alternatives: readonly PolicyPlanTraceAlternative[];
  readonly posture: PolicyPlanTracePosture;
  readonly microturns?: readonly PolicyPlanMicroturnTrace[];
}
