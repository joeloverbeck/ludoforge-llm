// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RandomAgent } from '../../../src/agents/random-agent.js';
import { asSeatId } from '../../../src/kernel/branded.js';
import { createRng } from '../../../src/kernel/prng.js';
import type { AgentMicroturnDecisionInput } from '../../../src/kernel/types-core.js';
import type { DecisionKey } from '../../../src/kernel/decision-scope.js';

const DECISION_KEY = 'decision:test' as DecisionKey;
const SEAT_ID = asSeatId('0');

const makeInput = (
  legalActions: AgentMicroturnDecisionInput['microturn']['legalActions'],
): AgentMicroturnDecisionInput => ({
  def: {} as AgentMicroturnDecisionInput['def'],
  state: {} as AgentMicroturnDecisionInput['state'],
  microturn: {
    kind: 'chooseNStep',
    seatId: SEAT_ID,
    decisionContext: {
      kind: 'chooseNStep',
      seatId: SEAT_ID,
      decisionKey: DECISION_KEY,
      options: [],
      selectedSoFar: [],
      cardinality: { min: 0, max: 2 },
      stepCommands: ['add', 'remove', 'confirm'],
    },
    legalActions,
    projectedState: { state: {} as AgentMicroturnDecisionInput['state'] },
    turnId: 0 as AgentMicroturnDecisionInput['microturn']['turnId'],
    frameId: 0 as AgentMicroturnDecisionInput['microturn']['frameId'],
    compoundTurnTrace: [],
  },
  rng: createRng(17n),
});

describe('RandomAgent', () => {
  it('confirms a chooseNStep selection as soon as confirm is legal', () => {
    const agent = new RandomAgent();
    const result = agent.chooseDecision(makeInput([
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'remove', value: 'A' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'add', value: 'B' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'confirm' },
    ]));

    assert.equal(result.decision.kind, 'chooseNStep');
    assert.equal(result.decision.command, 'confirm');
  });

  it('prefers add over remove when a chooseNStep frontier is not yet confirmable', () => {
    const agent = new RandomAgent();
    const result = agent.chooseDecision(makeInput([
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'remove', value: 'A' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'add', value: 'B' },
    ]));

    assert.equal(result.decision.kind, 'chooseNStep');
    assert.equal(result.decision.command, 'add');
  });

  it('still selects remove when it is the only legal chooseNStep action', () => {
    const agent = new RandomAgent();
    const result = agent.chooseDecision(makeInput([
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'remove', value: 'A' },
    ]));

    assert.equal(result.decision.kind, 'chooseNStep');
    assert.equal(result.decision.command, 'remove');
  });
});
