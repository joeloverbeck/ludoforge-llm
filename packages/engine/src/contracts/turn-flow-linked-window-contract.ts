import { canonicalizeIdentifier } from './canonical-identifier-contract.js';

export const TURN_FLOW_WINDOW_USAGE_VALUES = ['eligibilityOverride', 'actionPipeline'] as const;

export type TurnFlowWindowUsage = (typeof TURN_FLOW_WINDOW_USAGE_VALUES)[number];

export interface TurnFlowWindowLike {
  readonly id: string;
  readonly usages: readonly TurnFlowWindowUsage[];
}

export interface TurnFlowLinkedWindowValidationIssue {
  readonly index: number;
  readonly windowId: string;
}

export interface TurnFlowWithWindows {
  readonly windows: readonly TurnFlowWindowLike[];
}

const collectTurnFlowWindowIdsByUsage = (
  turnFlow: TurnFlowWithWindows | null | undefined,
  usage: TurnFlowWindowUsage,
): readonly string[] => {
  if (turnFlow === null || turnFlow === undefined) {
    return [];
  }
  return turnFlow.windows
    .filter((window) => window.usages.includes(usage))
    .map((window) => canonicalizeIdentifier(window.id));
};

export const collectTurnFlowEligibilityOverrideWindowIds = (
  turnFlow: TurnFlowWithWindows | null | undefined,
): readonly string[] => collectTurnFlowWindowIdsByUsage(turnFlow, 'eligibilityOverride');

export const collectTurnFlowActionPipelineWindowIds = (
  turnFlow: TurnFlowWithWindows | null | undefined,
): readonly string[] => collectTurnFlowWindowIdsByUsage(turnFlow, 'actionPipeline');

export const findMissingTurnFlowLinkedWindows = (
  linkedWindows: readonly string[] | undefined,
  knownOverrideWindowIds: readonly string[],
): readonly TurnFlowLinkedWindowValidationIssue[] => {
  if (linkedWindows === undefined || linkedWindows.length === 0) {
    return [];
  }

  const known = new Set(knownOverrideWindowIds.map((windowId) => canonicalizeIdentifier(windowId)));
  const missing: TurnFlowLinkedWindowValidationIssue[] = [];
  for (const [index, windowId] of linkedWindows.entries()) {
    const normalizedWindowId = canonicalizeIdentifier(windowId);
    if (known.has(normalizedWindowId)) {
      continue;
    }
    missing.push({ index, windowId: normalizedWindowId });
  }
  return missing;
};
