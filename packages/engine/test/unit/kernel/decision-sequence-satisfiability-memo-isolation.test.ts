// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId, type ChoiceRequest, type DecisionKey, type Move } from '../../../src/kernel/index.js';
import { classifyDecisionSequenceSatisfiability } from '../../../src/kernel/decision-sequence-satisfiability.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

const makeMove = (): Move => ({
  actionId: asActionId('memo-isolation-op'),
  params: {},
});

describe('decision sequence satisfiability memo isolation', () => {
  it('does not mutate the input move and does not leak memo state across calls', () => {
    const move = makeMove();
    const moveClone = structuredClone(move);

    let calls = 0;
    const discoverer = (candidateMove: Move): ChoiceRequest => {
      calls += 1;
      const pick = candidateMove.params[asDecisionKey('decision:$pick')];
      const confirm = candidateMove.params[asDecisionKey('decision:$confirm')];
      if (pick === undefined) {
        return {
          kind: 'pending',
          complete: false,
          decisionKey: asDecisionKey('decision:$pick'),
          name: '$pick',
          type: 'chooseOne',
          targetKinds: [],
          options: [
            { value: 'alpha', legality: 'legal', illegalReason: null },
            { value: 'beta', legality: 'unknown', illegalReason: null },
          ],
        };
      }
      if (confirm === undefined) {
        return pick === 'alpha'
          ? {
            kind: 'pending',
            complete: false,
            decisionKey: asDecisionKey('decision:$confirm'),
            name: '$confirm',
            type: 'chooseOne',
            targetKinds: [],
            options: [{ value: 'done', legality: 'legal', illegalReason: null }],
          }
          : { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
      }
      return confirm === 'done'
        ? { kind: 'complete', complete: true }
        : { kind: 'illegal', complete: false, reason: 'pipelineLegalityFailed' };
    };

    const first = classifyDecisionSequenceSatisfiability(move, discoverer, {
      emitCompletionCertificate: true,
      certificateFingerprintStateHash: 1n,
    });
    const firstCallCount = calls;

    const second = classifyDecisionSequenceSatisfiability(move, discoverer, {
      emitCompletionCertificate: true,
      certificateFingerprintStateHash: 1n,
    });
    const secondCallCount = calls - firstCallCount;

    assert.deepEqual(move, moveClone);
    assert.equal(first.classification, 'satisfiable');
    assert.equal(second.classification, 'satisfiable');
    assert.deepEqual(second, first);
    assert.equal(firstCallCount > 0, true);
    assert.equal(secondCallCount > 0, true);
  });
});
