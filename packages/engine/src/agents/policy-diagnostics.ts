import type {
  AgentPolicyCatalog,
  AgentPolicyExpr,
  AgentParameterValue,
  CompiledAgentPolicyRef,
  CompiledAgentPolicySurfaceRef,
  CompiledAgentProfile,
  GameDef,
  PolicyAgentDecisionTrace,
} from '../kernel/types.js';
import type { PolicyEvaluationMetadata } from './policy-eval.js';

export type PolicyDecisionTraceLevel = 'summary' | 'verbose';

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
    readonly pruningRules: readonly string[];
    readonly scoreTerms: readonly string[];
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
        pruningRules: [],
        scoreTerms: [],
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
      pruningRules: profile.use.pruningRules,
      scoreTerms: profile.use.scoreTerms,
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
    pruningSteps: metadata.pruningSteps,
    tieBreakChain: metadata.tieBreakChain,
    previewUsage: metadata.previewUsage,
    emergencyFallback: metadata.usedFallback,
    failure: metadata.failure === null ? null : { code: metadata.failure.code, message: metadata.failure.message },
    ...(traceLevel === 'verbose'
      ? {
          candidates: metadata.candidates,
          ...(metadata.completionStatistics === undefined ? {} : { completionStatistics: metadata.completionStatistics }),
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
  for (const ruleId of profile.use.pruningRules) {
    const rule = catalog.library.pruningRules[ruleId];
    if (rule !== undefined) {
      push(rule.costClass, `pruningRule:${ruleId}`);
    }
  }
  for (const termId of profile.use.scoreTerms) {
    const term = catalog.library.scoreTerms[termId];
    if (term !== undefined) {
      push(term.costClass, `scoreTerm:${termId}`);
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
        const feature = catalog.library.stateFeatures[ref.id];
        if (feature !== undefined) {
          walkExpr(feature.expr, visitRef);
        }
        break;
      }
      case 'candidateFeature': {
        const feature = catalog.library.candidateFeatures[ref.id];
        if (feature !== undefined) {
          walkExpr(feature.expr, visitRef);
        }
        break;
      }
      case 'aggregate': {
        const aggregate = catalog.library.candidateAggregates[ref.id];
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
    const feature = catalog.library.stateFeatures[featureId];
    if (feature !== undefined) {
      walkExpr(feature.expr, visitRef);
    }
  }
  for (const featureId of profile.plan.candidateFeatures) {
    const feature = catalog.library.candidateFeatures[featureId];
    if (feature !== undefined) {
      walkExpr(feature.expr, visitRef);
    }
  }
  for (const aggregateId of profile.plan.candidateAggregates) {
    const aggregate = catalog.library.candidateAggregates[aggregateId];
    if (aggregate !== undefined) {
      walkExpr(aggregate.of, visitRef);
      if (aggregate.where !== undefined) {
        walkExpr(aggregate.where, visitRef);
      }
    }
  }
  for (const ruleId of profile.use.pruningRules) {
    const rule = catalog.library.pruningRules[ruleId];
    if (rule !== undefined) {
      walkExpr(rule.when, visitRef);
    }
  }
  for (const termId of profile.use.scoreTerms) {
    const term = catalog.library.scoreTerms[termId];
    if (term !== undefined) {
      if (term.when !== undefined) {
        walkExpr(term.when, visitRef);
      }
      walkExpr(term.weight, visitRef);
      walkExpr(term.value, visitRef);
    }
  }
  for (const tieBreakerId of profile.use.tieBreakers) {
    const tieBreaker = catalog.library.tieBreakers[tieBreakerId];
    if (tieBreaker?.value !== undefined) {
      walkExpr(tieBreaker.value, visitRef);
    }
  }

  return {
    current: [...current].sort(),
    preview: [...preview].sort(),
  };
}

function walkExpr(expr: AgentPolicyExpr, visitRef: (ref: CompiledAgentPolicyRef) => void): void {
  if (expr.kind === 'ref') {
    visitRef(expr.ref);
    return;
  }
  if (expr.kind !== 'op') {
    return;
  }
  for (const arg of expr.args) {
    walkExpr(arg, visitRef);
  }
}

function surfaceRefKey(ref: CompiledAgentPolicySurfaceRef): string {
  if (ref.selector === undefined) {
    return `${ref.family}.${ref.id}`;
  }
  return ref.selector.kind === 'role'
    ? `${ref.family}.${ref.id}.${ref.selector.seatToken}`
    : `${ref.family}.${ref.id}.${ref.selector.player}`;
}
