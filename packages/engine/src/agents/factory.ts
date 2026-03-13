import type { Agent } from '../kernel/types.js';
import { MCTS_PRESET_NAMES, resolvePreset } from './mcts/config.js';
import type { MctsConfig, MctsPreset } from './mcts/config.js';
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
 *   - `mcts`            — default preset
 *   - `mcts:1500`       — override `iterations`
 *   - `mcts:fast`       — named preset
 *   - `mcts:default`    — named preset (same as bare `mcts`)
 *   - `mcts:strong`     — named preset
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
    // Handle bare `mcts`
    if (part === 'mcts') {
      return createAgent('mcts');
    }

    // Handle mcts:<suffix> — preset name, numeric iterations, or error
    const mctsColonMatch = part.match(/^mcts:(.+)$/);
    if (mctsColonMatch) {
      const suffix = mctsColonMatch[1]!;

      // Named preset?
      if ((MCTS_PRESET_NAMES as readonly string[]).includes(suffix)) {
        return new MctsAgent(resolvePreset(suffix as MctsPreset));
      }

      // Numeric iterations?
      if (/^\d+$/.test(suffix)) {
        return createAgent('mcts', { iterations: Number(suffix) });
      }

      throw new Error(
        `Unknown MCTS preset or iteration count: "${suffix}". `
        + `Allowed presets: ${MCTS_PRESET_NAMES.join(', ')}; or a positive integer for iterations`,
      );
    }

    if (!isAgentType(part)) {
      throw new Error(`Unknown agent type: ${part}. Allowed: random, greedy, mcts`);
    }

    return createAgent(part);
  });
};
