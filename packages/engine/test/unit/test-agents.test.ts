// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asSeatId } from '../../src/kernel/branded.js';
import { createRng } from '../../src/kernel/prng.js';
import type { AgentMicroturnDecisionInput } from '../../src/kernel/types-core.js';
import type { DecisionKey } from '../../src/kernel/decision-scope.js';
import {
  chooseNProgressAgent,
  createSeededChoiceAgent,
  firstLegalAgent,
} from '../helpers/test-agents.js';

const DECISION_KEY = 'decision:test' as DecisionKey;
const SEAT_ID = asSeatId('0');

const makeInput = (
  legalActions: AgentMicroturnDecisionInput['microturn']['legalActions'],
  seed = 17n,
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
  rng: createRng(seed),
});

describe('test-only agents', () => {
  it('firstLegalAgent picks the first published action without mutating rng', () => {
    const input = makeInput([
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'remove', value: 'A' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'add', value: 'B' },
    ]);

    const result = firstLegalAgent.chooseDecision(input);
    assert.equal(result.decision.kind, 'chooseNStep');
    assert.equal(result.decision.command, 'remove');
    assert.equal(result.rng, input.rng);
  });

  it('chooseNProgressAgent prefers confirm, then add, then the first legal fallback', () => {
    const confirmable = chooseNProgressAgent.chooseDecision(makeInput([
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'remove', value: 'A' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'confirm' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'add', value: 'B' },
    ]));
    assert.equal(confirmable.decision.kind, 'chooseNStep');
    assert.equal(confirmable.decision.command, 'confirm');

    const addOnly = chooseNProgressAgent.chooseDecision(makeInput([
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'remove', value: 'A' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'add', value: 'B' },
    ]));
    assert.equal(addOnly.decision.kind, 'chooseNStep');
    assert.equal(addOnly.decision.command, 'add');

    const removeOnly = chooseNProgressAgent.chooseDecision(makeInput([
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'remove', value: 'A' },
    ]));
    assert.equal(removeOnly.decision.kind, 'chooseNStep');
    assert.equal(removeOnly.decision.command, 'remove');
  });

  it('seeded-choice helper stays deterministic for the same rng seed and only returns published actions', () => {
    const agent = createSeededChoiceAgent();
    const legalActions = [
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'add', value: 'A' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'add', value: 'B' },
      { kind: 'chooseNStep', decisionKey: DECISION_KEY, command: 'add', value: 'C' },
    ] as const;

    const left = agent.chooseDecision(makeInput(legalActions, 123n));
    const right = agent.chooseDecision(makeInput(legalActions, 123n));

    assert.deepEqual(left.decision, right.decision);
    assert.equal(legalActions.some((candidate) => candidate === left.decision), true);
  });
});
