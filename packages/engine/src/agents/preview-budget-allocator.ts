import type { CompiledAgentPreviewBudgetConfig, CompiledPolicyConsideration } from '../kernel/types.js';
import { compareCodepoint, previewGroupKey, type PreviewGroupCandidate } from './preview-group-key.js';
import type { PolicyEvaluationCandidate, PolicyEvaluationContext } from './policy-evaluation-core.js';

type PreviewBudgetSelectionReason = 'coverage' | 'prior';

export interface PreviewBudgetCandidate extends PreviewGroupCandidate, PolicyEvaluationCandidate {
  readonly stableMoveKey: string;
}

export interface AllocatorOutput {
  readonly allowedKeys: ReadonlySet<string>;
  readonly selectionReason: ReadonlyMap<string, PreviewBudgetSelectionReason>;
}

export function allocatePreviewBudget(
  evaluation: PolicyEvaluationContext,
  considerations: Readonly<Record<string, CompiledPolicyConsideration>>,
  candidates: readonly PreviewBudgetCandidate[],
  moveOnlyConsiderationIds: readonly string[],
  budget: CompiledAgentPreviewBudgetConfig,
): AllocatorOutput {
  const cap = Math.min(budget.fullCandidateCap, candidates.length);
  if (cap <= 0) {
    return { allowedKeys: new Set(), selectionReason: new Map() };
  }
  if (cap >= candidates.length) {
    const allowedKeys = new Set(candidates.map((candidate) => candidate.stableMoveKey));
    return {
      allowedKeys,
      selectionReason: new Map(candidates.map((candidate) => [candidate.stableMoveKey, 'prior'])),
    };
  }

  const priorScores = new Map<string, number>();
  const priorScore = (candidate: PreviewBudgetCandidate): number => {
    const existing = priorScores.get(candidate.stableMoveKey);
    if (existing !== undefined) return existing;
    const score = moveOnlyConsiderationIds.reduce((total, considerationId) => (
      total + evaluation.evaluateConsideration(considerations, considerationId, candidate)
    ), 0);
    priorScores.set(candidate.stableMoveKey, score);
    return score;
  };

  const grouped = new Map<string, PreviewBudgetCandidate[]>();
  for (const candidate of candidates) {
    const key = previewGroupKey(candidate);
    const group = grouped.get(key);
    if (group === undefined) {
      grouped.set(key, [candidate]);
    } else {
      group.push(candidate);
    }
  }

  const groups = [...grouped.entries()]
    .sort(([left], [right]) => compareCodepoint(left, right))
    .map(([, group]) => [...group].sort((left, right) => compareRankedCandidates(left, right, priorScore)));

  const allowedKeys = new Set<string>();
  const selectionReason = new Map<string, PreviewBudgetSelectionReason>();
  let quota = cap;
  for (let slot = 0; slot < budget.minPerGroup && quota > 0; slot += 1) {
    for (const group of groups) {
      if (quota <= 0) break;
      const candidate = group[slot];
      if (candidate === undefined || allowedKeys.has(candidate.stableMoveKey)) {
        continue;
      }
      allowedKeys.add(candidate.stableMoveKey);
      selectionReason.set(candidate.stableMoveKey, 'coverage');
      quota -= 1;
    }
  }

  const remaining = candidates
    .filter((candidate) => !allowedKeys.has(candidate.stableMoveKey))
    .sort((left, right) => compareRankedCandidates(left, right, priorScore));
  for (const candidate of remaining) {
    if (quota <= 0) break;
    allowedKeys.add(candidate.stableMoveKey);
    selectionReason.set(candidate.stableMoveKey, 'prior');
    quota -= 1;
  }

  return { allowedKeys, selectionReason };
}

function compareRankedCandidates(
  left: PreviewBudgetCandidate,
  right: PreviewBudgetCandidate,
  priorScore: (candidate: PreviewBudgetCandidate) => number,
): number {
  const scoreOrder = priorScore(right) - priorScore(left);
  return scoreOrder === 0
    ? compareCodepoint(left.stableMoveKey, right.stableMoveKey)
    : scoreOrder;
}
