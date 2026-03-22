import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pickRandom, selectStochasticFallback } from '../../../src/agents/agent-move-selection.js';
import { asActionId, createRng, type Move } from '../../../src/kernel/index.js';
import { trustedMove } from '../../helpers/classified-move-fixtures.js';

const createMoves = (count: number): readonly Move[] =>
  Array.from({ length: count }, (_unused, index) => ({
    actionId: asActionId(`m${index}`),
    params: {},
  }));

describe('agent-move-selection helpers', () => {
  it('pickRandom returns single item and leaves rng unchanged', () => {
    const moves = createMoves(1);
    const rng = createRng(11n);

    const result = pickRandom(moves, rng);

    assert.equal(result.item, moves[0]);
    assert.equal(result.rng, rng);
  });

  it('pickRandom is deterministic for identical seed and candidates', () => {
    const moves = createMoves(5);
    const first = pickRandom(moves, createRng(77n));
    const second = pickRandom(moves, createRng(77n));

    assert.deepEqual(first, second);
  });

  it('pickRandom always returns an in-bounds item', () => {
    const moves = createMoves(4);
    const actionIds = new Set(moves.map((move) => move.actionId));
    let rng = createRng(19n);

    for (let i = 0; i < 100; i += 1) {
      const { item, rng: nextRng } = pickRandom(moves, rng);
      assert.equal(actionIds.has(item.actionId), true);
      rng = nextRng;
    }
  });

  it('pickRandom throws for empty candidates with stable message', () => {
    const rng = createRng(17n);

    assert.throws(
      () => pickRandom([], rng),
      /pickRandom requires at least one item/,
    );
  });

  it('selectStochasticFallback returns deterministic move + rng for identical seed', () => {
    const stochasticMoves = createMoves(3).map((move) => trustedMove(move));
    const first = selectStochasticFallback(stochasticMoves, createRng(222n));
    const second = selectStochasticFallback(stochasticMoves, createRng(222n));

    assert.deepEqual(first, second);
  });

  it('selectStochasticFallback preserves rng when exactly one move exists', () => {
    const stochasticMoves = createMoves(1).map((move) => trustedMove(move));
    const rng = createRng(500n);

    const result = selectStochasticFallback(stochasticMoves, rng);

    assert.equal(result.move, stochasticMoves[0]);
    assert.equal(result.rng, rng);
  });

  it('selectStochasticFallback rejects empty stochastic move sets', () => {
    const rng = createRng(29n);

    assert.throws(
      () => selectStochasticFallback([], rng),
      /pickRandom requires at least one item/,
    );
  });
});
