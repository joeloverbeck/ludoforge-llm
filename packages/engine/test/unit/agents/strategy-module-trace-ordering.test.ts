// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createTraceStrategyModuleDef,
  createStrategyModuleTraceContext,
} from './strategy-module-test-fixtures.js';

describe('strategy module trace ordering', () => {
  it('orders active and inactive module trace entries by priority tier then id', () => {
    const modules = [
      createTraceStrategyModuleDef('zActive', 20, true, 4),
      createTraceStrategyModuleDef('aActive', 20, true, 3),
      createTraceStrategyModuleDef('mActive', 5, true, 2),
      createTraceStrategyModuleDef('zInactive', 30, false, 0),
      createTraceStrategyModuleDef('aInactive', 30, false, 0),
      createTraceStrategyModuleDef('mInactive', 1, false, 0),
    ];
    const context = createStrategyModuleTraceContext(modules);
    try {
      for (const module of modules) {
        context.evaluatePlannedStrategyModule(String(module.id));
      }

      const trace = context.getEvaluatedStrategyModuleTrace('debug');
      assert.deepEqual(trace?.active.map((entry) => entry.id), ['aActive', 'zActive', 'mActive']);
      assert.deepEqual(trace?.active.map((entry) => entry.contribution), [3, 4, 2]);
      assert.deepEqual(trace?.active[0]?.scoreGroups, { standing: 3 });
      assert.deepEqual(trace?.inactiveTopReasons.map((entry) => entry.id), ['aInactive', 'zInactive', 'mInactive']);
      assert.deepEqual(trace?.inactiveTopReasons.map((entry) => entry.reason), [
        'conditionFalse',
        'conditionFalse',
        'conditionFalse',
      ]);
    } finally {
      context.dispose();
    }
  });
});
