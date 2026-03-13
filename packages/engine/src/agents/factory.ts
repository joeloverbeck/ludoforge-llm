import type { Agent } from '../kernel/types.js';
import type { MctsConfig } from './mcts/config.js';
import { GreedyAgent } from './greedy-agent.js';
import { RandomAgent } from './random-agent.js';
import { MctsAgent } from './mcts/mcts-agent.js';

export type AgentType = 'random' | 'greedy' | 'mcts';

export const createAgent = (type: AgentType, config?: Partial<MctsConfig>): Agent => {
  switch (type) {
    case 'random':
      return new RandomAgent();
    case 'greedy':
      return new GreedyAgent();
    case 'mcts':
      return new MctsAgent(config);
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
};

const isAgentType = (value: string): value is AgentType =>
  value === 'random' || value === 'greedy' || value === 'mcts';

/**
 * Parse a comma-separated agent spec string into an array of Agent instances.
 *
 * Supported formats per slot:
 *   - `random`
 *   - `greedy`
 *   - `mcts`          — default config
 *   - `mcts:1500`     — override `iterations`
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
    // Handle mcts:N syntax
    const mctsMatch = part.match(/^mcts(?::(\d+))?$/);
    if (mctsMatch) {
      const iterationsStr = mctsMatch[1];
      const config: Partial<MctsConfig> | undefined = iterationsStr !== undefined
        ? { iterations: Number(iterationsStr) }
        : undefined;
      return createAgent('mcts', config);
    }

    if (!isAgentType(part)) {
      throw new Error(`Unknown agent type: ${part}. Allowed: random, greedy, mcts`);
    }

    return createAgent(part);
  });
};
