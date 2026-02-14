import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  compileGameSpecToGameDef,
  createEmptyGameSpecDoc,
  type EffectMacroDef,
} from '../../src/cnl/index.js';

function makeMinimalDoc() {
  return {
    ...createEmptyGameSpecDoc(),
    metadata: { id: 'macro-integration-test', players: { min: 2, max: 2 } },
    globalVars: [
      { name: 'score', type: 'int', init: 0, min: 0, max: 100 },
      { name: 'count', type: 'int', init: 0, min: 0, max: 100 },
    ],
    zones: [
      { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      { id: 'hand', owner: 'player', visibility: 'owner', ordering: 'set' },
    ],
    turnStructure: { phases: [{ id: 'main' }] },
    terminal: { conditions: [{ when: { op: '==', left: 1, right: 1 }, result: { type: 'draw' } }] },
  };
}

describe('effect macro → compile pipeline integration', () => {
  it('macro invocation in setup expands and compiles to valid GameDef', () => {
    const macroDef: EffectMacroDef = {
      id: 'set-score',
      params: [{ name: 'value', type: 'number' }],
      effects: [{ setVar: { scope: 'global', var: 'score', value: { param: 'value' } } }],
    };

    const doc = {
      ...makeMinimalDoc(),
      effectMacros: [macroDef],
      setup: [{ macro: 'set-score', args: { value: 10 } }],
      actions: [
        {
          id: 'pass',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors, null, 2)}`);
    assert.ok(result.gameDef !== null, 'Expected valid GameDef');

    assert.deepEqual(result.gameDef.setup, [
      { setVar: { scope: 'global', var: 'score', value: 10 } },
    ]);
  });

  it('macro in action effects expands and compiles', () => {
    const macroDef: EffectMacroDef = {
      id: 'add-score',
      params: [{ name: 'delta', type: 'number' }],
      effects: [{ addVar: { scope: 'global', var: 'score', delta: { param: 'delta' } } }],
    };

    const doc = {
      ...makeMinimalDoc(),
      effectMacros: [macroDef],
      actions: [
        {
          id: 'score-action',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [{ macro: 'add-score', args: { delta: 5 } }],
          limits: [],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors, null, 2)}`);
    assert.ok(result.gameDef !== null, 'Expected valid GameDef');

    const actionEffects = result.gameDef.actions[0]?.effects;
    assert.ok(actionEffects !== undefined);
    assert.deepEqual(actionEffects, [
      { addVar: { scope: 'global', var: 'score', delta: 5 } },
    ]);
  });

  it('nested macro expansion compiles correctly', () => {
    const innerMacro: EffectMacroDef = {
      id: 'set-var',
      params: [
        { name: 'varName', type: 'string' },
        { name: 'val', type: 'number' },
      ],
      effects: [{ setVar: { scope: 'global', var: { param: 'varName' }, value: { param: 'val' } } }],
    };
    const outerMacro: EffectMacroDef = {
      id: 'init-scores',
      params: [],
      effects: [
        { macro: 'set-var', args: { varName: 'score', val: 0 } },
        { macro: 'set-var', args: { varName: 'count', val: 0 } },
      ],
    };

    const doc = {
      ...makeMinimalDoc(),
      effectMacros: [innerMacro, outerMacro],
      setup: [{ macro: 'init-scores', args: {} }],
      actions: [
        {
          id: 'pass',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors, null, 2)}`);
    assert.ok(result.gameDef !== null, 'Expected valid GameDef');

    assert.deepEqual(result.gameDef.setup, [
      { setVar: { scope: 'global', var: 'score', value: 0 } },
      { setVar: { scope: 'global', var: 'count', value: 0 } },
    ]);
  });

  it('concat ValueExpr compiles through the full pipeline', () => {
    const doc = {
      ...makeMinimalDoc(),
      setup: [
        {
          setVar: {
            scope: 'global',
            var: 'score',
            value: { concat: ['prefix:', 42] },
          },
        },
      ],
      actions: [
        {
          id: 'pass',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [],
          limits: [],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors, null, 2)}`);
    assert.ok(result.gameDef !== null, 'Expected valid GameDef');
  });

  it('forEach with countBind/in compiles through full pipeline', () => {
    const doc = {
      ...makeMinimalDoc(),
      actions: [
        {
          id: 'count-action',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [
            {
              forEach: {
                bind: '$n',
                over: { query: 'intsInRange', min: 1, max: 3 },
                effects: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$n' } } }],
                countBind: '$total',
                in: [{ setVar: { scope: 'global', var: 'count', value: { ref: 'binding', name: '$total' } } }],
              },
            },
          ],
          limits: [],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors, null, 2)}`);
    assert.ok(result.gameDef !== null, 'Expected valid GameDef');

    const effects = result.gameDef.actions[0]?.effects;
    assert.ok(effects !== undefined && effects.length === 1);
    const forEachEffect = effects[0] as { forEach: Record<string, unknown> };
    assert.equal(forEachEffect.forEach.countBind, '$total');
    assert.ok(Array.isArray(forEachEffect.forEach.in));
  });

  it('forEach with dynamic limit (ValueExpr) compiles through full pipeline', () => {
    const doc = {
      ...makeMinimalDoc(),
      actions: [
        {
          id: 'limited-action',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [
            {
              forEach: {
                bind: '$n',
                over: { query: 'intsInRange', min: 1, max: 10 },
                effects: [{ addVar: { scope: 'global', var: 'score', delta: 1 } }],
                limit: { ref: 'gvar', var: 'count' },
              },
            },
          ],
          limits: [],
        },
      ],
    };

    const result = compileGameSpecToGameDef(doc);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(errors, [], `Unexpected errors: ${JSON.stringify(errors, null, 2)}`);
    assert.ok(result.gameDef !== null, 'Expected valid GameDef');
  });

  it('multiple macro invocations produce deterministic non-colliding decision binds', () => {
    const macroDef: EffectMacroDef = {
      id: 'choose-mode',
      params: [],
      exports: [],
      effects: [{ chooseOne: { bind: '$mode', options: { query: 'enums', values: ['a', 'b'] } } }],
    };

    const makeDoc = () => ({
      ...makeMinimalDoc(),
      effectMacros: [macroDef],
      actions: [
        {
          id: 'mode-action',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [
            { macro: 'choose-mode', args: {} },
            { macro: 'choose-mode', args: {} },
          ],
          limits: [],
        },
      ],
    });

    const first = compileGameSpecToGameDef(makeDoc());
    const second = compileGameSpecToGameDef(makeDoc());
    const firstErrors = first.diagnostics.filter((d) => d.severity === 'error');
    const secondErrors = second.diagnostics.filter((d) => d.severity === 'error');
    assert.deepEqual(firstErrors, [], `Unexpected errors: ${JSON.stringify(firstErrors, null, 2)}`);
    assert.deepEqual(secondErrors, [], `Unexpected errors: ${JSON.stringify(secondErrors, null, 2)}`);
    assert.ok(first.gameDef !== null);
    assert.ok(second.gameDef !== null);

    const firstEffects = first.gameDef.actions[0]?.effects ?? [];
    const secondEffects = second.gameDef.actions[0]?.effects ?? [];
    const firstBinds = firstEffects.flatMap((effect) => ('chooseOne' in effect ? [effect.chooseOne.bind] : []));
    const secondBinds = secondEffects.flatMap((effect) => ('chooseOne' in effect ? [effect.chooseOne.bind] : []));

    assert.deepEqual(firstBinds, secondBinds, 'bind naming should be deterministic across compiles');
    assert.equal(firstBinds.length, 2);
    assert.notEqual(firstBinds[0], firstBinds[1], 'each invocation should have an isolated bind');
  });
});
