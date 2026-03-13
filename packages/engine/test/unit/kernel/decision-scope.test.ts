import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceScope,
  emptyScope,
  formatDecisionKey,
  parseDecisionKey,
  rebaseIterationPath,
  withIterationSegment,
  type DecisionKey,
} from '../../../src/kernel/index.js';

const asDecisionKey = (value: string): DecisionKey => value as DecisionKey;

describe('decision-scope codec', () => {
  it('formats the canonical decision-key scenarios from Spec 60', () => {
    assert.equal(formatDecisionKey('$target', '$target', '', 1), '$target');
    assert.equal(formatDecisionKey('$target', '$target', '', 2), '$target#2');
    assert.equal(formatDecisionKey('decision:attack', 'Quang_Tri', '', 1), 'decision:attack::Quang_Tri');
    assert.equal(formatDecisionKey('decision:attack', 'Quang_Tri', '', 2), 'decision:attack::Quang_Tri#2');
    assert.equal(formatDecisionKey('decision:train', 'Saigon', '[0]', 1), 'decision:train::Saigon[0]');
    assert.equal(formatDecisionKey('decision:train', 'Saigon', '[0]', 2), 'decision:train::Saigon[0]#2');
    assert.equal(formatDecisionKey('decision:op', 'Saigon', '[0][1]', 1), 'decision:op::Saigon[0][1]');
    assert.equal(
      formatDecisionKey(
        'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
        'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
        '',
        1,
      ),
      'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
    );
  });

  it('round-trips canonical keys through parseDecisionKey', () => {
    const canonicalKeys = [
      '$target',
      '$target#2',
      'decision:attack::Quang_Tri',
      'decision:attack::Quang_Tri#2',
      'decision:train::Saigon[0]',
      'decision:train::Saigon[0]#2',
      'decision:op::Saigon[0][1]',
      'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
    ] as const;

    for (const key of canonicalKeys) {
      const parsed = parseDecisionKey(asDecisionKey(key));
      assert.notEqual(parsed, null, `${key} should parse`);
      if (parsed === null) {
        continue;
      }
      assert.equal(
        formatDecisionKey(parsed.baseId, parsed.resolvedBind, parsed.iterationPath, parsed.occurrence),
        key,
      );
    }
  });

  it('returns null for invalid keys that have no base segment', () => {
    assert.equal(parseDecisionKey(asDecisionKey('')), null);
    assert.equal(parseDecisionKey(asDecisionKey('[0]')), null);
    assert.equal(parseDecisionKey(asDecisionKey('#2')), null);
    assert.equal(parseDecisionKey(asDecisionKey('::resolved')), null);
    assert.equal(parseDecisionKey(asDecisionKey('base::')), null);
  });

  it('returns an empty immutable-ready scope', () => {
    assert.deepEqual(emptyScope(), {
      iterationPath: '',
      counters: {},
    });
  });

  it('appends iteration segments without mutating the prior scope', () => {
    const original = emptyScope();
    const advanced = withIterationSegment(original, 0);
    const nested = withIterationSegment(advanced, 1);

    assert.equal(original.iterationPath, '');
    assert.equal(advanced.iterationPath, '[0]');
    assert.equal(nested.iterationPath, '[0][1]');
    assert.equal(advanced.counters, original.counters);
    assert.equal(nested.counters, advanced.counters);
  });

  it('rebases iteration path without dropping accumulated counters', () => {
    const inLoop = withIterationSegment(emptyScope(), 0);
    const advanced = advanceScope(inLoop, 'decision:train', 'Saigon');
    const rebound = rebaseIterationPath(advanced.scope, '');

    assert.equal(rebound.iterationPath, '');
    assert.deepEqual(rebound.counters, {
      'decision:train::Saigon[0]': 1,
    });
    assert.notEqual(rebound, advanced.scope);
  });

  it('advances occurrence counters immutably for repeated calls with the same base key', () => {
    const scope0 = emptyScope();
    const first = advanceScope(scope0, '$target', '$target');
    const second = advanceScope(first.scope, '$target', '$target');

    assert.equal(first.occurrence, 1);
    assert.equal(first.key, '$target');
    assert.deepEqual(scope0, { iterationPath: '', counters: {} });

    assert.equal(second.occurrence, 2);
    assert.equal(second.key, '$target#2');
    assert.deepEqual(first.scope.counters, { '$target': 1 });
    assert.deepEqual(second.scope.counters, { '$target': 2 });
  });

  it('tracks counters per iteration path and per distinct decision base', () => {
    const root = emptyScope();
    const inLoop = withIterationSegment(root, 0);

    const firstLoopChoice = advanceScope(inLoop, 'decision:train', 'Saigon');
    const secondLoopChoice = advanceScope(firstLoopChoice.scope, 'decision:train', 'Saigon');
    const siblingChoice = advanceScope(secondLoopChoice.scope, 'decision:attack', 'Hue');

    assert.equal(firstLoopChoice.key, 'decision:train::Saigon[0]');
    assert.equal(secondLoopChoice.key, 'decision:train::Saigon[0]#2');
    assert.equal(siblingChoice.key, 'decision:attack::Hue[0]');
    assert.deepEqual(siblingChoice.scope.counters, {
      'decision:train::Saigon[0]': 2,
      'decision:attack::Hue[0]': 1,
    });
  });
});
