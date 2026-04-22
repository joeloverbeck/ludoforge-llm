import type { Agent, AgentDescriptor, PolicyAgentDescriptor } from '../kernel/types.js';
import { PolicyAgent, type PolicyAgentConfig } from './policy-agent.js';

export type AgentFactoryOptions = Omit<PolicyAgentConfig, 'profileId'>;

const normalizePolicyDescriptor = (profileId: string | undefined): PolicyAgentDescriptor => {
  if (profileId === undefined) {
    return { kind: 'policy' };
  }

  const trimmedProfileId = profileId.trim();
  if (trimmedProfileId.length === 0) {
    throw new Error('Policy agent profileId cannot be empty');
  }

  return { kind: 'policy', profileId: trimmedProfileId };
};

const LEGACY_AGENT_DESCRIPTOR_ERROR =
  'Legacy builtin agent descriptors are no longer supported. Use policy or policy:<profileId>.';

export const normalizeAgentDescriptor = (descriptor: AgentDescriptor): AgentDescriptor => {
  if (descriptor.kind === 'policy') {
    return normalizePolicyDescriptor(descriptor.profileId);
  }

  if ((descriptor as { kind?: unknown }).kind === 'builtin') {
    throw new Error(LEGACY_AGENT_DESCRIPTOR_ERROR);
  }

  throw new Error(`Unknown agent descriptor kind: ${String((descriptor as { kind?: unknown }).kind)}`);
};

export const parseAgentDescriptor = (spec: string): AgentDescriptor => {
  const trimmed = spec.trim();
  if (trimmed.length === 0) {
    throw new Error('Agent descriptor cannot be empty');
  }

  const [kindToken = '', ...rest] = trimmed.split(':');
  const kind = kindToken.trim().toLowerCase();
  if (kind === 'policy') {
    return normalizePolicyDescriptor(rest.length === 0 ? undefined : rest.join(':'));
  }

  if (kind === 'builtin') {
    throw new Error(LEGACY_AGENT_DESCRIPTOR_ERROR);
  }

  throw new Error(`Unknown agent descriptor: ${trimmed}. Allowed forms: policy, policy:<profileId>`);
};

export const createAgent = (descriptor: AgentDescriptor, options: AgentFactoryOptions = {}): Agent => {
  const normalized = normalizeAgentDescriptor(descriptor);

  return new PolicyAgent({
    ...options,
    ...(normalized.profileId === undefined ? {} : { profileId: normalized.profileId }),
  });
};

/**
 * Parse a comma-separated agent spec string into an array of agent descriptors.
 *
 * Supported formats per slot:
 *   - `policy`
 *   - `policy:<profileId>`
 */
export const parseAgentSpec = (spec: string, playerCount: number): readonly AgentDescriptor[] => {
  const parts = spec
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length !== playerCount) {
    throw new Error(`Agent spec has ${parts.length} agents but game needs ${playerCount} players`);
  }

  return parts.map(parseAgentDescriptor);
};
