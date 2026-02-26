const DECISION_INSTANCE_SEPARATOR = '::';

export const composeDecisionId = (
  internalDecisionId: string,
  bindTemplate: string,
  resolvedBind: string,
): string => {
  if (bindTemplate === resolvedBind && !bindTemplate.includes('{$')) {
    return internalDecisionId;
  }
  return `${internalDecisionId}${DECISION_INSTANCE_SEPARATOR}${resolvedBind}`;
};

/**
 * Scope decision IDs for forEach iterations only when composeDecisionId did not already
 * produce a per-iteration unique instance ID from template resolution.
 */
export const scopeDecisionIdForIteration = (
  baseDecisionId: string,
  internalDecisionId: string,
  iterationPath: string | undefined,
): string => {
  const needsIterationScoping = baseDecisionId === internalDecisionId;
  return needsIterationScoping && iterationPath !== undefined
    ? `${baseDecisionId}${iterationPath}`
    : baseDecisionId;
};

export const extractResolvedBindFromDecisionId = (decisionId: string): string | null => {
  if (!decisionId.startsWith('decision:')) {
    return null;
  }
  const separatorIndex = decisionId.indexOf(DECISION_INSTANCE_SEPARATOR);
  if (separatorIndex < 0) {
    return null;
  }
  return decisionId.slice(separatorIndex + DECISION_INSTANCE_SEPARATOR.length);
};
