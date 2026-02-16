import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerEffectArray, type EffectLoweringContext } from '../../src/cnl/compile-effects.js';

const context: EffectLoweringContext = {
  ownershipByBase: {
    deck: 'none',
    hand: 'player',
    discard: 'none',
    board: 'none',
  },
  bindingScope: ['$actor', '$token', '$turn'],
};

describe('compile-effects binding scope validation', () => {
  it('resolves nested forEach/let bindings within lexical scope', () => {
    const result = lowerEffectArray(
      [
        {
          forEach: {
            bind: '$tok',
            over: { query: 'tokensInZone', zone: 'board' },
            effects: [
              {
                let: {
                  bind: '$delta',
                  value: { op: '+', left: 1, right: 2 },
                  in: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$delta' } } }],
                },
              },
              { moveToken: { token: '$tok', from: 'board:none', to: 'hand:$actor' } },
            ],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      [],
    );
  });

  it('reports unbound bindings with deterministic alternatives ordering', () => {
    const result = lowerEffectArray(
      [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$tokn' } } }],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_BINDING_UNBOUND',
        path: 'doc.actions.0.effects.0.addVar.delta.name',
        severity: 'error',
        message: 'Unbound binding reference "$tokn".',
        suggestion: 'Use a binding declared by action params or an in-scope effect binder.',
        alternatives: ['$token', '$turn', '$actor'],
      },
    ]);
  });

  it('emits warning diagnostics when nested binders shadow outer bindings', () => {
    const result = lowerEffectArray(
      [
        {
          forEach: {
            bind: '$token',
            over: { query: 'tokensInZone', zone: 'board:none' },
            effects: [
              {
                let: {
                  bind: '$token',
                  value: 1,
                  in: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$token' } } }],
                },
              },
            ],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === 'CNL_COMPILER_BINDING_SHADOWED'),
      [
        {
          code: 'CNL_COMPILER_BINDING_SHADOWED',
          path: 'doc.actions.0.effects.0.forEach.bind',
          severity: 'warning',
          message: 'Binding "$token" shadows an outer binding.',
          suggestion: 'Rename the inner binding to avoid accidental capture.',
        },
        {
          code: 'CNL_COMPILER_BINDING_SHADOWED',
          path: 'doc.actions.0.effects.0.forEach.effects.0.let.bind',
          severity: 'warning',
          message: 'Binding "$token" shadows an outer binding.',
          suggestion: 'Rename the inner binding to avoid accidental capture.',
        },
      ],
    );
  });

  it('does not leak let bindings outside nested in-block', () => {
    const result = lowerEffectArray(
      [
        { let: { bind: '$value', value: 3, in: [{ addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$value' } } }] } },
        { addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$value' } } },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_BINDING_UNBOUND');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.effects.1.addVar.delta.name');
  });

  it('allows let blocks to export nested sequential bindings without $-prefix semantics', () => {
    const result = lowerEffectArray(
      [
        {
          let: {
            bind: 'local',
            value: 3,
            in: [
              {
                bindValue: {
                  bind: 'exported',
                  value: { op: '+', left: { ref: 'binding', name: 'local' }, right: 2 },
                },
              },
            ],
          },
        },
        { addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: 'exported' } } },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      [],
    );
  });

  it('allows reduce blocks to export nested sequential bindings without $-prefix semantics', () => {
    const result = lowerEffectArray(
      [
        {
          reduce: {
            itemBind: 'n',
            accBind: 'acc',
            over: { query: 'intsInRange', min: 1, max: 3 },
            initial: 0,
            next: { op: '+', left: { ref: 'binding', name: 'acc' }, right: { ref: 'binding', name: 'n' } },
            resultBind: 'sum',
            in: [
              {
                bindValue: {
                  bind: 'exported',
                  value: { ref: 'binding', name: 'sum' },
                },
              },
            ],
          },
        },
        { addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: 'exported' } } },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      [],
    );
  });

  it('exposes commitResource.actualBind to subsequent effects in the same sequence', () => {
    const result = lowerEffectArray(
      [
        {
          commitResource: {
            from: { scope: 'pvar', player: 'actor', var: 'coins' },
            to: { scope: 'global', var: 'pot' },
            amount: 2,
            actualBind: '$actual',
          },
        },
        { addVar: { scope: 'global', var: 'score', delta: { ref: 'binding', name: '$actual' } } },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      [],
    );
  });

  it('exposes evaluateSubset.compute sequential bindings to scoreExpr', () => {
    const result = lowerEffectArray(
      [
        {
          evaluateSubset: {
            source: { query: 'players' },
            subsetSize: 1,
            subsetBind: '$subset',
            compute: [
              {
                bindValue: {
                  bind: '$scoreCandidate',
                  value: {
                    aggregate: {
                      op: 'sum',
                      query: { query: 'binding', name: '$subset' },
                      bind: '$p',
                      valueExpr: { ref: 'binding', name: '$p' },
                    },
                  },
                },
              },
            ],
            scoreExpr: { ref: 'binding', name: '$scoreCandidate' },
            resultBind: '$best',
            in: [],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      [],
    );
  });

  it('rejects unbound non-prefixed token bindings on binding-only string surfaces', () => {
    const result = lowerEffectArray(
      [{ destroyToken: { token: 'tokenRef' } }],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.deepEqual(result.diagnostics, [
      {
        code: 'CNL_COMPILER_BINDING_UNBOUND',
        path: 'doc.actions.0.effects.0.destroyToken.token',
        severity: 'error',
        message: 'Unbound binding reference "tokenRef".',
        suggestion: 'Use a binding declared by action params or an in-scope effect binder.',
        alternatives: ['$token', '$turn', '$actor'],
      },
    ]);
  });

  it('accepts declared non-prefixed token bindings with exact-name identity', () => {
    const result = lowerEffectArray(
      [{ destroyToken: { token: 'tokenRef' } }],
      {
        ...context,
        bindingScope: ['$actor', 'tokenRef'],
      },
      'doc.actions.0.effects',
    );

    assert.equal(result.value !== null, true);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'),
      [],
    );
  });
});
