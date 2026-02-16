import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { areMoveParamsEquivalent, areMovesEquivalent, asActionId, type Move } from '../../src/kernel/index.js';

describe('move equivalence', () => {
  it('treats object params with different key insertion order as equivalent', () => {
    assert.equal(
      areMoveParamsEquivalent(
        { alpha: 1, beta: 2, gamma: 'x' },
        { gamma: 'x', beta: 2, alpha: 1 },
      ),
      true,
    );
  });

  it('keeps array order as a strict part of equality', () => {
    assert.equal(
      areMoveParamsEquivalent(
        { picks: [1, 2], tags: ['a', 'b'] },
        { picks: [2, 1], tags: ['a', 'b'] },
      ),
      false,
    );
  });

  it('requires actionId equality for move equivalence', () => {
    const left: Move = { actionId: asActionId('event'), params: { side: 'unshaded', amount: 1 } };
    const right: Move = { actionId: asActionId('operate'), params: { amount: 1, side: 'unshaded' } };
    assert.equal(areMovesEquivalent(left, right), false);
  });
});
