import type { CompiledAgentPreviewBudgetConfig, CompiledPolicyConsideration, PolicyPreviewUtilityTrace } from '../kernel/types.js';
import { structuralImpactScore, unionFootprints } from '../cnl/compile-effect-footprint.js';
import { compareCodepoint, previewGroupKey, type PreviewGroupCandidate } from './preview-group-key.js';
import type { PolicyEvaluationCandidate, PolicyEvaluationContext } from './policy-evaluation-core.js';

type PreviewBudgetSelectionReason = 'coverage' | 'prior' | 'widening';

export interface PreviewWideningMemoryEntry {
  readonly lastUtility: PolicyPreviewUtilityTrace;
  readonly usedWidenSteps: number;
}

export type PreviewWideningState = Map<string, PreviewWideningMemoryEntry>;

export interface PreviewWideningDecisionContext {
  readonly turnId: number;
  readonly seatId: string;
}

export interface PreviewBudgetCandidate extends PreviewGroupCandidate, PolicyEvaluationCandidate {
  readonly stableMoveKey: string;
}

export interface AllocatorOutput {
  readonly allowedKeys: ReadonlySet<string>;
  readonly selectionReason: ReadonlyMap<string, PreviewBudgetSelectionReason>;
  readonly widenedBecauseUniform: boolean;
  readonly decisionClassKey?: string;
}

export function allocatePreviewBudget(
  evaluation: PolicyEvaluationContext,
  considerations: Readonly<Record<string, CompiledPolicyConsideration>>,
  candidates: readonly PreviewBudgetCandidate[],
  moveOnlyConsiderationIds: readonly string[],
  moveConsiderationIds: readonly string[],
  budget: CompiledAgentPreviewBudgetConfig,
  wideningState?: PreviewWideningState,
  decisionContext?: PreviewWideningDecisionContext,
): AllocatorOutput {
  const decisionClassKey = decisionContext === undefined
    ? undefined
    : previewDecisionClassKey(decisionContext);
  const widenStep = budget.widenOnUniformProjection === true
    && budget.widenStep !== undefined
    && budget.widenCap !== undefined
    && wideningState !== undefined
    && decisionClassKey !== undefined
    && (wideningState.get(decisionClassKey)?.lastUtility === 'constant')
    && (wideningState.get(decisionClassKey)?.usedWidenSteps ?? 0) < budget.widenCap
    ? budget.widenStep
    : 0;
  const baseCap = Math.min(budget.fullCandidateCap, candidates.length);
  const effectiveCap = Math.min(budget.fullCandidateCap + widenStep, candidates.length);
  const widenedBecauseUniform = widenStep > 0 && effectiveCap > baseCap;
  if (effectiveCap <= 0) {
    return allocatorOutput(new Set(), new Map(), widenedBecauseUniform, decisionClassKey);
  }
  if (effectiveCap >= candidates.length) {
    const allowedKeys = new Set(candidates.map((candidate) => candidate.stableMoveKey));
    return allocatorOutput(
      allowedKeys,
      new Map(candidates.map((candidate, index) => [
        candidate.stableMoveKey,
        widenedBecauseUniform && index >= baseCap ? 'widening' : 'prior',
      ])),
      widenedBecauseUniform,
      decisionClassKey,
    );
  }

  const priorScores = new Map<string, number>();
  const previewReadFootprint = unionFootprints(
    moveConsiderationIds
      .map((considerationId) => considerations[considerationId])
      .filter((consideration): consideration is CompiledPolicyConsideration => consideration?.costClass === 'preview')
      .flatMap((consideration) => consideration.readFootprint === undefined ? [] : [consideration.readFootprint]),
  );
  const priorScore = (candidate: PreviewBudgetCandidate): number => {
    const existing = priorScores.get(candidate.stableMoveKey);
    if (existing !== undefined) return existing;
    const score = moveOnlyConsiderationIds.reduce((total, considerationId) => (
      total + evaluation.evaluateConsideration(considerations, considerationId, candidate)
    ), 0);
    priorScores.set(candidate.stableMoveKey, score);
    return score;
  };
  const impactScores = new Map<string, number>();
  const impactScore = (candidate: PreviewBudgetCandidate): number => {
    const existing = impactScores.get(candidate.stableMoveKey);
    if (existing !== undefined) return existing;
    const score = structuralImpactScore(evaluation.getActionEffectFootprint(candidate.actionId), previewReadFootprint);
    impactScores.set(candidate.stableMoveKey, score);
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
  let quota = effectiveCap;
  let selectedCount = 0;
  const reasonForNextSelection = (normalReason: Exclude<PreviewBudgetSelectionReason, 'widening'>): PreviewBudgetSelectionReason => (
    widenedBecauseUniform && selectedCount >= baseCap ? 'widening' : normalReason
  );
  for (let slot = 0; slot < budget.minPerGroup && quota > 0; slot += 1) {
    for (const group of groups) {
      if (quota <= 0) break;
      const candidate = group[slot];
      if (candidate === undefined || allowedKeys.has(candidate.stableMoveKey)) {
        continue;
      }
      allowedKeys.add(candidate.stableMoveKey);
      selectionReason.set(candidate.stableMoveKey, reasonForNextSelection('coverage'));
      selectedCount += 1;
      quota -= 1;
    }
  }

  const remaining = candidates
    .filter((candidate) => !allowedKeys.has(candidate.stableMoveKey))
    .sort((left, right) => compareRankedCandidates(left, right, (candidate) => priorScore(candidate) * impactScore(candidate)));
  for (const candidate of remaining) {
    if (quota <= 0) break;
    allowedKeys.add(candidate.stableMoveKey);
    selectionReason.set(candidate.stableMoveKey, reasonForNextSelection('prior'));
    selectedCount += 1;
    quota -= 1;
  }

  return allocatorOutput(allowedKeys, selectionReason, widenedBecauseUniform, decisionClassKey);
}

export function previewDecisionClassKey(context: PreviewWideningDecisionContext): string {
  return `${context.turnId}:${context.seatId}`;
}

function allocatorOutput(
  allowedKeys: ReadonlySet<string>,
  selectionReason: ReadonlyMap<string, PreviewBudgetSelectionReason>,
  widenedBecauseUniform: boolean,
  decisionClassKey: string | undefined,
): AllocatorOutput {
  return {
    allowedKeys,
    selectionReason,
    widenedBecauseUniform,
    ...(decisionClassKey === undefined ? {} : { decisionClassKey }),
  };
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
