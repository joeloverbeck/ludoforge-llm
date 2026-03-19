import type { Agent, AgentDescriptor, BuiltinAgentId, PolicyAgentDescriptor } from '../kernel/types.js';
import { GreedyAgent } from './greedy-agent.js';
import { PolicyAgent, type PolicyAgentConfig } from './policy-agent.js';
import { RandomAgent } from './random-agent.js';

export type AgentFactoryOptions = Omit<PolicyAgentConfig, 'profileId'>;

const BUILTIN_AGENT_IDS: readonly BuiltinAgentId[] = ['random', 'greedy'];

const isBuiltinAgentId = (value: string): value is BuiltinAgentId =>
  BUILTIN_AGENT_IDS.includes(value as BuiltinAgentId);

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

export const normalizeAgentDescriptor = (descriptor: AgentDescriptor): AgentDescriptor => {
  if (descriptor.kind === 'builtin') {
    if (!isBuiltinAgentId(descriptor.builtinId)) {
      throw new Error(`Unknown builtin agent id: ${String(descriptor.builtinId)}. Allowed: ${BUILTIN_AGENT_IDS.join(', ')}`);
    }
    return { kind: 'builtin', builtinId: descriptor.builtinId };
  }

  if (descriptor.kind === 'policy') {
    return normalizePolicyDescriptor(descriptor.profileId);
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
    const builtinId = rest.join(':').trim().toLowerCase();
    if (!isBuiltinAgentId(builtinId)) {
      throw new Error(`Unknown builtin agent id: ${builtinId || '<empty>'}. Allowed: ${BUILTIN_AGENT_IDS.join(', ')}`);
    }
    return { kind: 'builtin', builtinId };
  }

  throw new Error(
    `Unknown agent descriptor: ${trimmed}. Allowed forms: policy, policy:<profileId>, builtin:random, builtin:greedy`,
  );
};

export const createAgent = (descriptor: AgentDescriptor, options: AgentFactoryOptions = {}): Agent => {
  const normalized = normalizeAgentDescriptor(descriptor);

  if (normalized.kind === 'builtin') {
    switch (normalized.builtinId) {
      case 'random':
      return new RandomAgent();
      case 'greedy':
      return new GreedyAgent();
      default:
        throw new Error(`Unknown builtin agent id: ${normalized.builtinId}`);
    }
  }

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
 *   - `builtin:random`
 *   - `builtin:greedy`
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
