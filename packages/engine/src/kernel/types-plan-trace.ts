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
  readonly postureStatus: 'notConfigured' | 'ready' | 'unavailable';
}
