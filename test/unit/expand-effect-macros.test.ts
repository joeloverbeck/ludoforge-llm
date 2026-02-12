import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { expandEffectMacros } from '../../src/cnl/expand-effect-macros.js';
import { createEmptyGameSpecDoc, type EffectMacroDef, type GameSpecDoc } from '../../src/cnl/game-spec-doc.js';

function makeDoc(overrides: Partial<GameSpecDoc>): GameSpecDoc {
  return { ...createEmptyGameSpecDoc(), ...overrides };
}

describe('expandEffectMacros', () => {
  it('returns doc unchanged when effectMacros is null', () => {
    const doc = makeDoc({ setup: [{ setVar: { scope: 'global', var: 'x', value: 1 } }] });
    const result = expandEffectMacros(doc);
    assert.deepEqual(result.doc.setup, doc.setup);
    assert.equal(result.diagnostics.length, 0);
  });

  it('returns doc unchanged when effectMacros is empty', () => {
    const doc = makeDoc({ effectMacros: [], setup: [{ setVar: { scope: 'global', var: 'x', value: 1 } }] });
    const result = expandEffectMacros(doc);
    assert.deepEqual(result.doc.setup, doc.setup);
    assert.equal(result.diagnostics.length, 0);
  });

  it('expands a simple macro invocation in setup', () => {
    const macroDef: EffectMacroDef = {
      id: 'add-one',
      params: [{ name: 'target', type: 'string' }],
      effects: [{ addVar: { scope: 'global', var: { param: 'target' }, delta: 1 } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'add-one', args: { target: 'score' } }],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      { addVar: { scope: 'global', var: 'score', delta: 1 } },
    ]);
    assert.equal(result.doc.effectMacros, null);
  });

  it('expands macro invocations in action effects', () => {
    const macroDef: EffectMacroDef = {
      id: 'set-flag',
      params: [{ name: 'val', type: 'number' }],
      effects: [{ setVar: { scope: 'global', var: 'flag', value: { param: 'val' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      actions: [
        {
          id: 'test-action',
          actor: 'active',
          phase: 'main',
          params: [],
          pre: null,
          cost: [],
          effects: [{ macro: 'set-flag', args: { val: 42 } }],
          limits: [],
        },
      ],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    const action = result.doc.actions?.[0] as unknown as Record<string, unknown>;
    assert.deepEqual(action.effects, [
      { setVar: { scope: 'global', var: 'flag', value: 42 } },
    ]);
  });

  it('expands macro invocations in trigger effects', () => {
    const macroDef: EffectMacroDef = {
      id: 'bump',
      params: [{ name: 'amount', type: 'number' }],
      effects: [{ addVar: { scope: 'global', var: 'counter', delta: { param: 'amount' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      triggers: [
        {
          id: 'on-move',
          event: { event: 'afterMove' },
          effects: [{ macro: 'bump', args: { amount: 5 } }],
        },
      ],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    const trigger = result.doc.triggers?.[0] as unknown as Record<string, unknown>;
    assert.deepEqual(trigger.effects, [
      { addVar: { scope: 'global', var: 'counter', delta: 5 } },
    ]);
  });

  it('handles multi-param macros', () => {
    const macroDef: EffectMacroDef = {
      id: 'move-to',
      params: [
        { name: 'zone', type: 'string' },
        { name: 'token', type: 'string' },
      ],
      effects: [{ moveToken: { token: { param: 'token' }, to: { param: 'zone' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'move-to', args: { zone: 'hand:0', token: '$t' } }],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      { moveToken: { token: '$t', to: 'hand:0' } },
    ]);
  });

  it('expands macros with structural param (effects array)', () => {
    const macroDef: EffectMacroDef = {
      id: 'wrap-if',
      params: [
        { name: 'cond', type: 'condition' },
        { name: 'body', type: 'effects' },
      ],
      effects: [{ if: { when: { param: 'cond' }, then: { param: 'body' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [
        {
          macro: 'wrap-if',
          args: {
            cond: { op: '==', left: 1, right: 1 },
            body: [{ setVar: { scope: 'global', var: 'x', value: 99 } }],
          },
        },
      ],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      {
        if: {
          when: { op: '==', left: 1, right: 1 },
          then: [{ setVar: { scope: 'global', var: 'x', value: 99 } }],
        },
      },
    ]);
  });

  it('binding refs ($name) are untouched by expansion', () => {
    const macroDef: EffectMacroDef = {
      id: 'use-binding',
      params: [{ name: 'zone', type: 'string' }],
      effects: [
        { moveToken: { token: '$target', to: { param: 'zone' } } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'use-binding', args: { zone: 'discard' } }],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      { moveToken: { token: '$target', to: 'discard' } },
    ]);
  });

  it('multiple invocations with different args', () => {
    const macroDef: EffectMacroDef = {
      id: 'inc',
      params: [{ name: 'v', type: 'string' }],
      effects: [{ addVar: { scope: 'global', var: { param: 'v' }, delta: 1 } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [
        { macro: 'inc', args: { v: 'a' } },
        { macro: 'inc', args: { v: 'b' } },
      ],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      { addVar: { scope: 'global', var: 'a', delta: 1 } },
      { addVar: { scope: 'global', var: 'b', delta: 1 } },
    ]);
  });

  it('nested macro expansion (macro A invokes macro B)', () => {
    const macroB: EffectMacroDef = {
      id: 'inner',
      params: [{ name: 'n', type: 'number' }],
      effects: [{ setVar: { scope: 'global', var: 'x', value: { param: 'n' } } }],
    };
    const macroA: EffectMacroDef = {
      id: 'outer',
      params: [{ name: 'val', type: 'number' }],
      effects: [{ macro: 'inner', args: { n: { param: 'val' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macroB, macroA],
      setup: [{ macro: 'outer', args: { val: 7 } }],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      { setVar: { scope: 'global', var: 'x', value: 7 } },
    ]);
  });

  it('detects cycle: A → B → A', () => {
    const macroA: EffectMacroDef = {
      id: 'a',
      params: [],
      effects: [{ macro: 'b', args: {} }],
    };
    const macroB: EffectMacroDef = {
      id: 'b',
      params: [],
      effects: [{ macro: 'a', args: {} }],
    };
    const doc = makeDoc({
      effectMacros: [macroA, macroB],
      setup: [{ macro: 'a', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_CYCLE'));
  });

  it('detects self-referencing macro', () => {
    const macro: EffectMacroDef = {
      id: 'self',
      params: [],
      effects: [{ macro: 'self', args: {} }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'self', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_CYCLE'));
  });

  it('detects unknown macro reference', () => {
    const existingMacro: EffectMacroDef = {
      id: 'exists',
      params: [],
      effects: [{ setVar: { scope: 'global', var: 'x', value: 1 } }],
    };
    const doc = makeDoc({
      effectMacros: [existingMacro],
      setup: [{ macro: 'nonexistent', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_UNKNOWN'));
  });

  it('detects duplicate macro IDs', () => {
    const macro1: EffectMacroDef = {
      id: 'dup',
      params: [],
      effects: [{ setVar: { scope: 'global', var: 'x', value: 1 } }],
    };
    const macro2: EffectMacroDef = {
      id: 'dup',
      params: [],
      effects: [{ setVar: { scope: 'global', var: 'x', value: 2 } }],
    };
    const doc = makeDoc({
      effectMacros: [macro1, macro2],
      setup: [],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_DUPLICATE_ID'));
  });

  it('detects missing required args', () => {
    const macro: EffectMacroDef = {
      id: 'need-arg',
      params: [{ name: 'x', type: 'number' }],
      effects: [{ setVar: { scope: 'global', var: 'v', value: { param: 'x' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'need-arg', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_MISSING_ARGS'));
  });

  it('warns on extra args', () => {
    const macro: EffectMacroDef = {
      id: 'simple',
      params: [],
      effects: [{ setVar: { scope: 'global', var: 'v', value: 1 } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'simple', args: { extra: 'stuff' } }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_EXTRA_ARGS'));
    assert.deepEqual(result.doc.setup, [
      { setVar: { scope: 'global', var: 'v', value: 1 } },
    ]);
  });

  it('expands macros nested inside forEach effects', () => {
    const macro: EffectMacroDef = {
      id: 'inc-var',
      params: [{ name: 'v', type: 'string' }],
      effects: [{ addVar: { scope: 'global', var: { param: 'v' }, delta: 1 } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [
        {
          forEach: {
            bind: '$n',
            over: { query: 'intsInRange', min: 1, max: 3 },
            effects: [{ macro: 'inc-var', args: { v: 'count' } }],
          },
        },
      ],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    const forEach = (result.doc.setup?.[0] as Record<string, unknown>).forEach as Record<string, unknown>;
    assert.deepEqual(forEach.effects, [
      { addVar: { scope: 'global', var: 'count', delta: 1 } },
    ]);
  });
});
