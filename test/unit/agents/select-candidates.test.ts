import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectCandidatesDeterministically } from '../../../src/agents/select-candidates.js';
import { asActionId, createRng, type Move } from '../../../src/kernel/index.js';

const createMoves = (count: number): readonly Move[] =>
  Array.from({ length: count }, (_, index) => ({
    actionId: asActionId(`m${index}`),
    params: {},
  }));

describe('selectCandidatesDeterministically', () => {
  it('returns all moves and leaves rng unchanged when maxMovesToEvaluate is unset', () => {
    const legalMoves = createMoves(5);
    const rng = createRng(5n);

    const result = selectCandidatesDeterministically(legalMoves, rng, undefined);

    assert.equal(result.moves, legalMoves);
    assert.equal(result.rng, rng);
  });

  it('returns all moves and leaves rng unchanged when maxMovesToEvaluate >= legalMoves.length', () => {
    const legalMoves = createMoves(4);
    const rng = createRng(6n);

    const result = selectCandidatesDeterministically(legalMoves, rng, legalMoves.length);

    assert.equal(result.moves, legalMoves);
    assert.equal(result.rng, rng);
  });

  it('returns bounded deterministic candidates for same input rng', () => {
    const legalMoves = createMoves(8);
    const first = selectCandidatesDeterministically(legalMoves, createRng(99n), 3);
    const second = selectCandidatesDeterministically(legalMoves, createRng(99n), 3);

    assert.equal(first.moves.length, 3);
    assert.deepEqual(first, second);
    assert.notDeepEqual(first.rng, createRng(99n));
  });

  it('bounded selection only returns original legal moves and has no duplicates', () => {
    const legalMoves = createMoves(10);
    const result = selectCandidatesDeterministically(legalMoves, createRng(42n), 5);
    const legalActionIds = new Set(legalMoves.map((move) => move.actionId));
    const selectedActionIds = result.moves.map((move) => move.actionId);

    assert.equal(result.moves.length, 5);
    for (const actionId of selectedActionIds) {
      assert.equal(legalActionIds.has(actionId), true);
    }
    assert.equal(new Set(selectedActionIds).size, selectedActionIds.length);
  });
});
