import { isAgentPolicyStandingRoleSelector, type AgentPolicyStandingRoleSelector } from '../contracts/index.js';

export const POLICY_STANDING_ROLE_TOKEN_PREFIX = 'role:';

export function parsePolicyStandingRoleToken(seatToken: string): AgentPolicyStandingRoleSelector | undefined {
  if (!seatToken.startsWith(POLICY_STANDING_ROLE_TOKEN_PREFIX)) return undefined;
  const role = seatToken.slice(POLICY_STANDING_ROLE_TOKEN_PREFIX.length);
  return isAgentPolicyStandingRoleSelector(role) ? role : undefined;
}
