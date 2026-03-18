import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAgent, parseAgentSpec } from '../../../src/agents/factory.js';
import { RandomAgent } from '../../../src/agents/random-agent.js';
import { GreedyAgent } from '../../../src/agents/greedy-agent.js';
import { MctsAgent } from '../../../src/agents/mcts/mcts-agent.js';
import { DEFAULT_MCTS_CONFIG } from '../../../src/agents/mcts/config.js';

// ---------------------------------------------------------------------------
// createAgent
// ---------------------------------------------------------------------------

describe('createAgent', () => {
  it('returns RandomAgent for "random"', () => {
    const agent = createAgent('random');
    assert.ok(agent instanceof RandomAgent);
  });

  it('returns GreedyAgent for "greedy"', () => {
    const agent = createAgent('greedy');
    assert.ok(agent instanceof GreedyAgent);
  });

  it('returns MctsAgent with default config for "mcts"', () => {
    const agent = createAgent('mcts');
    assert.ok(agent instanceof MctsAgent);
    assert.equal((agent as MctsAgent).config.iterations, DEFAULT_MCTS_CONFIG.iterations);
  });

  it('returns MctsAgent with custom iterations for "mcts" + config', () => {
    const agent = createAgent('mcts', { iterations: 500 });
    assert.ok(agent instanceof MctsAgent);
    assert.equal((agent as MctsAgent).config.iterations, 500);
  });

  it('throws for unknown type', () => {
    assert.throws(
      () => createAgent('unknown' as never),
      /Unknown agent type/,
    );
  });
});

// ---------------------------------------------------------------------------
// parseAgentSpec
// ---------------------------------------------------------------------------

describe('parseAgentSpec', () => {
  it('parses "mcts,random" for 2 players', () => {
    const agents = parseAgentSpec('mcts,random', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.ok(agents[1] instanceof RandomAgent);
  });

  it('parses "mcts:500,greedy" for 2 players with custom iterations', () => {
    const agents = parseAgentSpec('mcts:500,greedy', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.equal((agents[0] as MctsAgent).config.iterations, 500);
    assert.ok(agents[1] instanceof GreedyAgent);
  });

  it('parses "mcts" with default iterations', () => {
    const agents = parseAgentSpec('mcts', 1);
    assert.equal(agents.length, 1);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.equal((agents[0] as MctsAgent).config.iterations, DEFAULT_MCTS_CONFIG.iterations);
  });

  it('throws when player count does not match', () => {
    assert.throws(
      () => parseAgentSpec('mcts', 2),
      /1 agents but game needs 2/,
    );
  });

  it('throws for unknown agent type in spec', () => {
    assert.throws(
      () => parseAgentSpec('mcts,unknown', 2),
      /Unknown agent type: unknown/,
    );
  });

  it('preserves backwards compatibility with random,greedy specs', () => {
    const agents = parseAgentSpec('random,greedy', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof RandomAgent);
    assert.ok(agents[1] instanceof GreedyAgent);
  });

  it('handles whitespace in spec parts', () => {
    const agents = parseAgentSpec(' mcts , random ', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.ok(agents[1] instanceof RandomAgent);
  });

  it('handles case insensitivity', () => {
    const agents = parseAgentSpec('MCTS,Random', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.ok(agents[1] instanceof RandomAgent);
  });

  it('parses mcts:1500 with explicit iteration count', () => {
    const agents = parseAgentSpec('mcts:1500', 1);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.equal((agents[0] as MctsAgent).config.iterations, 1500);
  });

  // -----------------------------------------------------------------------
  // Preset parsing
  // -----------------------------------------------------------------------

  it('parses "mcts:fast,random" for 2 players', () => {
    const agents = parseAgentSpec('mcts:fast,random', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.equal((agents[0] as MctsAgent).config.iterations, 200);
    assert.ok(agents[1] instanceof RandomAgent);
  });

  it('parses "mcts:strong,mcts:fast" for 2 players with different configs', () => {
    const agents = parseAgentSpec('mcts:strong,mcts:fast', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.equal((agents[0] as MctsAgent).config.iterations, 5000);
    assert.ok(agents[1] instanceof MctsAgent);
    assert.equal((agents[1] as MctsAgent).config.iterations, 200);
  });

  it('parses "mcts:default,greedy" for 2 players', () => {
    const agents = parseAgentSpec('mcts:default,greedy', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.equal((agents[0] as MctsAgent).config.iterations, DEFAULT_MCTS_CONFIG.iterations);
    assert.ok(agents[1] instanceof GreedyAgent);
  });

  it('throws descriptive error for invalid preset name', () => {
    assert.throws(
      () => parseAgentSpec('mcts:invalid', 1),
      /Unknown MCTS profile or iteration count: "invalid"/,
    );
  });

  it('backwards compatible: bare "mcts" still uses default config', () => {
    const agents = parseAgentSpec('mcts', 1);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.equal((agents[0] as MctsAgent).config.iterations, DEFAULT_MCTS_CONFIG.iterations);
  });

  it('backwards compatible: "mcts:500" still uses numeric iterations', () => {
    const agents = parseAgentSpec('mcts:500', 1);
    assert.ok(agents[0] instanceof MctsAgent);
    assert.equal((agents[0] as MctsAgent).config.iterations, 500);
  });
});
