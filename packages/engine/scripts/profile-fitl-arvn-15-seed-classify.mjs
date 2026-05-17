export function classifyMicroturn(decision, def) {
  if (decision.kind === 'actionSelection') {
    return String(decision.actionId);
  }
  const decisionKey = String(decision.decisionKey ?? '');
  const pipelineIndex = Number(decisionKey.match(/doc\.actionPipelines\.(\d+)/)?.[1]);
  const actionIndex = Number(decisionKey.match(/doc\.actions\.(\d+)/)?.[1]);
  const base = Number.isSafeInteger(pipelineIndex)
    ? String(def.actionPipelines?.[pipelineIndex]?.actionId ?? decision.kind)
    : Number.isSafeInteger(actionIndex)
      ? String(def.actions?.[actionIndex]?.id ?? decision.kind)
      : decisionKey.includes('doc.eventDecks.')
        ? 'event-decision'
        : decision.kind;
  if (decision.kind === 'chooseNStep') {
    return `${base}:chooseNStep:${decision.command}`;
  }
  if (decision.kind === 'chooseOne') {
    return `${base}:chooseOne`;
  }
  if (decision.kind === 'stochasticResolve') {
    return `${base}:stochasticResolve`;
  }
  if (decision.kind === 'outcomeGrantResolve') {
    return `outcomeGrantResolve:${decision.grantId}`;
  }
  if (decision.kind === 'turnRetirement') {
    return 'turnRetirement';
  }
  return decision.kind;
}
