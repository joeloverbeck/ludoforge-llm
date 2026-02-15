import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandConditionMacros } from '../../src/cnl/expand-condition-macros.js';
import { createEmptyGameSpecDoc, type GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

const baseDoc = (): GameSpecDoc => ({
  ...createEmptyGameSpecDoc(),
  metadata: { id: 'condition-macro-test', players: { min: 2, max: 2 } },
  constants: {},
  globalVars: [
    { name: 'arvnResources', type: 'int', init: 30, min: 0, max: 75 },
    { name: 'totalEcon', type: 'int', init: 10, min: 0, max: 15 },
  ],
  perPlayerVars: [],
  zones: [],
  tokenTypes: [],
  setup: [],
  turnStructure: { phases: [] },
  turnOrder: { type: 'roundRobin' },
  actions: [],
  triggers: [],
  terminal: { conditions: [] },
});

describe('expandConditionMacros', () => {
  it('returns input unchanged when no conditionMacros are defined', () => {
    const doc = baseDoc();
    const result = expandConditionMacros(doc);

    assert.deepEqual(result.doc, doc);
    assert.deepEqual(result.diagnostics, []);
  });

  it('expands a condition macro invocation inside action pipeline costValidation', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      conditionMacros: [
        {
          id: 'gt-econ-plus-cost',
          params: [
            { name: 'resourceExpr', type: 'value' },
            { name: 'costExpr', type: 'value' },
          ],
          condition: {
            op: '>',
            left: { param: 'resourceExpr' },
            right: { op: '+', left: { ref: 'gvar', var: 'totalEcon' }, right: { param: 'costExpr' } },
          },
        },
      ],
      actionPipelines: [
        {
          id: 'test-profile',
          actionId: 'test',
          legality: true,
          costValidation: {
            conditionMacro: 'gt-econ-plus-cost',
            args: {
              resourceExpr: { ref: 'gvar', var: 'arvnResources' },
              costExpr: 3,
            },
          },
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    };

    const result = expandConditionMacros(doc);
    const pipeline = result.doc.actionPipelines?.[0] as { costValidation?: unknown } | undefined;

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(pipeline?.costValidation, {
      op: '>',
      left: { ref: 'gvar', var: 'arvnResources' },
      right: { op: '+', left: { ref: 'gvar', var: 'totalEcon' }, right: 3 },
    });
  });

  it('reports missing args for condition macro invocations', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      conditionMacros: [
        {
          id: 'needs-cost',
          params: [{ name: 'costExpr', type: 'value' }],
          condition: { op: '>', left: 1, right: { param: 'costExpr' } },
        },
      ],
      actionPipelines: [
        {
          id: 'test-profile',
          actionId: 'test',
          legality: true,
          costValidation: {
            conditionMacro: 'needs-cost',
            args: {},
          },
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    };

    const result = expandConditionMacros(doc);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CONDITION_MACRO_MISSING_ARGS'));
  });

  it('reports circular condition macro expansion', () => {
    const doc: GameSpecDoc = {
      ...baseDoc(),
      conditionMacros: [
        {
          id: 'a',
          params: [],
          condition: { conditionMacro: 'b', args: {} },
        },
        {
          id: 'b',
          params: [],
          condition: { conditionMacro: 'a', args: {} },
        },
      ],
      actionPipelines: [
        {
          id: 'test-profile',
          actionId: 'test',
          legality: true,
          costValidation: {
            conditionMacro: 'a',
            args: {},
          },
          costEffects: [],
          targeting: {},
          stages: [],
          atomicity: 'atomic',
        },
      ],
    };

    const result = expandConditionMacros(doc);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === 'CONDITION_MACRO_CYCLE'));
  });
});
