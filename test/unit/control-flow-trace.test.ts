import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildForEachTraceEntry, buildReduceTraceEntry } from '../../src/kernel/control-flow-trace.js';

describe('control-flow trace builders', () => {
  it('buildForEachTraceEntry omits limit when not explicitly configured', () => {
    const entry = buildForEachTraceEntry({
      bind: '$item',
      matchCount: 3,
      iteratedCount: 3,
      explicitLimit: false,
      resolvedLimit: 100,
    });

    assert.deepEqual(entry, {
      kind: 'forEach',
      bind: '$item',
      matchCount: 3,
      iteratedCount: 3,
    });
  });

  it('buildForEachTraceEntry includes resolved limit when explicitly configured', () => {
    const entry = buildForEachTraceEntry({
      bind: '$item',
      matchCount: 10,
      iteratedCount: 2,
      explicitLimit: true,
      resolvedLimit: 2,
    });

    assert.deepEqual(entry, {
      kind: 'forEach',
      bind: '$item',
      matchCount: 10,
      iteratedCount: 2,
      limit: 2,
    });
  });

  it('buildReduceTraceEntry omits limit when not explicitly configured', () => {
    const entry = buildReduceTraceEntry({
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$sum',
      matchCount: 4,
      iteratedCount: 4,
      explicitLimit: false,
      resolvedLimit: 100,
    });

    assert.deepEqual(entry, {
      kind: 'reduce',
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$sum',
      matchCount: 4,
      iteratedCount: 4,
    });
  });

  it('buildReduceTraceEntry includes resolved limit when explicitly configured', () => {
    const entry = buildReduceTraceEntry({
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$sum',
      matchCount: 7,
      iteratedCount: 3,
      explicitLimit: true,
      resolvedLimit: 3,
    });

    assert.deepEqual(entry, {
      kind: 'reduce',
      itemBind: '$n',
      accBind: '$acc',
      resultBind: '$sum',
      matchCount: 7,
      iteratedCount: 3,
      limit: 3,
    });
  });
});
