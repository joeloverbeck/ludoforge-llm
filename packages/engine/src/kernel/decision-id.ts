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
