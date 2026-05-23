// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PolicyAgent } from '../../src/agents/index.js';
import { serializeGameState } from '../../src/kernel/index.js';
import { runGame } from '../../src/sim/index.js';
import { createSpec190PlanRootDef } from '../helpers/spec-190-plan-root-fixture.js';

const serializeFinalState = (state: Parameters<typeof serializeGameState>[0]): string =>
  JSON.stringify(serializeGameState(state));

describe('Spec 190 plan-selected replay identity', () => {
  it('replays identical plan traces, decisions, and canonical terminal state for the same plan-selected trajectory', () => {
    const def = createSpec190PlanRootDef();
    const agents = [
      new PolicyAgent({ traceLevel: 'verbose' }),
      new PolicyAgent({ traceLevel: 'verbose' }),
    ];
    const replayAgents = [
      new PolicyAgent({ traceLevel: 'verbose' }),
      new PolicyAgent({ traceLevel: 'verbose' }),
    ];

    const first = runGame(def, 1904, agents, 3, 2, { skipDeltas: true });
    const second = runGame(def, 1904, replayAgents, 3, 2, { skipDeltas: true });

    assert.deepEqual(first.decisions.map((decision) => decision.decision), second.decisions.map((decision) => decision.decision));
    assert.deepEqual(first.decisions.map((decision) => decision.agentDecision?.plan), second.decisions.map((decision) => decision.agentDecision?.plan));
    assert.ok(first.decisions.some((decision) => decision.agentDecision?.plan?.status === 'selected'));
    assert.equal(first.stopReason, 'terminal');
    assert.equal(second.stopReason, 'terminal');
    assert.equal(serializeFinalState(first.finalState), serializeFinalState(second.finalState));
  });
});
