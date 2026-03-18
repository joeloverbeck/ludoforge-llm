import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAgent, parseAgentSpec } from '../../../src/agents/factory.js';
import { RandomAgent } from '../../../src/agents/random-agent.js';
import { GreedyAgent } from '../../../src/agents/greedy-agent.js';

describe('createAgent', () => {
  it('returns RandomAgent for "random"', () => {
    const agent = createAgent('random');
    assert.ok(agent instanceof RandomAgent);
  });

  it('returns GreedyAgent for "greedy"', () => {
    const agent = createAgent('greedy');
    assert.ok(agent instanceof GreedyAgent);
  });

  it('throws for unknown type', () => {
    assert.throws(
      () => createAgent('unknown' as never),
      /Unknown agent type/,
    );
  });
});

describe('parseAgentSpec', () => {
  it('parses "random,greedy" for 2 players', () => {
    const agents = parseAgentSpec('random,greedy', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof RandomAgent);
    assert.ok(agents[1] instanceof GreedyAgent);
  });

  it('parses "greedy" for a single player', () => {
    const agents = parseAgentSpec('greedy', 1);
    assert.equal(agents.length, 1);
    assert.ok(agents[0] instanceof GreedyAgent);
  });

  it('throws when player count does not match', () => {
    assert.throws(
      () => parseAgentSpec('greedy', 2),
      /1 agents but game needs 2/,
    );
  });

  it('throws for retired mcts agent types in spec', () => {
    assert.throws(
      () => parseAgentSpec('mcts,random', 2),
      /Unknown agent type: mcts\. Allowed: random, greedy/,
    );
  });

  it('parses surviving random,greedy specs', () => {
    const agents = parseAgentSpec('random,greedy', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof RandomAgent);
    assert.ok(agents[1] instanceof GreedyAgent);
  });

  it('handles whitespace in spec parts', () => {
    const agents = parseAgentSpec(' random , greedy ', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof RandomAgent);
    assert.ok(agents[1] instanceof GreedyAgent);
  });

  it('handles case insensitivity', () => {
    const agents = parseAgentSpec('GREEDY,Random', 2);
    assert.equal(agents.length, 2);
    assert.ok(agents[0] instanceof GreedyAgent);
    assert.ok(agents[1] instanceof RandomAgent);
  });
});
