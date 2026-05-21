import type {
  CompiledPostureEvaluator,
  CompiledPolicyExpr,
} from '../kernel/types.js';
import type { PolicyPlanTraceAllyWeightContext } from '../kernel/types-plan-trace.js';
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
  readonly allyWeightContext?: PolicyPlanTraceAllyWeightContext;
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
  const flipContributionIds: string[] = [];
  for (const prefer of evaluator.prefer) {
    const whenResult = prefer.when === undefined ? true : context.evaluateCompiledExpr(prefer.when, candidate) === true;
    if (!whenResult) {
      continue;
    }
    if (isConditionalAllyFlip(prefer.when, context)) {
      flipContributionIds.push(prefer.id);
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
  const allyWeightContext = buildAllyWeightContext(context, flipContributionIds);
  return {
    status: postureTraceStatusForContributions(preferContributions),
    mustViolations,
    preferContributions,
    ...(allyWeightContext === undefined ? {} : { allyWeightContext }),
    scoreDelta: vetoed ? Number.NEGATIVE_INFINITY : demotePenalty + preferScore,
    vetoed,
  };
};

const buildAllyWeightContext = (
  context: PolicyEvaluationContext,
  flipContributionIds: readonly string[],
): PolicyPlanTraceAllyWeightContext | undefined => {
  const activeRoles = context.activeRelationshipRoles();
  if (activeRoles.length === 0 && flipContributionIds.length === 0) {
    return undefined;
  }
  const ally = activeRoles.find((entry) => entry.role === 'nominalAlly');
  const nearWin = activeRoles.find((entry) => entry.role === 'nearWin');
  return {
    activeRoles,
    flips: ally === undefined || nearWin === undefined || ally.seat !== nearWin.seat
      ? []
      : flipContributionIds.map((contributionId) => ({
          contributionId,
          allyRole: ally.role,
          thresholdRole: nearWin.role,
          seat: ally.seat,
          fired: true,
        })),
  };
};

const isConditionalAllyFlip = (
  when: CompiledPolicyExpr | undefined,
  context: PolicyEvaluationContext,
): boolean => {
  if (when === undefined) {
    return false;
  }
  const relationshipSeatRoles = collectRelationshipSeatRoles(when);
  if (!relationshipSeatRoles.has('nominalAlly') || !relationshipSeatRoles.has('nearWin')) {
    return false;
  }
  const activeRoles = context.activeRelationshipRoles();
  const ally = activeRoles.find((entry) => entry.role === 'nominalAlly');
  const nearWin = activeRoles.find((entry) => entry.role === 'nearWin');
  return ally !== undefined && nearWin !== undefined && ally.seat === nearWin.seat;
};

const collectRelationshipSeatRoles = (expr: CompiledPolicyExpr): Set<string> => {
  const roles = new Set<string>();
  const visit = (current: CompiledPolicyExpr | undefined): void => {
    if (current === undefined) {
      return;
    }
    if (current.kind === 'ref' && current.ref.kind === 'relationship' && current.ref.field === 'seat') {
      roles.add(current.ref.role);
      return;
    }
    const node = current as {
      readonly args?: readonly CompiledPolicyExpr[];
      readonly expr?: CompiledPolicyExpr;
      readonly of?: CompiledPolicyExpr;
      readonly where?: CompiledPolicyExpr;
      readonly zone?: CompiledPolicyExpr;
    };
    for (const child of node.args ?? []) {
      visit(child);
    }
    visit(node.expr);
    visit(node.of);
    visit(node.where);
    visit(node.zone);
  };
  visit(expr);
  return roles;
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
