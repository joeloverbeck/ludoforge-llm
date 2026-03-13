import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalMoveKey } from '../../../../src/agents/mcts/move-key.js';
import type { Move, CompoundMovePayload } from '../../../../src/kernel/types-core.js';
import { asActionId } from '../../../../src/kernel/branded.js';

const aid = asActionId;

describe('canonicalMoveKey', () => {
  it('produces identical keys for same actionId+params regardless of insertion order', () => {
    const moveA: Move = {
      actionId: aid('attack'),
      params: Object.fromEntries([['target', 'zone1'], ['strength', 3]]),
    };
    const moveB: Move = {
      actionId: aid('attack'),
      params: Object.fromEntries([['strength', 3], ['target', 'zone1']]),
    };
    assert.equal(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });

  it('produces different keys for different actionIds', () => {
    const moveA: Move = { actionId: aid('attack'), params: { target: 'zone1' } };
    const moveB: Move = { actionId: aid('defend'), params: { target: 'zone1' } };
    assert.notEqual(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });

  it('produces different keys for different param values', () => {
    const moveA: Move = { actionId: aid('attack'), params: { target: 'zone1' } };
    const moveB: Move = { actionId: aid('attack'), params: { target: 'zone2' } };
    assert.notEqual(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });

  it('produces different keys for different param keys', () => {
    const moveA: Move = { actionId: aid('attack'), params: { target: 'zone1' } };
    const moveB: Move = { actionId: aid('attack'), params: { source: 'zone1' } };
    assert.notEqual(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });

  it('handles empty params', () => {
    const move: Move = { actionId: aid('pass'), params: {} };
    const key = canonicalMoveKey(move);
    assert.equal(typeof key, 'string');
    assert.ok(key.length > 0);
  });

  it('handles array param values deterministically', () => {
    const move: Move = { actionId: aid('multi'), params: { targets: ['a', 'b', 'c'] } };
    const key1 = canonicalMoveKey(move);
    const key2 = canonicalMoveKey(move);
    assert.equal(key1, key2);
  });

  it('distinguishes array param from scalar param', () => {
    const moveArray: Move = { actionId: aid('x'), params: { val: ['a'] } };
    const moveScalar: Move = { actionId: aid('x'), params: { val: 'a' } };
    assert.notEqual(canonicalMoveKey(moveArray), canonicalMoveKey(moveScalar));
  });

  it('handles compound payloads deterministically', () => {
    const compound: CompoundMovePayload = {
      specialActivity: { actionId: aid('special'), params: { x: 1 } },
      timing: 'before',
    };
    const moveA: Move = { actionId: aid('op'), params: { p: 1 }, compound };
    const moveB: Move = { actionId: aid('op'), params: { p: 1 }, compound };
    assert.equal(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });

  it('produces different keys when compound payloads differ', () => {
    const moveA: Move = {
      actionId: aid('op'),
      params: {},
      compound: {
        specialActivity: { actionId: aid('sa'), params: {} },
        timing: 'before',
      },
    };
    const moveB: Move = {
      actionId: aid('op'),
      params: {},
      compound: {
        specialActivity: { actionId: aid('sa'), params: {} },
        timing: 'after',
      },
    };
    assert.notEqual(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });

  it('includes compound optional fields when present', () => {
    const moveA: Move = {
      actionId: aid('op'),
      params: {},
      compound: {
        specialActivity: { actionId: aid('sa'), params: {} },
        timing: 'during',
        insertAfterStage: 2,
      },
    };
    const moveB: Move = {
      actionId: aid('op'),
      params: {},
      compound: {
        specialActivity: { actionId: aid('sa'), params: {} },
        timing: 'during',
      },
    };
    assert.notEqual(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });

  it('handles boolean param values', () => {
    const moveA: Move = { actionId: aid('x'), params: { flag: true } };
    const moveB: Move = { actionId: aid('x'), params: { flag: false } };
    assert.notEqual(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });

  it('handles numeric param values including zero', () => {
    const moveA: Move = { actionId: aid('x'), params: { n: 0 } };
    const moveB: Move = { actionId: aid('x'), params: { n: 1 } };
    assert.notEqual(canonicalMoveKey(moveA), canonicalMoveKey(moveB));
  });
});
