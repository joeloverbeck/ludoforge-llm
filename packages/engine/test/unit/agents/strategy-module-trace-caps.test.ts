// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createTraceStrategyModuleDef,
  createStrategyModuleTraceContext,
} from './strategy-module-test-fixtures.js';

const activeModules = () => [
  createTraceStrategyModuleDef('active6', 60, true, 6),
  createTraceStrategyModuleDef('active5', 50, true, 5),
  createTraceStrategyModuleDef('active4', 40, true, 4),
  createTraceStrategyModuleDef('active3', 30, true, 3),
  createTraceStrategyModuleDef('active2', 20, true, 2),
  createTraceStrategyModuleDef('active1', 10, true, 1),
];

const inactiveModules = () => [
  createTraceStrategyModuleDef('inactive6', 60, false, 0),
  createTraceStrategyModuleDef('inactive5', 50, false, 0),
  createTraceStrategyModuleDef('inactive4', 40, false, 0),
  createTraceStrategyModuleDef('inactive3', 30, false, 0),
  createTraceStrategyModuleDef('inactive2', 20, false, 0),
  createTraceStrategyModuleDef('inactive1', 10, false, 0),
];

function evaluatedTrace(traceLevel: 'summary' | 'verbose' | 'debug') {
  const modules = [...activeModules(), ...inactiveModules()];
  const context = createStrategyModuleTraceContext(modules);
  try {
    for (const module of modules) {
      context.evaluatePlannedStrategyModule(String(module.id));
    }
    return context.getEvaluatedStrategyModuleTrace(traceLevel);
  } finally {
    context.dispose();
  }
}

describe('strategy module trace caps', () => {
  it('caps summary mode at three active and three inactive module entries', () => {
    const trace = evaluatedTrace('summary');
    assert.deepEqual(trace?.active.map((entry) => entry.id), ['active6', 'active5', 'active4']);
    assert.deepEqual(trace?.inactiveTopReasons.map((entry) => entry.id), ['inactive6', 'inactive5', 'inactive4']);
  });

  it('lifts verbose mode to the established top-K budget and emits full debug trace', () => {
    const verbose = evaluatedTrace('verbose');
    const debug = evaluatedTrace('debug');

    assert.equal(verbose?.active.length, 5);
    assert.equal(verbose?.inactiveTopReasons.length, 5);
    assert.equal(debug?.active.length, 6);
    assert.equal(debug?.inactiveTopReasons.length, 6);
  });

  it('produces byte-identical module traces across runs', () => {
    const first = JSON.stringify(evaluatedTrace('debug'));
    const second = JSON.stringify(evaluatedTrace('debug'));

    assert.equal(first, second);
  });
});
