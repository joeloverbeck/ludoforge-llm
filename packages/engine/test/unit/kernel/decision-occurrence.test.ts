import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  consumeDecisionOccurrence,
  createDecisionOccurrenceContext,
  resolveMoveParamForDecisionOccurrence,
  writeMoveParamForDecisionOccurrence,
} from '../../../src/kernel/decision-occurrence.js';

describe('decision occurrence helpers', () => {
  it('write and resolve per-occurrence choice params without collapsing repeated decision ids', () => {
    const context = createDecisionOccurrenceContext();
    const firstOccurrence = consumeDecisionOccurrence(context, 'decision:$target', '$target');
    const secondOccurrence = consumeDecisionOccurrence(context, 'decision:$target', '$target');

    const moveParams = writeMoveParamForDecisionOccurrence(
      writeMoveParamForDecisionOccurrence({}, firstOccurrence, 'alpha'),
      secondOccurrence,
      'beta',
    );

    const readContext = createDecisionOccurrenceContext();
    const firstRead = consumeDecisionOccurrence(readContext, 'decision:$target', '$target');
    const secondRead = consumeDecisionOccurrence(readContext, 'decision:$target', '$target');

    assert.equal(resolveMoveParamForDecisionOccurrence(moveParams, firstRead), 'alpha');
    assert.equal(resolveMoveParamForDecisionOccurrence(moveParams, secondRead), 'beta');
    assert.equal(moveParams['decision:$target'], 'alpha', 'First occurrence should retain the legacy unindexed key');
    assert.equal(moveParams['decision:$target#2'], 'beta');
  });

  it('only falls back to unindexed keys for the first occurrence', () => {
    const moveParams = {
      'decision:$target': 'alpha',
      '$target': 'alpha',
    };

    const context = createDecisionOccurrenceContext();
    const firstOccurrence = consumeDecisionOccurrence(context, 'decision:$target', '$target');
    const secondOccurrence = consumeDecisionOccurrence(context, 'decision:$target', '$target');

    assert.equal(resolveMoveParamForDecisionOccurrence(moveParams, firstOccurrence), 'alpha');
    assert.equal(resolveMoveParamForDecisionOccurrence(moveParams, secondOccurrence), undefined);
  });
});
