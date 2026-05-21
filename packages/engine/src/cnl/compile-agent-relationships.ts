import {
  isAgentPolicyRelationshipRole,
  isAgentPolicyStandingRoleSelector,
} from '../contracts/index.js';
import { analyzePolicyExpr, type AnalyzePolicyExprContext } from '../agents/policy-expr.js';
import type { Diagnostic } from '../kernel/diagnostics.js';
import type {
  AgentPolicyExpr,
  CompiledPolicyRelationship,
} from '../kernel/types.js';
import type { GameSpecRelationshipDef } from './game-spec-doc.js';
import { CNL_COMPILER_DIAGNOSTIC_CODES } from './compiler-diagnostic-codes.js';

export type AgentRelationshipWithExpr = CompiledPolicyRelationship & {
  readonly gainValue?: AgentPolicyExpr;
};

export interface LowerRelationshipOptions {
  readonly relationshipId: string;
  readonly def: GameSpecRelationshipDef;
  readonly basePath: string;
  readonly diagnostics: Diagnostic[];
  readonly createExprContext: () => AnalyzePolicyExprContext;
  readonly isKnownSeatToken: (seatToken: string, path: string, refPath: string) => boolean;
  readonly compileStrategicCondition: (conditionId: string) => unknown | null;
  readonly reportUnknownLibraryRef: (refPath: string, path: string) => void;
}

export function lowerRelationshipDefinition(
  options: LowerRelationshipOptions,
): AgentRelationshipWithExpr | null {
  const {
    relationshipId,
    def,
    basePath,
    diagnostics,
    createExprContext,
    isKnownSeatToken,
    compileStrategicCondition,
    reportUnknownLibraryRef,
  } = options;

  if (!isAgentPolicyRelationshipRole(def.role)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
      path: `${basePath}.role`,
      severity: 'error',
      message: `Relationship "${relationshipId}" must declare a known generic relationship role.`,
      suggestion: 'Use nominalAlly, sharedEnemy, rivalAlly, leader, nearWin, kingmakerRisk, or cooperativeUntilThreshold.',
    });
    return null;
  }

  if (def.seat === undefined && def.standingRole === undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
      path: basePath,
      severity: 'error',
      message: `Relationship "${relationshipId}" must bind through either seat or standingRole.`,
      suggestion: 'Set seat to a canonical seat id or standingRole to currentLeader/nearestThreat/closestAhead/closestBehind.',
    });
    return null;
  }
  if (def.seat !== undefined && def.standingRole !== undefined) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
      path: basePath,
      severity: 'error',
      message: `Relationship "${relationshipId}" cannot declare both seat and standingRole.`,
      suggestion: 'Choose one binding target and gate it with condition if needed.',
    });
    return null;
  }
  if (def.seat !== undefined && !isKnownSeatToken(def.seat, `${basePath}.seat`, def.seat)) {
    return null;
  }
  if (def.standingRole !== undefined && !isAgentPolicyStandingRoleSelector(def.standingRole)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_REF_UNKNOWN,
      path: `${basePath}.standingRole`,
      severity: 'error',
      message: `Relationship "${relationshipId}" references unknown standing role "${def.standingRole}".`,
      suggestion: 'Use currentLeader, nearestThreat, closestAhead, or closestBehind.',
    });
    return null;
  }
  if (def.condition !== undefined && compileStrategicCondition(def.condition) === null) {
    reportUnknownLibraryRef(`condition.${def.condition}`, `${basePath}.condition`);
    return null;
  }
  if (def.priority !== undefined && !Number.isSafeInteger(def.priority)) {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path: `${basePath}.priority`,
      severity: 'error',
      message: `Relationship "${relationshipId}" priority must be a safe integer.`,
      suggestion: 'Use an integer priority for deterministic same-role ordering.',
    });
    return null;
  }

  const context = createExprContext();
  const gainValue = def.gainValue === undefined
    ? undefined
    : analyzePolicyExpr(def.gainValue, context, diagnostics, `${basePath}.gainValue`);
  if (gainValue === null) {
    return null;
  }
  if (gainValue !== undefined && gainValue.valueType !== 'number' && gainValue.valueType !== 'unknown') {
    diagnostics.push({
      code: CNL_COMPILER_DIAGNOSTIC_CODES.CNL_COMPILER_AGENT_POLICY_TYPE_INVALID,
      path: `${basePath}.gainValue`,
      severity: 'error',
      message: `Relationship "${relationshipId}" gainValue must compile to number.`,
      suggestion: 'Use a numeric policy expression for gainValue.',
    });
    return null;
  }

  return {
    role: def.role,
    ...(def.seat === undefined ? {} : { seat: def.seat }),
    ...(def.standingRole === undefined ? {} : { standingRole: def.standingRole }),
    ...(def.condition === undefined ? {} : { condition: def.condition }),
    priority: def.priority ?? 0,
    ...(gainValue === undefined ? {} : { gainValue: gainValue.expr }),
  };
}

export function parseRelationshipRefPath(
  refPath: string,
): { readonly role: CompiledPolicyRelationship['role']; readonly field: 'seat' | 'gainValue' } | null {
  const parts = refPath.split('.');
  if (parts.length !== 3 || parts[0] !== 'relationship') {
    return null;
  }
  const role = parts[1];
  const field = parts[2];
  if (!isAgentPolicyRelationshipRole(role) || (field !== 'seat' && field !== 'gainValue')) {
    return null;
  }
  return { role, field };
}
