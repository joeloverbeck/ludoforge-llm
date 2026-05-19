import type {
  AgentPolicyCatalog,
  AgentParameterValue,
  CompiledAgentPolicyRef,
  CompiledPolicyExpr,
  CompiledSurfaceRef,
  CompiledAgentProfile,
  GameDef,
  PolicyAgentDecisionTrace,
} from '../kernel/types.js';
import type { PolicyEvaluationMetadata } from './policy-eval.js';

export type PolicyDecisionTraceLevel = 'none' | 'summary' | 'verbose' | 'debug';

export interface PolicyDiagnosticsSnapshot {
  readonly seatId: string | null;
  readonly requestedProfileId: string | null;
  readonly resolvedProfileId: string | null;
  readonly profileFingerprint: string | null;
  readonly parameterValues: Readonly<Record<string, AgentParameterValue>>;
  readonly resolvedPlan: {
    readonly stateFeatures: readonly string[];
    readonly candidateFeatures: readonly string[];
    readonly candidateAggregates: readonly string[];
    readonly selectors: readonly string[];
    readonly guardrails: readonly string[];
    readonly considerations: readonly string[];
    readonly tieBreakers: readonly string[];
  };
  readonly costTiers: {
    readonly state: readonly string[];
    readonly candidate: readonly string[];
    readonly preview: readonly string[];
  };
  readonly surfaceRefs: {
    readonly current: readonly string[];
    readonly preview: readonly string[];
  };
  readonly decision: PolicyAgentDecisionTrace;
}

export function buildPolicyDiagnosticsSnapshot(
  def: GameDef,
  metadata: PolicyEvaluationMetadata,
  traceLevel: PolicyDecisionTraceLevel = 'summary',
): PolicyDiagnosticsSnapshot {
  const catalog = def.agents;
  const profile = metadata.profileId === null || catalog === undefined ? null : catalog.profiles[metadata.profileId] ?? null;
  const decision = buildPolicyAgentDecisionTrace(metadata, traceLevel);

  if (catalog === undefined || profile === null) {
    return {
      seatId: metadata.seatId,
      requestedProfileId: metadata.requestedProfileId,
      resolvedProfileId: metadata.profileId,
      profileFingerprint: metadata.profileFingerprint,
      parameterValues: {},
      resolvedPlan: {
        stateFeatures: [],
        candidateFeatures: [],
        candidateAggregates: [],
        selectors: [],
        guardrails: [],
        considerations: [],
        tieBreakers: [],
      },
      costTiers: {
        state: [],
        candidate: [],
        preview: [],
      },
      surfaceRefs: {
        current: [],
        preview: [],
      },
      decision,
    };
  }

  const surfaceRefs = collectSurfaceRefs(catalog, profile);
  const costTiers = collectCostTiers(catalog, profile);

  return {
    seatId: metadata.seatId,
    requestedProfileId: metadata.requestedProfileId,
    resolvedProfileId: metadata.profileId,
    profileFingerprint: metadata.profileFingerprint,
    parameterValues: profile.params,
    resolvedPlan: {
      stateFeatures: profile.plan.stateFeatures,
      candidateFeatures: profile.plan.candidateFeatures,
      candidateAggregates: profile.plan.candidateAggregates,
      selectors: profile.plan.selectors ?? [],
      guardrails: profile.use.guardrails ?? [],
      considerations: profile.use.considerations,
      tieBreakers: profile.use.tieBreakers,
    },
    costTiers,
    surfaceRefs,
    decision,
  };
}

export function buildPolicyAgentDecisionTrace(
  metadata: PolicyEvaluationMetadata,
  traceLevel: PolicyDecisionTraceLevel = 'summary',
): PolicyAgentDecisionTrace {
  const verboseCandidates = metadata.candidates.map((candidate) => ({
    ...candidate,
    ...(candidate.grantedOperationSimulated === undefined ? {} : { grantedOperationSimulated: candidate.grantedOperationSimulated }),
    ...(candidate.grantedOperationMove === undefined ? {} : { grantedOperationMove: candidate.grantedOperationMove }),
    ...(candidate.grantedOperationMarginDelta === undefined ? {} : { grantedOperationMarginDelta: candidate.grantedOperationMarginDelta }),
    ...(candidate.previewFailureReason === undefined ? {} : { previewFailureReason: candidate.previewFailureReason }),
  }));

  return {
    kind: 'policy',
    agent: {
      kind: 'policy',
      ...(metadata.requestedProfileId === null ? {} : { profileId: metadata.requestedProfileId }),
    },
    seatId: metadata.seatId,
    requestedProfileId: metadata.requestedProfileId,
    resolvedProfileId: metadata.profileId,
    profileFingerprint: metadata.profileFingerprint,
    initialCandidateCount: metadata.canonicalOrder.length,
    selectedStableMoveKey: metadata.selectedStableMoveKey,
    finalScore: metadata.finalScore,
    ...(metadata.phase1Score === undefined ? {} : { phase1Score: metadata.phase1Score }),
    ...(metadata.phase2Score === undefined ? {} : { phase2Score: metadata.phase2Score }),
    ...(metadata.phase1ActionRanking === undefined ? {} : { phase1ActionRanking: metadata.phase1ActionRanking }),
    ...(metadata.previewGatedCount === undefined ? {} : { previewGatedCount: metadata.previewGatedCount }),
    ...(metadata.previewGatedTopFlipDetected === undefined
      ? {}
      : { previewGatedTopFlipDetected: metadata.previewGatedTopFlipDetected }),
    ...(metadata.candidateParamFallbackFiredCount === undefined
      ? {}
      : { candidateParamFallbackFiredCount: metadata.candidateParamFallbackFiredCount }),
    pruningSteps: metadata.pruningSteps,
    tieBreakChain: metadata.tieBreakChain,
    previewUsage: metadata.previewUsage,
    ...(metadata.advisories === undefined ? {} : { advisories: metadata.advisories }),
    ...(metadata.selectors === undefined || metadata.selectors.length === 0 ? {} : { selectors: metadata.selectors }),
    ...(metadata.modules === undefined ? {} : { modules: metadata.modules }),
    ...(metadata.guardrails === undefined ? {} : { guardrails: metadata.guardrails }),
    ...(metadata.selection === undefined ? {} : { selection: metadata.selection }),
    emergencyFallback: metadata.usedFallback,
    failure: metadata.failure === null ? null : { code: metadata.failure.code, message: metadata.failure.message },
    ...(metadata.stateFeatures !== undefined ? { stateFeatures: metadata.stateFeatures } : {}),
    ...(traceLevel === 'verbose' || traceLevel === 'debug'
      ? {
          candidates: verboseCandidates,
        }
      : {}),
  };
}

export function formatPolicyDiagnostics(snapshot: PolicyDiagnosticsSnapshot): readonly string[] {
  const lines: string[] = [
    `seat=${snapshot.seatId ?? 'unresolved'}`,
    `requestedProfile=${snapshot.requestedProfileId ?? 'binding'}`,
    `resolvedProfile=${snapshot.resolvedProfileId ?? 'unresolved'}`,
    `fingerprint=${snapshot.profileFingerprint ?? 'n/a'}`,
    `cost[state]=${snapshot.costTiers.state.join(',') || '-'}`,
    `cost[candidate]=${snapshot.costTiers.candidate.join(',') || '-'}`,
    `cost[preview]=${snapshot.costTiers.preview.join(',') || '-'}`,
    `refs[current]=${snapshot.surfaceRefs.current.join(',') || '-'}`,
    `refs[preview]=${snapshot.surfaceRefs.preview.join(',') || '-'}`,
  ];
  return lines;
}

function collectCostTiers(
  catalog: AgentPolicyCatalog,
  profile: CompiledAgentProfile,
): PolicyDiagnosticsSnapshot['costTiers'] {
  const state = new Set<string>();
  const candidate = new Set<string>();
  const preview = new Set<string>();

  const push = (costClass: 'state' | 'candidate' | 'preview', label: string): void => {
    const target = costClass === 'state' ? state : costClass === 'candidate' ? candidate : preview;
    target.add(label);
  };

  for (const featureId of profile.plan.stateFeatures) {
    const feature = catalog.library.stateFeatures[featureId];
    if (feature !== undefined) {
      push(feature.costClass, `stateFeature:${featureId}`);
    }
  }
  for (const featureId of profile.plan.candidateFeatures) {
    const feature = catalog.library.candidateFeatures[featureId];
    if (feature !== undefined) {
      push(feature.costClass, `candidateFeature:${featureId}`);
    }
  }
  for (const aggregateId of profile.plan.candidateAggregates) {
    const aggregate = catalog.library.candidateAggregates[aggregateId];
    if (aggregate !== undefined) {
      push(aggregate.costClass, `aggregate:${aggregateId}`);
    }
  }
  for (const selectorId of profile.plan.selectors ?? []) {
    const selector = catalog.library.selectors?.[selectorId];
    if (selector !== undefined) {
      const costClass = selector.costClass === 'preview'
        ? 'preview'
        : selector.costClass === 'state'
          ? 'state'
          : 'candidate';
      push(costClass, `selector:${selectorId}`);
    }
  }
  for (const guardrailId of profile.use.guardrails ?? []) {
    const guardrail = catalog.library.guardrails?.[guardrailId];
    if (guardrail !== undefined) {
      const costClass = guardrail.costClass === 'preview'
        ? 'preview'
        : guardrail.costClass === 'state'
          ? 'state'
          : 'candidate';
      push(costClass, `guardrail:${guardrailId}`);
    }
  }
  const considerations = catalog.library.considerations ?? {};
  for (const considerationId of profile.use.considerations ?? []) {
    const consideration = considerations[considerationId];
    if (consideration !== undefined) {
      push(consideration.costClass, `consideration:${considerationId}`);
    }
  }
  for (const tieBreakerId of profile.use.tieBreakers) {
    const tieBreaker = catalog.library.tieBreakers[tieBreakerId];
    if (tieBreaker !== undefined) {
      push(tieBreaker.costClass, `tieBreaker:${tieBreakerId}`);
    }
  }

  return {
    state: [...state].sort(),
    candidate: [...candidate].sort(),
    preview: [...preview].sort(),
  };
}

function collectSurfaceRefs(
  catalog: AgentPolicyCatalog,
  profile: CompiledAgentProfile,
): PolicyDiagnosticsSnapshot['surfaceRefs'] {
  const current = new Set<string>();
  const preview = new Set<string>();
  const visited = new Set<string>();

  const visitRef = (ref: CompiledAgentPolicyRef): void => {
    if (ref.kind === 'currentSurface') {
      current.add(surfaceRefKey(ref));
      return;
    }
    if (ref.kind === 'previewSurface') {
      preview.add(surfaceRefKey(ref));
      return;
    }
    if (ref.kind === 'previewOptionRef') {
      preview.add(previewOptionRefKey(ref));
      return;
    }
    if (ref.kind !== 'library') {
      return;
    }

    const visitKey = `${ref.refKind}:${ref.id}`;
    if (visited.has(visitKey)) {
      return;
    }
    visited.add(visitKey);

    switch (ref.refKind) {
      case 'stateFeature': {
        const feature = catalog.compiled.stateFeatures[ref.id];
        if (feature !== undefined) {
          walkExpr(feature.expr, visitRef);
        }
        break;
      }
      case 'previewStateFeature': {
        preview.add(`feature.${ref.id}`);
        break;
      }
      case 'candidateFeature': {
        const feature = catalog.compiled.candidateFeatures[ref.id];
        if (feature !== undefined) {
          walkExpr(feature.expr, visitRef);
        }
        break;
      }
      case 'aggregate': {
        const aggregate = catalog.compiled.candidateAggregates[ref.id];
        if (aggregate !== undefined) {
          walkExpr(aggregate.of, visitRef);
          if (aggregate.where !== undefined) {
            walkExpr(aggregate.where, visitRef);
          }
        }
        break;
      }
    }
  };

  for (const featureId of profile.plan.stateFeatures) {
    const feature = catalog.compiled.stateFeatures[featureId];
    if (feature !== undefined) {
      walkExpr(feature.expr, visitRef);
    }
  }
  for (const featureId of profile.plan.candidateFeatures) {
    const feature = catalog.compiled.candidateFeatures[featureId];
    if (feature !== undefined) {
      walkExpr(feature.expr, visitRef);
    }
  }
  for (const aggregateId of profile.plan.candidateAggregates) {
    const aggregate = catalog.compiled.candidateAggregates[aggregateId];
    if (aggregate !== undefined) {
      walkExpr(aggregate.of, visitRef);
      if (aggregate.where !== undefined) {
        walkExpr(aggregate.where, visitRef);
      }
    }
  }
  for (const selectorId of profile.plan.selectors ?? []) {
    const selector = catalog.compiled.selectors?.[selectorId];
    if (selector !== undefined) {
      if (selector.where !== undefined) walkExpr(selector.where, visitRef);
      if (selector.minImpact !== undefined) walkExpr(selector.minImpact, visitRef);
      for (const component of selector.quality?.components ?? []) {
        walkExpr(component.value, visitRef);
      }
    }
  }
  for (const guardrailId of profile.use.guardrails ?? []) {
    const guardrail = catalog.compiled.guardrails?.[guardrailId];
    if (guardrail !== undefined) {
      walkExpr(guardrail.when, visitRef);
      if (guardrail.penalty !== undefined) {
        walkExpr(guardrail.penalty, visitRef);
      }
    }
  }
  const considerations = catalog.compiled.considerations;
  for (const considerationId of profile.use.considerations ?? []) {
    const consideration = considerations[considerationId];
    if (consideration !== undefined) {
      if (consideration.when !== undefined) {
        walkExpr(consideration.when, visitRef);
      }
      walkExpr(consideration.weight, visitRef);
      walkExpr(consideration.value, visitRef);
    }
  }
  for (const tieBreakerId of profile.use.tieBreakers) {
    const tieBreaker = catalog.compiled.tieBreakers[tieBreakerId];
    if (tieBreaker?.value !== undefined) {
      walkExpr(tieBreaker.value, visitRef);
    }
  }

  return {
    current: [...current].sort(),
    preview: [...preview].sort(),
  };
}

function walkExpr(expr: CompiledPolicyExpr, visitRef: (ref: CompiledAgentPolicyRef) => void): void {
  if (expr.kind === 'ref') {
    visitRef(expr.ref);
    return;
  }
  if (expr.kind === 'seatAgg') {
    walkExpr(expr.expr, visitRef);
    return;
  }
  if (expr.kind === 'op') {
    for (const arg of expr.args) {
      walkExpr(arg, visitRef);
    }
    return;
  }
  if ((expr.kind === 'zoneProp' || expr.kind === 'zoneTokenAgg') && typeof expr.zone !== 'string') {
    walkExpr(expr.zone, visitRef);
  }
}

function previewOptionRefKey(ref: Extract<CompiledAgentPolicyRef, { readonly kind: 'previewOptionRef' }>): string {
  switch (ref.refKind) {
    case 'victoryCurrentMarginSelf':
      return 'option.victory.currentMargin.self';
    case 'victoryCurrentRankSelf':
      return 'option.victory.currentRank.self';
    case 'deltaVictoryCurrentMarginSelf':
      return 'option.delta.victory.currentMargin.self';
    case 'globalVar':
      return `option.var.global.${ref.id ?? ''}`;
    case 'perPlayerVarSelf':
      return `option.var.player.self.${ref.id ?? ''}`;
    case 'derivedMetric':
      return `option.metric.${ref.id ?? ''}`;
    case 'outcome':
      return 'option.outcome';
    case 'driveDepth':
      return 'option.driveDepth';
  }
}

function surfaceRefKey(ref: CompiledSurfaceRef): string {
  if (ref.selector === undefined) {
    return `${ref.family}.${ref.id}`;
  }
  return ref.selector.kind === 'role'
    ? `${ref.family}.${ref.id}.${ref.selector.seatToken}`
    : `${ref.family}.${ref.id}.${ref.selector.player}`;
}
