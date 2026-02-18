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
      exports: [],
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
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'flag', value: { param: 'val' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      actions: [
        {
          id: 'test-action',
actor: 'active',
executor: 'actor',
phase: ['main'],
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
      exports: [],
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
      exports: [],
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
      exports: [],
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
      exports: [],
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
      exports: [],
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
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'x', value: { param: 'n' } } }],
    };
    const macroA: EffectMacroDef = {
      id: 'outer',
      params: [{ name: 'val', type: 'number' }],
      exports: [],
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
      exports: [],
      effects: [{ macro: 'b', args: {} }],
    };
    const macroB: EffectMacroDef = {
      id: 'b',
      params: [],
      exports: [],
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
      exports: [],
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
      exports: [],
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
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'x', value: 1 } }],
    };
    const macro2: EffectMacroDef = {
      id: 'dup',
      params: [],
      exports: [],
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
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'v', value: { param: 'x' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'need-arg', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_MISSING_ARGS'));
  });

  it('rejects extra args', () => {
    const macro: EffectMacroDef = {
      id: 'simple',
      params: [],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'v', value: 1 } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'simple', args: { extra: 'stuff' } }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_EXTRA_ARGS'));
    assert.deepEqual(result.doc.setup, []);
  });

  it('accepts constrained enum and literals macro params', () => {
    const macro: EffectMacroDef = {
      id: 'typed',
      params: [
        { name: 'faction', type: { kind: 'enum', values: ['NVA', 'VC'] } },
        { name: 'tier', type: { kind: 'literals', values: [1, 2, 3] } },
      ],
      exports: [],
      effects: [
        { setVar: { scope: 'global', var: 'pickedFaction', value: { param: 'faction' } } },
        { setVar: { scope: 'global', var: 'pickedTier', value: { param: 'tier' } } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'typed', args: { faction: 'VC', tier: 2 } }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.doc.setup, [
      { setVar: { scope: 'global', var: 'pickedFaction', value: 'VC' } },
      { setVar: { scope: 'global', var: 'pickedTier', value: 2 } },
    ]);
  });

  it('rejects arg values that violate constrained param contracts', () => {
    const macro: EffectMacroDef = {
      id: 'typed',
      params: [{ name: 'faction', type: { kind: 'enum', values: ['NVA', 'VC'] } }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'pickedFaction', value: { param: 'faction' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'typed', args: { faction: 'US' } }],
    });

    const result = expandEffectMacros(doc);
    const violation = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION');
    const declaration = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_ARG_CONSTRAINT_DECLARATION');
    assert.ok(violation !== undefined);
    assert.equal(violation?.path, 'setup[0].args.faction');
    assert.equal(violation?.macroOrigin?.invocation?.path, 'setup[0]');
    assert.equal(violation?.macroOrigin?.declaration?.path, 'effectMacros[0].params[0]');
    assert.equal(violation?.macroOrigin?.expanded?.path, 'setup[0].args.faction');
    assert.ok(declaration !== undefined);
    assert.equal(declaration?.path, 'effectMacros[0].params[0]');
    assert.equal(declaration?.macroOrigin?.invocation?.path, 'setup[0]');
    assert.equal(declaration?.macroOrigin?.declaration?.path, 'effectMacros[0].params[0]');
    assert.deepEqual(result.doc.setup, []);
  });

  it('accepts tokenTraitValue macro params when args use canonical selected piece-catalog values', () => {
    const macro: EffectMacroDef = {
      id: 'typed-trait',
      params: [{ name: 'pieceType', type: { kind: 'tokenTraitValue', prop: 'type' } }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'pickedType', value: { param: 'pieceType' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog',
          payload: {
            factions: [{ id: 'US', color: '#e63946' }],
            pieceTypes: [
              { id: 'us-troops', faction: 'US', statusDimensions: [], transitions: [], runtimeProps: { type: 'troops' } },
            ],
            inventory: [{ pieceTypeId: 'us-troops', faction: 'US', total: 1 }],
          },
        },
        {
          id: 'map',
          kind: 'map',
          payload: { spaces: [] },
        },
        {
          id: 'scenario',
          kind: 'scenario',
          payload: { mapAssetId: 'map', pieceCatalogAssetId: 'pieces', scenarioName: 'S', yearRange: 'Y' },
        },
      ],
      setup: [{ macro: 'typed-trait', args: { pieceType: 'troops' } }],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      { setVar: { scope: 'global', var: 'pickedType', value: 'troops' } },
    ]);
  });

  it('rejects tokenTraitValue macro params when args use non-canonical values', () => {
    const macro: EffectMacroDef = {
      id: 'typed-trait',
      params: [{ name: 'pieceType', type: { kind: 'tokenTraitValue', prop: 'type' } }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'pickedType', value: { param: 'pieceType' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog',
          payload: {
            factions: [{ id: 'US', color: '#e63946' }],
            pieceTypes: [
              { id: 'us-troops', faction: 'US', statusDimensions: [], transitions: [], runtimeProps: { type: 'troops' } },
            ],
            inventory: [{ pieceTypeId: 'us-troops', faction: 'US', total: 1 }],
          },
        },
        {
          id: 'map',
          kind: 'map',
          payload: { spaces: [] },
        },
        {
          id: 'scenario',
          kind: 'scenario',
          payload: { mapAssetId: 'map', pieceCatalogAssetId: 'pieces', scenarioName: 'S', yearRange: 'Y' },
        },
      ],
      setup: [{ macro: 'typed-trait', args: { pieceType: 'troop' } }],
    });

    const result = expandEffectMacros(doc);
    const violation = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION');
    assert.ok(violation !== undefined);
    assert.equal(violation?.path, 'setup[0].args.pieceType');
    assert.deepEqual(result.doc.setup, []);
  });

  it('allows dynamic value expressions for tokenTraitValue macro params', () => {
    const macro: EffectMacroDef = {
      id: 'typed-trait',
      params: [{ name: 'pieceType', type: { kind: 'tokenTraitValue', prop: 'type' } }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'pickedType', value: { param: 'pieceType' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      dataAssets: [
        {
          id: 'pieces',
          kind: 'pieceCatalog',
          payload: {
            factions: [{ id: 'US', color: '#e63946' }],
            pieceTypes: [
              { id: 'us-troops', faction: 'US', statusDimensions: [], transitions: [], runtimeProps: { type: 'troops' } },
            ],
            inventory: [{ pieceTypeId: 'us-troops', faction: 'US', total: 1 }],
          },
        },
        {
          id: 'map',
          kind: 'map',
          payload: { spaces: [] },
        },
        {
          id: 'scenario',
          kind: 'scenario',
          payload: { mapAssetId: 'map', pieceCatalogAssetId: 'pieces', scenarioName: 'S', yearRange: 'Y' },
        },
      ],
      setup: [{ macro: 'typed-trait', args: { pieceType: { ref: 'binding', name: '$pieceType' } } }],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      { setVar: { scope: 'global', var: 'pickedType', value: { ref: 'binding', name: '$pieceType' } } },
    ]);
  });

  it('rewrites nested macro args only for binding-aware param kinds', () => {
    const inner: EffectMacroDef = {
      id: 'inner',
      params: [
        { name: 'binding', type: 'bindingName' },
        { name: 'template', type: 'bindingTemplate' },
        { name: 'zone', type: 'zoneSelector' },
        { name: 'raw', type: 'string' },
      ],
      exports: [],
      effects: [
        { setVar: { scope: 'global', var: 'bindingOut', value: { param: 'binding' } } },
        { setVar: { scope: 'global', var: 'templateOut', value: { param: 'template' } } },
        { setVar: { scope: 'global', var: 'zoneOut', value: { param: 'zone' } } },
        { setVar: { scope: 'global', var: 'rawOut', value: { param: 'raw' } } },
      ],
    };
    const outer: EffectMacroDef = {
      id: 'outer',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'enums', values: ['a', 'b'] } } },
        {
          macro: 'inner',
          args: {
            binding: '$choice',
            template: 'token-{$choice}',
            zone: 'discard:{$choice}',
            raw: 'literal-$choice',
          },
        },
      ],
    };
    const doc = makeDoc({
      effectMacros: [inner, outer],
      setup: [{ macro: 'outer', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const choose = result.doc.setup?.[0] as { chooseOne: { bind: string } };
    const bindingOut = result.doc.setup?.[1] as { setVar: { value: string } };
    const templateOut = result.doc.setup?.[2] as { setVar: { value: string } };
    const zoneOut = result.doc.setup?.[3] as { setVar: { value: string } };
    const rawOut = result.doc.setup?.[4] as { setVar: { value: string } };

    assert.notEqual(choose.chooseOne.bind, '$choice');
    assert.equal(bindingOut.setVar.value, choose.chooseOne.bind);
    assert.equal(templateOut.setVar.value, `token-{${choose.chooseOne.bind}}`);
    assert.equal(zoneOut.setVar.value, `discard:{${choose.chooseOne.bind}}`);
    assert.equal(rawOut.setVar.value, 'literal-$choice');
  });

  it('rejects invalid non-string arg values for binding-aware param kinds', () => {
    const macro: EffectMacroDef = {
      id: 'typed-binding',
      params: [{ name: 'name', type: 'bindingTemplate' }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'x', value: { param: 'name' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'typed-binding', args: { name: { param: 'x' } } }],
    });

    const result = expandEffectMacros(doc);
    const violation = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION');
    const declaration = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_ARG_CONSTRAINT_DECLARATION');
    assert.ok(violation !== undefined);
    assert.equal(violation?.path, 'setup[0].args.name');
    assert.ok(declaration !== undefined);
    assert.equal(declaration?.path, 'effectMacros[0].params[0]');
    assert.deepEqual(result.doc.setup, []);
  });

  it('accepts canonical object forms for playerSelector and zoneSelector macro params', () => {
    const macro: EffectMacroDef = {
      id: 'typed-selectors',
      params: [
        { name: 'player', type: 'playerSelector' },
        { name: 'zone', type: 'zoneSelector' },
      ],
      exports: [],
      effects: [
        { setVar: { scope: 'global', var: 'playerSelectorOut', value: { param: 'player' } } },
        { setVar: { scope: 'global', var: 'zoneSelectorOut', value: { param: 'zone' } } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [
        {
          macro: 'typed-selectors',
          args: {
            player: { chosen: '$player' },
            zone: { zoneExpr: { ref: 'binding', name: '$zone' } },
          },
        },
      ],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);
    assert.deepEqual(result.doc.setup, [
      { setVar: { scope: 'global', var: 'playerSelectorOut', value: { chosen: '$player' } } },
      { setVar: { scope: 'global', var: 'zoneSelectorOut', value: { zoneExpr: { ref: 'binding', name: '$zone' } } } },
    ]);
  });

  it('rejects malformed playerSelector object args for selector-typed macro params', () => {
    const macro: EffectMacroDef = {
      id: 'typed-player',
      params: [{ name: 'player', type: 'playerSelector' }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'playerSelectorOut', value: { param: 'player' } } }],
    };
    const doc = makeDoc({
      effectMacros: [macro],
      setup: [{ macro: 'typed-player', args: { player: { name: 'actor' } } }],
    });

    const result = expandEffectMacros(doc);
    const violation = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_ARG_CONSTRAINT_VIOLATION');
    assert.ok(violation !== undefined);
    assert.equal(violation?.path, 'setup[0].args.player');
    assert.deepEqual(result.doc.setup, []);
  });

  it('rewrites chosen bindings in playerSelector object args for nested macro invocations', () => {
    const inner: EffectMacroDef = {
      id: 'inner-player',
      params: [{ name: 'player', type: 'playerSelector' }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'playerSelectorOut', value: { param: 'player' } } }],
    };
    const outer: EffectMacroDef = {
      id: 'outer-player',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'players' } } },
        { macro: 'inner-player', args: { player: { chosen: '$choice' } } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [inner, outer],
      setup: [{ macro: 'outer-player', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);

    const choose = result.doc.setup?.[0] as { chooseOne: { bind: string } };
    const playerOut = result.doc.setup?.[1] as { setVar: { value: { chosen: string } } };
    assert.equal(playerOut.setVar.value.chosen, choose.chooseOne.bind);
  });

  it('rewrites zoneExpr string bindings in zoneSelector object args for nested macro invocations', () => {
    const inner: EffectMacroDef = {
      id: 'inner-zone',
      params: [{ name: 'zone', type: 'zoneSelector' }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'zoneSelectorOut', value: { param: 'zone' } } }],
    };
    const outer: EffectMacroDef = {
      id: 'outer-zone',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'players' } } },
        { macro: 'inner-zone', args: { zone: { zoneExpr: 'discard:{$choice}' } } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [inner, outer],
      setup: [{ macro: 'outer-zone', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.equal(result.diagnostics.length, 0);

    const choose = result.doc.setup?.[0] as { chooseOne: { bind: string } };
    const zoneOut = result.doc.setup?.[1] as { setVar: { value: { zoneExpr: string } } };
    assert.equal(zoneOut.setVar.value.zoneExpr, `discard:{${choose.chooseOne.bind}}`);
  });

  it('expands macros nested inside forEach effects', () => {
    const macro: EffectMacroDef = {
      id: 'inc-var',
      params: [{ name: 'v', type: 'string' }],
      exports: [],
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

  it('renames non-exported macro bindings per invocation deterministically', () => {
    const macroDef: EffectMacroDef = {
      id: 'pick',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice@{$slot}', options: { query: 'enums', values: ['a', 'b'] } } },
        { setVar: { scope: 'global', var: 'x', value: { ref: 'binding', name: '$choice@{$slot}' } } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [
        { macro: 'pick', args: {} },
        { macro: 'pick', args: {} },
      ],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const firstChoose = result.doc.setup?.[0] as { chooseOne: { bind: string } };
    const firstSetVar = result.doc.setup?.[1] as { setVar: { value: { ref: 'binding'; name: string } } };
    const secondChoose = result.doc.setup?.[2] as { chooseOne: { bind: string } };
    const secondSetVar = result.doc.setup?.[3] as { setVar: { value: { ref: 'binding'; name: string } } };

    assert.notEqual(firstChoose.chooseOne.bind, '$choice@{$slot}');
    assert.notEqual(secondChoose.chooseOne.bind, '$choice@{$slot}');
    assert.notEqual(firstChoose.chooseOne.bind, secondChoose.chooseOne.bind);
    assert.equal(firstSetVar.setVar.value.name, firstChoose.chooseOne.bind);
    assert.equal(secondSetVar.setVar.value.name, secondChoose.chooseOne.bind);
  });

  it('preserves exported macro bindings without renaming', () => {
    const macroDef: EffectMacroDef = {
      id: 'pick-exported',
      params: [],
      exports: ['$choice'],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'enums', values: ['a', 'b'] } } },
        { setVar: { scope: 'global', var: 'x', value: { ref: 'binding', name: '$choice' } } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'pick-exported', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.doc.setup, [
      { chooseOne: { bind: '$choice', options: { query: 'enums', values: ['a', 'b'] } } },
      { setVar: { scope: 'global', var: 'x', value: { ref: 'binding', name: '$choice' } } },
    ]);
  });

  it('does not implicitly export non-templated binders when exports is omitted', () => {
    const macroDef: EffectMacroDef = {
      id: 'pick-no-implicit-export',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'enums', values: ['a', 'b'] } } },
        { setVar: { scope: 'global', var: 'x', value: { ref: 'binding', name: '$choice' } } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'pick-no-implicit-export', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const choose = result.doc.setup?.[0] as { chooseOne: { bind: string } };
    const setVar = result.doc.setup?.[1] as { setVar: { value: { ref: 'binding'; name: string } } };
    assert.notEqual(choose.chooseOne.bind, '$choice');
    assert.equal(setVar.setVar.value.name, choose.chooseOne.bind);
  });

  it('reports unknown exported bindings', () => {
    const macroDef: EffectMacroDef = {
      id: 'bad-export',
      params: [],
      exports: ['$missing'],
      effects: [{ chooseOne: { bind: '$local', options: { query: 'enums', values: ['a'] } } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'bad-export', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_EXPORT_UNKNOWN_BINDING'));
  });

  it('reports duplicate exported bindings', () => {
    const macroDef: EffectMacroDef = {
      id: 'dup-export',
      params: [],
      exports: ['$x', '$x'],
      effects: [{ chooseOne: { bind: '$x', options: { query: 'enums', values: ['a'] } } }],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'dup-export', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_EXPORT_DUPLICATE'));
  });

  it('does not rewrite non-binding literals that happen to contain binding-like text', () => {
    const macroDef: EffectMacroDef = {
      id: 'literal-safety',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'enums', values: ['a', 'b'] } } },
        { setVar: { scope: 'global', var: 'picked', value: { ref: 'binding', name: '$choice' } } },
        {
          createToken: {
            type: '$choice',
            zone: 'deck:none',
            props: {
              label: 'token-$choice',
              exact: '$choice',
            },
          },
        },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'literal-safety', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const choose = result.doc.setup?.[0] as { chooseOne: { bind: string } };
    const setVar = result.doc.setup?.[1] as { setVar: { value: { ref: 'binding'; name: string } } };
    const create = result.doc.setup?.[2] as { createToken: { type: string; props: { label: string; exact: string } } };
    assert.notEqual(choose.chooseOne.bind, '$choice');
    assert.equal(setVar.setVar.value.name, choose.chooseOne.bind);
    assert.equal(create.createToken.type, '$choice');
    assert.equal(create.createToken.props.label, 'token-$choice');
    assert.equal(create.createToken.props.exact, '$choice');
  });

  it('rewrites all supported binding-bearing fields consistently', () => {
    const macroDef: EffectMacroDef = {
      id: 'all-binders',
      params: [],
      exports: [],
      effects: [
        {
          forEach: {
            bind: '$item',
            over: { query: 'binding', name: '$source' },
            effects: [
              {
                let: {
                  bind: '$inner',
                  value: { ref: 'binding', name: '$item' },
                  in: [{ setVar: { scope: 'global', var: 'x', value: { ref: 'binding', name: '$inner' } } }],
                },
              },
            ],
            countBind: '$count',
            in: [{ setVar: { scope: 'global', var: 'c', value: { ref: 'binding', name: '$count' } } }],
          },
        },
        {
          removeByPriority: {
            budget: 1,
            groups: [{ bind: '$group', over: { query: 'binding', name: '$item' }, to: 'discard:none', countBind: '$removed' }],
            remainingBind: '$remaining',
            in: [
              { setVar: { scope: 'global', var: 'r', value: { ref: 'binding', name: '$remaining' } } },
              { setVar: { scope: 'global', var: 'rm', value: { ref: 'binding', name: '$removed' } } },
            ],
          },
        },
        {
          rollRandom: {
            bind: '$roll',
            min: 1,
            max: 6,
            in: [{ setVar: { scope: 'global', var: 'd', value: { ref: 'binding', name: '$roll' } } }],
          },
        },
        { chooseN: { bind: '$pick', options: { query: 'binding', name: '$group' }, n: 1 } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'all-binders', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const forEach = result.doc.setup?.[0] as {
      forEach: {
        bind: string;
        countBind: string;
        effects: [{ let: { bind: string; value: { ref: 'binding'; name: string }; in: [{ setVar: { value: { ref: 'binding'; name: string } } }] } }];
        in: [{ setVar: { value: { ref: 'binding'; name: string } } }];
      };
    };
    const remove = result.doc.setup?.[1] as {
      removeByPriority: {
        groups: [{ bind: string; countBind: string; over: { query: 'binding'; name: string } }];
        remainingBind: string;
        in: [{ setVar: { value: { ref: 'binding'; name: string } } }, { setVar: { value: { ref: 'binding'; name: string } } }];
      };
    };
    const roll = result.doc.setup?.[2] as { rollRandom: { bind: string; in: [{ setVar: { value: { ref: 'binding'; name: string } } }] } };
    const chooseN = result.doc.setup?.[3] as { chooseN: { bind: string; options: { query: 'binding'; name: string } } };

    assert.notEqual(forEach.forEach.bind, '$item');
    assert.notEqual(forEach.forEach.countBind, '$count');
    assert.notEqual(forEach.forEach.effects[0].let.bind, '$inner');
    assert.equal(forEach.forEach.effects[0].let.value.name, forEach.forEach.bind);
    assert.equal(forEach.forEach.effects[0].let.in[0].setVar.value.name, forEach.forEach.effects[0].let.bind);
    assert.equal(forEach.forEach.in[0].setVar.value.name, forEach.forEach.countBind);

    assert.notEqual(remove.removeByPriority.groups[0].bind, '$group');
    assert.notEqual(remove.removeByPriority.groups[0].countBind, '$removed');
    assert.notEqual(remove.removeByPriority.remainingBind, '$remaining');
    assert.equal(remove.removeByPriority.groups[0].over.name, forEach.forEach.bind);
    assert.equal(remove.removeByPriority.in[0].setVar.value.name, remove.removeByPriority.remainingBind);
    assert.equal(remove.removeByPriority.in[1].setVar.value.name, remove.removeByPriority.groups[0].countBind);

    assert.notEqual(roll.rollRandom.bind, '$roll');
    assert.equal(roll.rollRandom.in[0].setVar.value.name, roll.rollRandom.bind);

    assert.notEqual(chooseN.chooseN.bind, '$pick');
    assert.equal(chooseN.chooseN.options.name, remove.removeByPriority.groups[0].bind);
  });

  it('rewrites binding references nested in tokensInZone filters', () => {
    const macroDef: EffectMacroDef = {
      id: 'query-filter-binding',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$faction', options: { query: 'enums', values: ['NVA', 'VC'] } } },
        {
          setVar: {
            scope: 'global',
            var: 'count',
            value: {
              aggregate: {
                op: 'count',
                query: {
                  query: 'tokensInZone',
                  zone: 'map:none',
                  filter: [{ prop: 'faction', eq: { ref: 'binding', name: '$faction' } }],
                },
              },
            },
          },
        },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'query-filter-binding', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const choose = result.doc.setup?.[0] as { chooseOne: { bind: string } };
    const setVar = result.doc.setup?.[1] as {
      setVar: { value: { aggregate: { query: { filter: [{ eq: { name: string } }] } } } };
    };
    assert.notEqual(choose.chooseOne.bind, '$faction');
    assert.equal(setVar.setVar.value.aggregate.query.filter[0].eq.name, choose.chooseOne.bind);
  });

  it('rewrites aggregate bind declarations and their references consistently', () => {
    const macroDef: EffectMacroDef = {
      id: 'aggregate-bind-hygiene',
      params: [],
      exports: [],
      effects: [
        {
          setVar: {
            scope: 'global',
            var: 'count',
            value: {
              aggregate: {
                op: 'sum',
                query: { query: 'players' },
                bind: '$player',
                valueExpr: {
                  if: {
                    when: {
                      op: '==',
                      left: { ref: 'binding', name: '$player' },
                      right: 0,
                    },
                    then: 1,
                    else: 0,
                  },
                },
              },
            },
          },
        },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'aggregate-bind-hygiene', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const setVar = result.doc.setup?.[0] as {
      setVar: {
        value: {
          aggregate: {
            bind: string;
            valueExpr: { if: { when: { left: { ref: 'binding'; name: string } } } };
          };
        };
      };
    };
    assert.notEqual(setVar.setVar.value.aggregate.bind, '$player');
    assert.equal(
      setVar.setVar.value.aggregate.valueExpr.if.when.left.name,
      setVar.setVar.value.aggregate.bind,
    );
  });

  it('rewrites binding references in adjacent left/right zone selector fields', () => {
    const macroDef: EffectMacroDef = {
      id: 'adjacent-left-right',
      params: [],
      exports: [],
      effects: [
        {
          forEach: {
            bind: '$space',
            over: { query: 'binding', name: 'targetSpaces' },
            effects: [
              {
                chooseN: {
                  bind: '$adjacent@{$space}',
                  options: {
                    query: 'mapSpaces',
                    filter: {
                      op: 'adjacent',
                      left: '$space',
                      right: '$zone',
                    },
                  },
                  min: 0,
                  max: 1,
                },
              },
            ],
          },
        },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'adjacent-left-right', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const forEach = result.doc.setup?.[0] as {
      forEach: {
        bind: string;
        effects: [{ chooseN: { options: { filter: { left: string; right: string } } } }];
      };
    };

    assert.notEqual(forEach.forEach.bind, '$space');
    assert.equal(forEach.forEach.effects[0].chooseN.options.filter.left, forEach.forEach.bind);
    assert.equal(forEach.forEach.effects[0].chooseN.options.filter.right, '$zone');
  });

  it('does not rewrite generic left/right string literals outside structured zone selectors', () => {
    const macroDef: EffectMacroDef = {
      id: 'literal-left-right',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'enums', values: ['a', 'b'] } } },
        {
          setVar: {
            scope: 'global',
            var: 'x',
            value: {
              if: {
                when: { op: '==', left: '$choice', right: '$choice' },
                then: 1,
                else: 0,
              },
            },
          },
        },
      ],
    };
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'literal-left-right', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.deepEqual(result.diagnostics, []);

    const setVar = result.doc.setup?.[1] as {
      setVar: { value: { if: { when: { left: string; right: string } } } };
    };
    assert.equal(setVar.setVar.value.if.when.left, '$choice');
    assert.equal(setVar.setVar.value.if.when.right, '$choice');
  });

  it('reports unsupported dynamic binder declarations during macro expansion', () => {
    const macroDef = {
      id: 'dynamic-bind',
      params: [],
      effects: [{ chooseOne: { bind: { param: 'x' }, options: { query: 'enums', values: ['a'] } } }],
    } as unknown as EffectMacroDef;
    const doc = makeDoc({
      effectMacros: [macroDef],
      setup: [{ macro: 'dynamic-bind', args: {} }],
    });

    const result = expandEffectMacros(doc);
    assert.ok(result.diagnostics.some((d) => d.code === 'EFFECT_MACRO_BINDING_DECLARATION_INVALID'));
    const diag = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_BINDING_DECLARATION_INVALID');
    assert.equal(diag?.path, 'effectMacros[0].effects[0].chooseOne.bind');
  });

  it('rejects non-exported local binder leakage from nested macro string params', () => {
    const inner: EffectMacroDef = {
      id: 'inner',
      params: [{ name: 'name', type: 'string' }],
      exports: [],
      effects: [{ setVar: { scope: 'global', var: 'x', value: { ref: 'binding', name: { param: 'name' } } } }],
    };
    const outer: EffectMacroDef = {
      id: 'outer',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'enums', values: ['a', 'b'] } } },
        { macro: 'inner', args: { name: '$choice' } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [inner, outer],
      setup: [{ macro: 'outer', args: {} }],
    });

    const result = expandEffectMacros(doc);
    const leak = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_HYGIENE_BINDING_LEAK');
    assert.ok(leak !== undefined);
    assert.match(leak?.path ?? '', /setup\[0\]\[macro:outer\]/);
    assert.deepEqual(result.doc.setup, []);
  });

  it('rejects unresolved local binding templates in binding-bearing output fields', () => {
    const inner: EffectMacroDef = {
      id: 'inner',
      params: [{ name: 'zone', type: 'string' }],
      exports: [],
      effects: [{ moveToken: { token: '$t', to: { param: 'zone' } } }],
    };
    const outer: EffectMacroDef = {
      id: 'outer',
      params: [],
      exports: [],
      effects: [
        { chooseOne: { bind: '$choice', options: { query: 'enums', values: ['a', 'b'] } } },
        { macro: 'inner', args: { zone: 'discard:{$choice}' } },
      ],
    };
    const doc = makeDoc({
      effectMacros: [inner, outer],
      setup: [{ macro: 'outer', args: {} }],
    });

    const result = expandEffectMacros(doc);
    const unresolved = result.diagnostics.find((d) => d.code === 'EFFECT_MACRO_HYGIENE_UNRESOLVED_TEMPLATE');
    assert.ok(unresolved !== undefined);
    assert.match(unresolved?.path ?? '', /setup\[0\]\[macro:outer\]/);
    assert.equal(unresolved?.macroOrigin?.invocation?.path, 'setup[0][macro:outer]');
    assert.equal(unresolved?.macroOrigin?.declaration?.path, 'effectMacros[1]');
    assert.equal(unresolved?.macroOrigin?.expanded?.path, unresolved?.path);
    assert.deepEqual(result.doc.setup, []);
  });
});
