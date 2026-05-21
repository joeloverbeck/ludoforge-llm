import type {
  CompiledPostureEvaluator,
} from '../kernel/types.js';
import type { PolicyEvaluationCandidate, PolicyEvaluationContext } from './policy-evaluation-core.js';
import type { PolicyPreviewUnavailabilityReason } from './policy-preview.js';

export interface PostureEvaluationMustViolation {
  readonly id: string;
  readonly action: 'demote' | 'veto';
  readonly penalty?: number;
}

export interface PostureEvaluationPreferContribution {
  readonly id: string;
  readonly status: string;
  readonly value?: number;
  readonly weight?: number;
  readonly contribution: number;
  readonly fallbackReason?: string;
}

export interface PostureEvaluationResult {
  readonly status: string;
  readonly mustViolations: readonly PostureEvaluationMustViolation[];
  readonly preferContributions: readonly PostureEvaluationPreferContribution[];
  readonly scoreDelta: number;
  readonly vetoed: boolean;
}

export const evaluatePostureEvaluator = (
  context: PolicyEvaluationContext,
  evaluator: CompiledPostureEvaluator,
  candidate: PolicyEvaluationCandidate,
): PostureEvaluationResult => {
  const mustViolations = evaluator.must.flatMap<PostureEvaluationMustViolation>((must) => {
    if (context.evaluateCompiledExpr(must.condition, candidate) === true) {
      return [];
    }
    const fallbackPenalty = must.onViolation === 'demote' ? -1 : undefined;
    const resolvedPenalty = must.demotePenalty === undefined
      ? fallbackPenalty
      : context.evaluateCompiledExpr(must.demotePenalty, candidate);
    const penalty = typeof resolvedPenalty === 'number' && Number.isFinite(resolvedPenalty)
      ? resolvedPenalty
      : fallbackPenalty;
    return [{
      id: must.id,
      action: must.onViolation,
      ...(penalty === undefined ? {} : { penalty }),
    }];
  });

  const preferContributions: PostureEvaluationPreferContribution[] = [];
  for (const prefer of evaluator.prefer) {
    if (prefer.when !== undefined && context.evaluateCompiledExpr(prefer.when, candidate) !== true) {
      continue;
    }
    const unknownPreviewRefsBefore = candidate.unknownPreviewRefs.size;
    const value = context.evaluateCompiledExpr(prefer.value, candidate);
    const previewUnavailable = candidate.unknownPreviewRefs.size > unknownPreviewRefsBefore;
    const weight = context.evaluateCompiledExpr(prefer.weight, candidate);
    if (typeof value === 'number' && typeof weight === 'number' && !previewUnavailable) {
      preferContributions.push({
        id: prefer.id,
        status: 'ready',
        value,
        weight,
        contribution: value * weight,
      });
      continue;
    }
    const fallback = context.evaluateCompiledExpr(prefer.fallback.contribution, candidate);
    const fallbackContribution = typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : 0;
    const fallbackReason = firstPreviewUnavailableReason(candidate.unknownPreviewRefs) ?? 'unresolved';
    preferContributions.push({
      id: prefer.id,
      status: fallbackReason,
      contribution: fallbackContribution,
      fallbackReason,
    });
  }

  const demotePenalty = mustViolations.reduce((total, violation) => total + (violation.penalty ?? 0), 0);
  const preferScore = preferContributions.reduce((total, contribution) => total + contribution.contribution, 0);
  const vetoed = mustViolations.some((violation) => violation.action === 'veto');
  return {
    status: postureTraceStatusForContributions(preferContributions),
    mustViolations,
    preferContributions,
    scoreDelta: vetoed ? Number.NEGATIVE_INFINITY : demotePenalty + preferScore,
    vetoed,
  };
};

const firstPreviewUnavailableReason = (
  refs: ReadonlyMap<string, PolicyPreviewUnavailabilityReason>,
): PolicyPreviewUnavailabilityReason | undefined =>
  [...refs.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)[0]?.[1];

const postureTraceStatusForContributions = (
  contributions: readonly PostureEvaluationPreferContribution[],
): string => {
  const fallback = contributions.find((contribution) => contribution.status !== 'ready');
  return fallback?.status ?? 'ready';
};
