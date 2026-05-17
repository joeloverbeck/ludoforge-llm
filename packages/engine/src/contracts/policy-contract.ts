export const AGENT_POLICY_LIBRARY_BUCKETS = [
  'stateFeatures',
  'candidateFeatures',
  'candidateAggregates',
  'pruningRules',
  'considerations',
  'tieBreakers',
  'strategicConditions',
] as const;

export type AgentPolicyLibraryBucket = typeof AGENT_POLICY_LIBRARY_BUCKETS[number];

export const AGENT_POLICY_PROFILE_USE_BUCKETS = [
  'pruningRules',
  'considerations',
  'tieBreakers',
] as const;

export type AgentPolicyProfileUseBucket = typeof AGENT_POLICY_PROFILE_USE_BUCKETS[number];

export const AGENT_POLICY_PROFILE_USE_TO_LIBRARY_BUCKET = {
  pruningRules: 'pruningRules',
  considerations: 'considerations',
  tieBreakers: 'tieBreakers',
} as const satisfies Record<AgentPolicyProfileUseBucket, AgentPolicyLibraryBucket>;

export const AGENT_POLICY_PREVIEW_KEYS = ['mode'] as const;

export const AGENT_POLICY_CANDIDATE_INTRINSICS = [
  'actionId',
  'stableMoveKey',
  'paramCount',
] as const;

export type AgentPolicyCandidateIntrinsic = typeof AGENT_POLICY_CANDIDATE_INTRINSICS[number];

export const AGENT_POLICY_MICROTURN_INTRINSICS = [
  'kind',
  'decisionKey',
  'actorSeat',
  'remainingRequiredCount',
  'remainingMaxCount',
] as const;

export type AgentPolicyMicroturnIntrinsic = typeof AGENT_POLICY_MICROTURN_INTRINSICS[number];

export const AGENT_POLICY_MICROTURN_OPTION_INTRINSICS = [
  'value',
  'index',
  'stableKey',
  'tags',
  'targetKind',
] as const;

export type AgentPolicyMicroturnOptionIntrinsic = typeof AGENT_POLICY_MICROTURN_OPTION_INTRINSICS[number];

export const AGENT_POLICY_PREVIEW_OPTION_REF_KINDS = [
  'victoryCurrentMarginSelf',
  'victoryCurrentRankSelf',
  'deltaVictoryCurrentMarginSelf',
  'globalVar',
  'perPlayerVarSelf',
  'derivedMetric',
  'outcome',
  'driveDepth',
] as const;

export type AgentPolicyPreviewOptionRefKind = typeof AGENT_POLICY_PREVIEW_OPTION_REF_KINDS[number];

export const AGENT_POLICY_ZONE_TOKEN_AGG_OWNER_KEYWORDS = ['self', 'active', 'none'] as const;

export type AgentPolicyZoneTokenAggOwnerKeyword = typeof AGENT_POLICY_ZONE_TOKEN_AGG_OWNER_KEYWORDS[number];
export type AgentPolicyZoneTokenAggOwner = AgentPolicyZoneTokenAggOwnerKeyword | `${number}`;

export const AGENT_POLICY_ZONE_TOKEN_AGG_OPS = ['sum', 'count', 'min', 'max'] as const;

export type AgentPolicyZoneTokenAggOp = typeof AGENT_POLICY_ZONE_TOKEN_AGG_OPS[number];

export function isAgentPolicyZoneTokenAggOp(value: unknown): value is AgentPolicyZoneTokenAggOp {
  return typeof value === 'string'
    && AGENT_POLICY_ZONE_TOKEN_AGG_OPS.includes(value as AgentPolicyZoneTokenAggOp);
}

export const AGENT_POLICY_SEAT_AGG_AVAILABILITY_MODES = [
  'requireAllReady',
  'requireAnyReady',
  'selfAndTargetReady',
  'skipUnavailable',
] as const;

export type AgentPolicySeatAggAvailability = typeof AGENT_POLICY_SEAT_AGG_AVAILABILITY_MODES[number];

export function isAgentPolicySeatAggAvailability(value: unknown): value is AgentPolicySeatAggAvailability {
  return typeof value === 'string'
    && AGENT_POLICY_SEAT_AGG_AVAILABILITY_MODES.includes(value as AgentPolicySeatAggAvailability);
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
