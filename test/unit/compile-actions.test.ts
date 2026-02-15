import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compileGameSpecToGameDef, createEmptyGameSpecDoc } from '../../src/cnl/index.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

describe('compile actions', () => {
  it('lowers action actor/params/pre/cost/effects/limits into GameDef', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-compile', players: { min: 2, max: 2 } },
      globalVars: [{ name: 'energy', type: 'int', init: 2, min: -10, max: 10 }],
      zones: [
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
        { id: 'hand', owner: 'player', visibility: 'hidden', ordering: 'stack' },
      ],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'play',
actor: 'activePlayer',
executor: 'actor',
phase: 'main',
          params: [{ name: 'count', domain: { query: 'intsInRange', min: 1, max: 2 } }],
          pre: {
            op: '>=',
            left: { ref: 'zoneCount', zone: 'hand:0' },
            right: 1,
          },
          cost: [{ addVar: { scope: 'global', var: 'energy', delta: -1 } }],
          effects: [{ draw: { from: 'deck', to: 'hand:0', count: 1 } }],
          limits: [{ scope: 'turn', max: 1 }],
        },
      ],
      triggers: [],
      terminal: { conditions: [{ when: { op: '>=', left: 1, right: 999 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);

    assert.equal(result.gameDef !== null, true);
    assertNoDiagnostics(result);

    const action = result.gameDef?.actions[0];
    assert.equal(action?.id, 'play');
    assert.equal(action?.actor, 'active');
    assert.equal(action?.phase, 'main');
    assert.equal(action?.params[0]?.name, 'count');
    assert.deepEqual(action?.params[0]?.domain, { query: 'intsInRange', min: 1, max: 2 });
    assert.deepEqual(action?.limits, [{ scope: 'turn', max: 1 }]);
    assert.deepEqual(action?.effects, [{ draw: { from: 'deck:none', to: 'hand:0', count: 1 } }]);
  });

  it('accepts binding-derived executor when binding is declared action param', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-executor-binding-compile', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'assign',
          actor: 'active',
          executor: '$owner',
          phase: 'main',
          params: [{ name: '$owner', domain: { query: 'players' } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoDiagnostics(result);
    assert.deepEqual(result.gameDef?.actions[0]?.executor, { chosen: '$owner' });
  });

  it('rejects binding-derived executor when binding is not declared in action params', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-executor-binding-missing', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'assign',
          actor: 'active',
          executor: '$owner',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((d) => d.code === 'CNL_COMPILER_ACTION_EXECUTOR_BINDING_MISSING'), true);
  });

  it('rejects binding-derived executor for pipelined actions', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-executor-binding-pipeline', players: { min: 2, max: 2 } },
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actionPipelines: [
        {
          id: 'p',
          actionId: 'assign',
          legality: null,
          costValidation: null,
          costEffects: [],
          targeting: {},
          stages: [{ effects: [] }],
          atomicity: 'atomic' as const,
        },
      ],
      actions: [
        {
          id: 'assign',
          actor: 'active',
          executor: '$owner',
          phase: 'main',
          params: [{ name: '$owner', domain: { query: 'players' } }],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assert.equal(result.gameDef, null);
    assert.equal(result.diagnostics.some((d) => d.code === 'CNL_XREF_ACTION_EXECUTOR_PIPELINE_UNSUPPORTED'), true);
  });

  it('accepts non-prefixed action param bindings in pre/effects without implicit $ aliasing', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      metadata: { id: 'action-param-binding-non-prefixed', players: { min: 2, max: 2 } },
      globalVars: [
        { name: 'bankA', type: 'int', init: 5, min: 0, max: 75 },
        { name: 'bankB', type: 'int', init: 0, min: 0, max: 75 },
      ],
      zones: [{ id: 'pool', owner: 'none', visibility: 'public', ordering: 'set' }],
      turnStructure: { phases: [{ id: 'main' }] },
      actions: [
        {
          id: 'transfer',
          actor: 'active',
          executor: 'actor',
          phase: 'main',
          params: [{ name: 'amount', domain: { query: 'intsInRange', min: 1, max: 75 } }],
          pre: { op: '>=', left: { ref: 'gvar', var: 'bankA' }, right: { ref: 'binding', name: 'amount' } },
          cost: [],
          effects: [
            {
              addVar: {
                scope: 'global',
                var: 'bankA',
                delta: { op: '*', left: { ref: 'binding', name: 'amount' }, right: -1 },
              },
            },
            { addVar: { scope: 'global', var: 'bankB', delta: { ref: 'binding', name: 'amount' } } },
          ],
          limits: [],
        },
      ],
      terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
    };

    const result = compileGameSpecToGameDef(doc);
    assertNoDiagnostics(result);
    assert.notEqual(result.gameDef, null);
    const action = result.gameDef!.actions[0];
    assert.equal(action?.id, 'transfer');
    assert.equal(action?.params[0]?.name, 'amount');
  });
});
