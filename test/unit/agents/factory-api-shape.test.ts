import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createAgent, parseAgentSpec } from '../../../src/agents/index.js';

describe('agents factory API shape', () => {
  it("createAgent('random') returns an object with chooseMove", () => {
    const agent = createAgent('random');
    assert.equal(typeof agent.chooseMove, 'function');
  });

  it("createAgent('greedy') returns an object with chooseMove", () => {
    const agent = createAgent('greedy');
    assert.equal(typeof agent.chooseMove, 'function');
  });

  it("createAgent('unknown' as never) throws Unknown agent type", () => {
    assert.throws(() => createAgent('unknown' as never), /Unknown agent type: unknown/);
  });

  it('parseAgentSpec export exists and validates count mismatch', () => {
    assert.equal(typeof parseAgentSpec, 'function');
    assert.throws(() => parseAgentSpec('random', 2), /Agent spec has 1 agents but game needs 2 players/);
  });

  it('parseAgentSpec creates one agent per normalized token', () => {
    const agents = parseAgentSpec(' random , GREEDY ', 2);
    assert.equal(agents.length, 2);
    assert.equal(typeof agents[0]?.chooseMove, 'function');
    assert.equal(typeof agents[1]?.chooseMove, 'function');
  });

  it('parseAgentSpec rejects unknown agent names', () => {
    assert.throws(() => parseAgentSpec('random,smart', 2), /Unknown agent type: smart\. Allowed: random, greedy/);
  });
});
