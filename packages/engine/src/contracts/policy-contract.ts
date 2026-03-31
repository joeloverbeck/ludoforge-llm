export const AGENT_POLICY_LIBRARY_BUCKETS = [
  'stateFeatures',
  'candidateFeatures',
  'candidateAggregates',
  'pruningRules',
  'scoreTerms',
  'completionScoreTerms',
  'tieBreakers',
  'strategicConditions',
] as const;

export type AgentPolicyLibraryBucket = typeof AGENT_POLICY_LIBRARY_BUCKETS[number];

export const AGENT_POLICY_PROFILE_USE_BUCKETS = [
  'pruningRules',
  'scoreTerms',
  'completionScoreTerms',
  'tieBreakers',
] as const;

export type AgentPolicyProfileUseBucket = typeof AGENT_POLICY_PROFILE_USE_BUCKETS[number];

export const AGENT_POLICY_PROFILE_USE_TO_LIBRARY_BUCKET = {
  pruningRules: 'pruningRules',
  scoreTerms: 'scoreTerms',
  completionScoreTerms: 'completionScoreTerms',
  tieBreakers: 'tieBreakers',
} as const satisfies Record<AgentPolicyProfileUseBucket, AgentPolicyLibraryBucket>;

export const AGENT_POLICY_COMPLETION_GUIDANCE_KEYS = ['enabled', 'fallback'] as const;

export const AGENT_POLICY_PREVIEW_KEYS = ['tolerateRngDivergence'] as const;

export const AGENT_POLICY_COMPLETION_GUIDANCE_FALLBACKS = ['random', 'first'] as const;

export type AgentPolicyCompletionGuidanceFallback = typeof AGENT_POLICY_COMPLETION_GUIDANCE_FALLBACKS[number];

export function isAgentPolicyCompletionGuidanceFallback(
  value: unknown,
): value is AgentPolicyCompletionGuidanceFallback {
  return typeof value === 'string'
    && AGENT_POLICY_COMPLETION_GUIDANCE_FALLBACKS.includes(value as AgentPolicyCompletionGuidanceFallback);
}

export const AGENT_POLICY_CANDIDATE_INTRINSICS = [
  'actionId',
  'stableMoveKey',
  'isPass',
  'paramCount',
] as const;

export type AgentPolicyCandidateIntrinsic = typeof AGENT_POLICY_CANDIDATE_INTRINSICS[number];

export const AGENT_POLICY_DECISION_INTRINSICS = [
  'type',
  'name',
  'targetKind',
  'optionCount',
] as const;

export type AgentPolicyDecisionIntrinsic = typeof AGENT_POLICY_DECISION_INTRINSICS[number];

export const AGENT_POLICY_OPTION_INTRINSICS = ['value'] as const;

export type AgentPolicyOptionIntrinsic = typeof AGENT_POLICY_OPTION_INTRINSICS[number];

export const AGENT_POLICY_ZONE_TOKEN_AGG_OWNER_KEYWORDS = ['self', 'active', 'none'] as const;

export type AgentPolicyZoneTokenAggOwnerKeyword = typeof AGENT_POLICY_ZONE_TOKEN_AGG_OWNER_KEYWORDS[number];
export type AgentPolicyZoneTokenAggOwner = AgentPolicyZoneTokenAggOwnerKeyword | `${number}`;

export const AGENT_POLICY_ZONE_TOKEN_AGG_OPS = ['sum', 'count', 'min', 'max'] as const;

export type AgentPolicyZoneTokenAggOp = typeof AGENT_POLICY_ZONE_TOKEN_AGG_OPS[number];

export function isAgentPolicyZoneTokenAggOp(value: unknown): value is AgentPolicyZoneTokenAggOp {
  return typeof value === 'string'
    && AGENT_POLICY_ZONE_TOKEN_AGG_OPS.includes(value as AgentPolicyZoneTokenAggOp);
}

export const AGENT_POLICY_ZONE_FILTER_OPS = ['eq', 'gt', 'gte', 'lt', 'lte'] as const;

export type AgentPolicyZoneFilterOp = typeof AGENT_POLICY_ZONE_FILTER_OPS[number];

export function isAgentPolicyZoneFilterOp(value: unknown): value is AgentPolicyZoneFilterOp {
  return typeof value === 'string'
    && AGENT_POLICY_ZONE_FILTER_OPS.includes(value as AgentPolicyZoneFilterOp);
}

export const AGENT_POLICY_ZONE_SCOPES = ['board', 'aux', 'all'] as const;

export type AgentPolicyZoneScope = typeof AGENT_POLICY_ZONE_SCOPES[number];

export function isAgentPolicyZoneScope(value: unknown): value is AgentPolicyZoneScope {
  return typeof value === 'string'
    && AGENT_POLICY_ZONE_SCOPES.includes(value as AgentPolicyZoneScope);
}

export const AGENT_POLICY_ZONE_AGG_SOURCES = ['variable', 'attribute'] as const;

export type AgentPolicyZoneAggSource = typeof AGENT_POLICY_ZONE_AGG_SOURCES[number];

export function isAgentPolicyZoneAggSource(value: unknown): value is AgentPolicyZoneAggSource {
  return typeof value === 'string'
    && AGENT_POLICY_ZONE_AGG_SOURCES.includes(value as AgentPolicyZoneAggSource);
}

export function isAgentPolicyZoneTokenAggOwner(value: string): value is AgentPolicyZoneTokenAggOwner {
  return AGENT_POLICY_ZONE_TOKEN_AGG_OWNER_KEYWORDS.includes(value as AgentPolicyZoneTokenAggOwnerKeyword)
    || /^[0-9]+$/.test(value);
}
