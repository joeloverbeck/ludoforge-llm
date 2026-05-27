import { z } from 'zod';

import { IntegerSchema, NumberSchema, StringSchema } from './schemas-ast.js';

const PolicyPlanMicroturnTraceSchema = z.object({
  expectedStep: StringSchema.nullable(),
  matchedRole: StringSchema.nullable(),
  selectedLegalOption: StringSchema,
  match: z.enum(['exact', 'reselected', 'fallback']),
  deviation: StringSchema.optional(),
  fallbackReason: StringSchema.optional(),
}).strict();

const CompoundAvailabilitySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }).strict(),
  z.object({ kind: z.literal('provisional'), reason: z.enum(['depth-capped', 'partial-grant']) }).strict(),
  z.object({ kind: z.literal('unavailable'), reason: z.enum(['no-continuation', 'no-grant-predicate']) }).strict(),
]);

const PolicyPlanTraceRoleBindingSchema = z.object({
  role: StringSchema,
  selectedId: StringSchema,
  quality: NumberSchema,
  rank: IntegerSchema.nonnegative(),
  components: z.record(StringSchema, NumberSchema),
}).strict();

const PolicyPlanTraceRoleBindingStatusSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ready'),
    binding: PolicyPlanTraceRoleBindingSchema,
  }).strict(),
  z.object({
    kind: z.literal('unavailable'),
    reason: z.enum(['noSelectorMatch', 'allConstraintsFailed', 'hiddenScope']),
  }).strict(),
]);

const DecisionSurfaceMatchSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('matched') }).strict(),
  z.object({
    kind: z.literal('mismatched'),
    expected: StringSchema,
    observed: StringSchema,
  }).strict(),
]);

const RoleConstraintRejectionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('reachable'),
    reason: z.literal('unreachable'),
    via: StringSchema.optional(),
    maxHops: IntegerSchema.positive().optional(),
    from: StringSchema.optional(),
    to: StringSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal('adjacent'),
    reason: z.literal('nonAdjacent'),
    from: StringSchema.optional(),
    to: StringSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal('postState'),
    reason: z.enum(['postStateProbeExhausted', 'postStatePredicateFailed', 'postStateObserverInsufficient']),
  }).strict(),
  z.object({
    kind: z.literal('locatedIn'),
    reason: z.literal('tokenNotInContainer'),
  }).strict(),
  z.object({
    kind: z.literal('distinctOriginDestination'),
    reason: z.literal('originEqualsDestination'),
  }).strict(),
  z.object({
    kind: z.literal('notEqual'),
    reason: z.literal('rolesEqual'),
  }).strict(),
]);

const RoleConstraintRejectionRecordSchema = z.object({
  role: StringSchema,
  candidateId: StringSchema,
  rejection: RoleConstraintRejectionSchema,
}).strict();

export const PolicyPlanTraceSchema = z.object({
  status: z.enum(['selected', 'noTemplate', 'noEligibleTemplate', 'noRootMatch', 'noRoleBinding']),
  capClass: StringSchema.optional(),
  capLimit: IntegerSchema.nonnegative().optional(),
  selectedTemplate: StringSchema.optional(),
  selectedIntent: StringSchema.optional(),
  selectedRootStableMoveKey: StringSchema.optional(),
  activeDoctrines: z.array(StringSchema),
  rejectedDoctrines: z.array(z.object({
    doctrineId: StringSchema,
    reason: z.enum(['inactive', 'noRootMatch']),
  }).strict()),
  filteredOutTemplates: z.array(z.object({
    templateId: StringSchema,
    gatedBy: z.array(StringSchema),
    reason: z.enum(['notEnabled', 'suppressed']),
  }).strict()),
  roleBindingStatuses: z.array(z.object({
    role: StringSchema,
    status: PolicyPlanTraceRoleBindingStatusSchema,
  }).strict()),
  alternatives: z.array(z.object({
    templateId: StringSchema,
    rootStableMoveKey: StringSchema,
    score: NumberSchema,
    priorityTier: NumberSchema,
    stableKey: StringSchema,
    compoundAvailability: CompoundAvailabilitySchema.optional(),
    decisionSurfaceMatch: DecisionSurfaceMatchSchema.optional(),
    rejectedByConstraint: z.array(RoleConstraintRejectionRecordSchema).optional(),
    rejectedByConstraintTruncatedCount: IntegerSchema.nonnegative().optional(),
  }).strict()),
  posture: z.object({ status: StringSchema, mustViolations: z.array(z.object({ id: StringSchema, action: z.enum(['demote', 'veto']), penalty: NumberSchema.optional() }).strict()), preferContributions: z.array(z.object({ id: StringSchema, status: StringSchema, value: NumberSchema.optional(), weight: NumberSchema.optional(), contribution: NumberSchema, fallbackReason: StringSchema.optional() }).strict()), allyWeightContext: z.object({ activeRoles: z.array(z.object({ relationshipId: StringSchema, role: StringSchema, seat: StringSchema, priority: IntegerSchema, gainValue: NumberSchema.optional() }).strict()), flips: z.array(z.object({ contributionId: StringSchema, allyRole: StringSchema, thresholdRole: StringSchema, seat: StringSchema, fired: z.boolean() }).strict()) }).strict().optional() }).strict(),
  microturns: z.array(PolicyPlanMicroturnTraceSchema).optional(),
}).strict();
