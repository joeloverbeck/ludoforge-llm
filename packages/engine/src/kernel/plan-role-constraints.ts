export const SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS = ['notEqual'] as const;

export type SupportedPlanRoleConstraintKind = typeof SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS[number];

export function isSupportedPlanRoleConstraintKind(
  kind: string,
): kind is SupportedPlanRoleConstraintKind {
  return (SUPPORTED_PLAN_ROLE_CONSTRAINT_KINDS as readonly string[]).includes(kind);
}
