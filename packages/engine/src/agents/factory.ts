import type { Agent } from '../kernel/types.js';
import { GreedyAgent } from './greedy-agent.js';
import { PolicyAgent, type PolicyAgentConfig } from './policy-agent.js';
import { RandomAgent } from './random-agent.js';

export type AgentType = 'random' | 'greedy' | 'policy';

export const createAgent = (type: AgentType, options: PolicyAgentConfig = {}): Agent => {
  switch (type) {
    case 'random':
      return new RandomAgent();
    case 'greedy':
      return new GreedyAgent();
    case 'policy':
      return new PolicyAgent(options);
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
};

const isAgentType = (value: string): value is AgentType =>
  value === 'random' || value === 'greedy' || value === 'policy';

/**
 * Parse a comma-separated agent spec string into an array of Agent instances.
 *
 * Supported formats per slot:
 *   - `random`
 *   - `greedy`
 *   - `policy`
 */
export const parseAgentSpec = (spec: string, playerCount: number): readonly Agent[] => {
  const parts = spec
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);

  if (parts.length !== playerCount) {
    throw new Error(`Agent spec has ${parts.length} agents but game needs ${playerCount} players`);
  }

  return parts.map((part) => {
    if (!isAgentType(part)) {
      throw new Error(`Unknown agent type: ${part}. Allowed: random, greedy, policy`);
    }

    return createAgent(part);
  });
};
