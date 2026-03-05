export interface TurnFlowEligibilityOverrideWindowLike {
  readonly id: string;
}

export interface TurnFlowLinkedWindowValidationIssue {
  readonly index: number;
  readonly windowId: string;
}

export interface TurnFlowWithEligibilityOverrideWindows {
  readonly eligibility: {
    readonly overrideWindows: readonly TurnFlowEligibilityOverrideWindowLike[];
  };
}

export const collectTurnFlowEligibilityOverrideWindowIds = (
  turnFlow: TurnFlowWithEligibilityOverrideWindows | null | undefined,
): readonly string[] => {
  if (turnFlow === null || turnFlow === undefined) {
    return [];
  }
  return turnFlow.eligibility.overrideWindows.map((window) => window.id);
};

export const findMissingTurnFlowLinkedWindows = (
  linkedWindows: readonly string[] | undefined,
  knownOverrideWindowIds: readonly string[],
): readonly TurnFlowLinkedWindowValidationIssue[] => {
  if (linkedWindows === undefined || linkedWindows.length === 0) {
    return [];
  }

  const known = new Set(knownOverrideWindowIds);
  const missing: TurnFlowLinkedWindowValidationIssue[] = [];
  for (const [index, windowId] of linkedWindows.entries()) {
    if (known.has(windowId)) {
      continue;
    }
    missing.push({ index, windowId });
  }
  return missing;
};
