import type { PreviewUtility, ReadyRefStats } from './policy-eval.js';

export const classifyPreviewUtility = (
  readyRefStats: Readonly<Record<string, ReadyRefStats>>,
): PreviewUtility => {
  const refIds = Object.keys(readyRefStats).sort();
  if (refIds.length === 0) {
    return 'none';
  }

  let anyReady = false;
  let anyDistinct = false;
  let anyConstant = false;
  for (const refId of refIds) {
    const stats = readyRefStats[refId];
    if (stats === undefined || stats.readyCount === 0) {
      continue;
    }
    anyReady = true;
    if (stats.distinctValueCount > 1) {
      anyDistinct = true;
    } else {
      anyConstant = true;
    }
  }

  if (!anyReady) {
    return 'none';
  }
  if (anyDistinct && anyConstant) {
    return 'lowInformation';
  }
  if (anyDistinct) {
    return 'differentiating';
  }
  return 'constant';
};
