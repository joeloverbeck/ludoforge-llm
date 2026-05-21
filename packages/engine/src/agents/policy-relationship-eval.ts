import { stablePayloadCode } from '../cnl/policy-bytecode/feature-table.js';
import type {
  CompiledPolicyExpr,
  CompiledPolicyRelationship,
  GameDef,
  GameState,
} from '../kernel/types.js';
import { resolvePolicyStandingRoleSelector, type PolicyValue } from './policy-surface.js';

export interface ActivePolicyRelationshipRole {
  readonly relationshipId: string;
  readonly role: string;
  readonly seat: string;
  readonly priority: number;
  readonly gainValue?: number;
}

interface PolicyRelationshipEvalOptions {
  readonly def: GameDef;
  readonly state: GameState;
  readonly seatId: string;
  readonly relationships: Readonly<Record<string, CompiledPolicyRelationship>>;
  readonly resolveCondition: (conditionId: string) => boolean;
  readonly evaluateExpr: (expr: CompiledPolicyExpr) => PolicyValue;
}

export const activePolicyRelationshipRoles = (
  options: PolicyRelationshipEvalOptions,
): readonly ActivePolicyRelationshipRole[] =>
  activeRelationshipEntries(options).flatMap(([relationshipId, relationship]) => {
    const seat = relationshipSeat(options, relationship);
    if (seat === undefined) {
      return [];
    }
    const gainValue = relationship.gainValue === undefined ? undefined : options.evaluateExpr(relationship.gainValue);
    return [{
      relationshipId,
      role: relationship.role,
      seat,
      priority: relationship.priority,
      ...(typeof gainValue === 'number' && Number.isFinite(gainValue) ? { gainValue } : {}),
    }];
  });

export const resolvePolicyRelationshipRef = (
  options: PolicyRelationshipEvalOptions,
  role: CompiledPolicyRelationship['role'],
  field: 'seat' | 'gainValue',
): PolicyValue => {
  const relationship = activeRelationshipEntries(options).find(([, entry]) => entry.role === role)?.[1];
  if (relationship === undefined) {
    return undefined;
  }
  if (field === 'seat') {
    return relationship.standingRole === undefined
      ? relationship.seat
      : resolvePolicyStandingRoleSelector(options.def, options.state, relationship.standingRole, options.seatId);
  }
  return relationship.gainValue === undefined ? undefined : options.evaluateExpr(relationship.gainValue);
};

const activeRelationshipEntries = (
  options: PolicyRelationshipEvalOptions,
): readonly (readonly [string, CompiledPolicyRelationship])[] => {
  const selected: (readonly [string, CompiledPolicyRelationship])[] = [];
  const seenRoles = new Set<string>();
  const entries = Object.entries(options.relationships)
    .sort((left, right) =>
      left[1].priority - right[1].priority
      || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0),
    );
  for (const [relationshipId, relationship] of entries) {
    if (seenRoles.has(relationship.role)) {
      continue;
    }
    if (relationship.condition !== undefined && !options.resolveCondition(relationship.condition)) {
      continue;
    }
    selected.push([relationshipId, relationship]);
    seenRoles.add(relationship.role);
  }
  return selected;
};

const relationshipSeat = (
  options: PolicyRelationshipEvalOptions,
  relationship: CompiledPolicyRelationship,
): string | undefined => {
  if (relationship.seat !== undefined) {
    return relationship.seat;
  }
  if (relationship.standingRole === undefined) {
    return undefined;
  }
  const encodedSeat = resolvePolicyStandingRoleSelector(
    options.def,
    options.state,
    relationship.standingRole,
    options.seatId,
  );
  if (typeof encodedSeat !== 'number') {
    return undefined;
  }
  return (options.def.seats ?? [])
    .map((seat) => String(seat.id))
    .find((seatId) => stablePayloadCode({ literal: seatId }) === encodedSeat);
};
