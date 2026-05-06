// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { asActionId } from '../../../src/kernel/index.js';
import { previewGroupKey } from '../../../src/agents/preview-group-key.js';

describe('previewGroupKey', () => {
  it('is stable for a representative candidate corpus', () => {
    const candidates = Array.from({ length: 20 }, (_, index) => ({
      actionId: String(asActionId(index % 2 === 0 ? 'move' : 'event')),
      move: {
        actionId: asActionId(index % 2 === 0 ? 'move' : 'event'),
        params: {
          amount: index,
          targets: Array.from({ length: (index % 4) + 1 }, (_value, targetIndex) => `z${targetIndex}`),
          ...(index % 5 === 0 ? { side: 'shaded' } : {}),
        },
      },
    }));

    const first = candidates.map(previewGroupKey);
    const second = candidates.map(previewGroupKey);

    assert.deepEqual(second, first);
  });

  it('distinguishes action and parameter-shape groups without using parameter values', () => {
    const base = previewGroupKey({
      actionId: 'move',
      move: { actionId: asActionId('move'), params: { amount: 1, targets: ['a'] } },
    });
    const sameShape = previewGroupKey({
      actionId: 'move',
      move: { actionId: asActionId('move'), params: { amount: 99, targets: ['b'] } },
    });
    const differentAction = previewGroupKey({
      actionId: 'event',
      move: { actionId: asActionId('event'), params: { amount: 1, targets: ['a'] } },
    });
    const differentShape = previewGroupKey({
      actionId: 'move',
      move: { actionId: asActionId('move'), params: { amount: 1, targets: ['a', 'b'] } },
    });

    assert.equal(sameShape, base);
    assert.notEqual(differentAction, base);
    assert.notEqual(differentShape, base);
  });
});
