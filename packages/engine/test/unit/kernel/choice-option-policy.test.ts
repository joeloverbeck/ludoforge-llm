import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  pickDeterministicChoiceValue,
  selectChoiceOptionValuesByLegalityPrecedence,
  selectUniqueChoiceOptionValuesByLegalityPrecedence,
  type ChoicePendingRequest,
} from '../../../src/kernel/index.js';

const makeChooseOneRequest = (options: ChoicePendingRequest['options']): ChoicePendingRequest => ({
  kind: 'pending',
  complete: false,
  decisionId: 'decision:$pick',
  name: '$pick',
  type: 'chooseOne',
  options,
  targetKinds: [],
});

const makeChooseNRequest = (
  options: ChoicePendingRequest['options'],
  min?: number,
  max?: number,
): ChoicePendingRequest => {
  const base: ChoicePendingRequest = {
    kind: 'pending',
    complete: false,
    decisionId: 'decision:$pickMany',
    name: '$pickMany',
    type: 'chooseN',
    options,
    targetKinds: [],
  };
  return {
    ...base,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
  };
};

describe('choice option policy', () => {
  it('prioritizes legal options before unknown and illegal options', () => {
    const request = makeChooseOneRequest([
      { value: 'unknown-a', legality: 'unknown', illegalReason: null },
      { value: 'legal-a', legality: 'legal', illegalReason: null },
      { value: 'illegal-a', legality: 'illegal', illegalReason: null },
      { value: 'legal-b', legality: 'legal', illegalReason: null },
    ]);

    assert.deepEqual(selectChoiceOptionValuesByLegalityPrecedence(request), ['legal-a', 'legal-b']);
    assert.equal(pickDeterministicChoiceValue(request), 'legal-a');
  });

  it('falls back to unknown options when no legal options exist', () => {
    const request = makeChooseOneRequest([
      { value: 'unknown-a', legality: 'unknown', illegalReason: null },
      { value: 'unknown-b', legality: 'unknown', illegalReason: null },
      { value: 'illegal-a', legality: 'illegal', illegalReason: null },
    ]);

    assert.deepEqual(selectChoiceOptionValuesByLegalityPrecedence(request), ['unknown-a', 'unknown-b']);
    assert.equal(pickDeterministicChoiceValue(request), 'unknown-a');
  });

  it('does not select illegal options by default', () => {
    const request = makeChooseOneRequest([
      { value: 'illegal-a', legality: 'illegal', illegalReason: null },
      { value: 'illegal-b', legality: 'illegal', illegalReason: null },
    ]);

    assert.deepEqual(selectChoiceOptionValuesByLegalityPrecedence(request), []);
    assert.equal(pickDeterministicChoiceValue(request), undefined);
  });

  it('supports explicit illegal fallback when requested', () => {
    const request = makeChooseOneRequest([
      { value: 'illegal-a', legality: 'illegal', illegalReason: null },
      { value: 'illegal-b', legality: 'illegal', illegalReason: null },
    ]);

    assert.deepEqual(
      selectChoiceOptionValuesByLegalityPrecedence(request, { allowIllegalFallback: true }),
      ['illegal-a', 'illegal-b'],
    );
    assert.equal(pickDeterministicChoiceValue(request, { allowIllegalFallback: true }), 'illegal-a');
  });

  it('deduplicates chooseN selections and enforces min cardinality', () => {
    const request = makeChooseNRequest([
      { value: 'x', legality: 'unknown', illegalReason: null },
      { value: 'x', legality: 'unknown', illegalReason: null },
      { value: 'y', legality: 'unknown', illegalReason: null },
      { value: 'z', legality: 'illegal', illegalReason: null },
    ], 2, 3);

    assert.deepEqual(selectUniqueChoiceOptionValuesByLegalityPrecedence(request), ['x', 'y']);
    assert.deepEqual(pickDeterministicChoiceValue(request), ['x', 'y']);

    const unmetMin = makeChooseNRequest(
      [{ value: 'only-illegal', legality: 'illegal', illegalReason: null }],
      1,
      1,
    );
    assert.equal(pickDeterministicChoiceValue(unmetMin), undefined);
  });
});
