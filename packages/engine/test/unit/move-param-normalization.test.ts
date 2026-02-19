import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isMoveParamScalar,
  moveParamValuesEqual,
  normalizeMoveParamValue,
  toMoveParamComparableScalar,
} from '../../src/kernel/move-param-normalization.js';

describe('move-param-normalization', () => {
  it('recognizes canonical scalar move-param values', () => {
    assert.equal(isMoveParamScalar('zone:1'), true);
    assert.equal(isMoveParamScalar(3), true);
    assert.equal(isMoveParamScalar(false), true);
    assert.equal(isMoveParamScalar({ id: 'x' }), false);
  });

  it('projects comparable scalars from direct and id-bearing values', () => {
    assert.equal(toMoveParamComparableScalar('tok-1'), 'tok-1');
    assert.equal(toMoveParamComparableScalar(9), 9);
    assert.equal(toMoveParamComparableScalar(true), true);
    assert.equal(toMoveParamComparableScalar({ id: 'tok-2' }), 'tok-2');
    assert.equal(toMoveParamComparableScalar({ id: 5 }), 5);
    assert.equal(toMoveParamComparableScalar({ id: false }), false);
    assert.equal(toMoveParamComparableScalar({ code: 'tok-3' }), null);
    assert.equal(toMoveParamComparableScalar(['tok-4']), null);
  });

  it('normalizes move-param values for scalar and array forms', () => {
    assert.equal(normalizeMoveParamValue('zone:a'), 'zone:a');
    assert.equal(normalizeMoveParamValue(1), 1);
    assert.equal(normalizeMoveParamValue(true), true);
    assert.deepEqual(normalizeMoveParamValue([{ id: 'tok-1' }, { id: 2 }, false]), ['tok-1', 2, false]);
    assert.equal(normalizeMoveParamValue([{ code: 'tok-2' }]), null);
    assert.equal(normalizeMoveParamValue({ code: 'tok-3' }), null);
  });

  it('compares normalized move-param values deterministically', () => {
    assert.equal(moveParamValuesEqual('a', 'a'), true);
    assert.equal(moveParamValuesEqual('a', 'b'), false);
    assert.equal(moveParamValuesEqual(['a', 2, true], ['a', 2, true]), true);
    assert.equal(moveParamValuesEqual(['a', 2], ['a', 3]), false);
    assert.equal(moveParamValuesEqual(['a'], 'a'), false);
  });
});
