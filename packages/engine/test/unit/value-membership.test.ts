import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  choiceValuesMatch,
  isEvalErrorCode,
  isInChoiceDomain,
  matchesScalarMembership,
  normalizeChoiceDomain,
  toChoiceComparableValue,
} from '../../src/kernel/index.js';

describe('value-membership', () => {
  it('enforces strict scalar membership set typing', () => {
    assert.equal(matchesScalarMembership('US', ['US', 'ARVN']), true);
    assert.equal(matchesScalarMembership(2, [1, 2, 3]), true);
    assert.equal(matchesScalarMembership(2, [1, 3]), false);

    assert.throws(
      () => matchesScalarMembership('US', 'US'),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
    assert.throws(
      () => matchesScalarMembership('US', ['US', 1]),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
    assert.throws(
      () => matchesScalarMembership('3', [1, 2, 3]),
      (error: unknown) => isEvalErrorCode(error, 'TYPE_MISMATCH'),
    );
  });

  it('projects choice domain entities by id and compares deterministically', () => {
    assert.equal(toChoiceComparableValue('a'), 'a');
    assert.equal(toChoiceComparableValue(1), 1);
    assert.equal(toChoiceComparableValue(true), true);
    assert.equal(toChoiceComparableValue({ id: 'token-1', type: 'piece' }), 'token-1');
    assert.equal(toChoiceComparableValue({ id: 7 }), 7);
    assert.equal(toChoiceComparableValue({ id: false }), false);
    assert.equal(toChoiceComparableValue({ code: 'token-1' }), null);

    assert.equal(choiceValuesMatch('token-1', { id: 'token-1' }), true);
    assert.equal(choiceValuesMatch({ id: 'token-1' }, 'token-1'), true);
    assert.equal(choiceValuesMatch({ id: 'token-1' }, { id: 'token-1' }), true);
    assert.equal(choiceValuesMatch({ id: 'token-1' }, { id: 'token-2' }), false);
  });

  it('checks choice-domain membership through shared projection semantics', () => {
    const domain = [{ id: 'token-a' }, { id: 'token-b' }, 3];
    assert.equal(isInChoiceDomain('token-a', domain), true);
    assert.equal(isInChoiceDomain({ id: 'token-a' }, domain), true);
    assert.equal(isInChoiceDomain(3, domain), true);
    assert.equal(isInChoiceDomain('missing', domain), false);
  });

  it('normalizes choice domains and fails fast for non-encodable values', () => {
    const normalized = normalizeChoiceDomain([{ id: 'token-a' }, 2, 'x'], (issue) => {
      throw new Error(`invalid:${issue.index}`);
    });
    assert.deepEqual(normalized, ['token-a', 2, 'x']);

    assert.throws(
      () =>
        normalizeChoiceDomain([{ code: 'token-a' }], (issue) => {
          throw new Error(`invalid:${issue.index}:${issue.actualType}`);
        }),
      /invalid:0:object/,
    );
  });
});
