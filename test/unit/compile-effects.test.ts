import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lowerEffectArray, type EffectLoweringContext } from '../../src/cnl/compile-effects.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';

const context: EffectLoweringContext = {
  ownershipByBase: {
    deck: 'none',
    hand: 'player',
    discard: 'none',
    board: 'none',
  },
  bindingScope: ['$actor'],
};

describe('compile-effects lowering', () => {
  it('lowers supported effect nodes deterministically', () => {
    const source = [
      { draw: { from: 'deck', to: 'hand:$actor', count: 1 } },
      {
        if: {
          when: { op: '>', left: { ref: 'zoneCount', zone: 'deck' }, right: 0 },
          then: [{ shuffle: { zone: 'deck' } }],
          else: [{ moveAll: { from: 'deck', to: 'discard:none' } }],
        },
      },
      {
        forEach: {
          bind: '$tok',
          over: { query: 'tokensInZone', zone: 'board' },
          effects: [{ destroyToken: { token: '$tok' } }],
        },
      },
    ];

    const first = lowerEffectArray(source, context, 'doc.actions.0.effects');
    const second = lowerEffectArray(source, context, 'doc.actions.0.effects');

    assert.deepEqual(first, second);
    assertNoDiagnostics(first);
    assert.deepEqual(first.value, [
      { draw: { from: 'deck:none', to: 'hand:$actor', count: 1 } },
      {
        if: {
          when: { op: '>', left: { ref: 'zoneCount', zone: 'deck:none' }, right: 0 },
          then: [{ shuffle: { zone: 'deck:none' } }],
          else: [{ moveAll: { from: 'deck:none', to: 'discard:none' } }],
        },
      },
      {
        forEach: {
          bind: '$tok',
          over: { query: 'tokensInZone', zone: 'board:none' },
          effects: [{ destroyToken: { token: '$tok' } }],
        },
      },
    ]);
  });

  it('emits missing capability diagnostics for unsupported effect nodes', () => {
    const result = lowerEffectArray(
      [{ teleport: { token: '$t', to: 'board:none' } }],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.effects.0');
    assert.ok((result.diagnostics[0]?.alternatives ?? []).includes('setVar'));
  });

  it('lowers chooseN range cardinality forms deterministically', () => {
    const source = [
      { chooseN: { bind: '$upToTwo', options: { query: 'players' }, max: 2 } },
      { chooseN: { bind: '$oneToThree', options: { query: 'players' }, min: 1, max: 3 } },
    ];

    const result = lowerEffectArray(source, context, 'doc.actions.0.effects');

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      { chooseN: { bind: '$upToTwo', options: { query: 'players' }, max: 2 } },
      { chooseN: { bind: '$oneToThree', options: { query: 'players' }, min: 1, max: 3 } },
    ]);
  });

  it('rejects chooseN cardinality mixes and contradictory ranges', () => {
    const result = lowerEffectArray(
      [
        { chooseN: { bind: '$badMix', options: { query: 'players' }, n: 2, max: 3 } },
        { chooseN: { bind: '$badRange', options: { query: 'players' }, min: 3, max: 1 } },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.effects.0.chooseN'), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.effects.1.chooseN'), true);
  });

  it('lowers dynamic zone expression (tokenZone ref) to zoneExpr', () => {
    const result = lowerEffectArray(
      [
        {
          moveToken: {
            token: '$cube',
            from: { zoneExpr: { ref: 'tokenZone', token: '$cube' } },
            to: 'discard',
          },
        },
      ],
      { ...context, bindingScope: ['$cube'] },
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null && result.value.length === 1);
    const effect = result.value[0]!;
    assert.ok('moveToken' in effect);
    assert.deepEqual(effect.moveToken.from, { zoneExpr: { ref: 'tokenZone', token: '$cube' } });
    assert.equal(effect.moveToken.to, 'discard:none');
  });

  it('lowers dynamic concat zone expression to zoneExpr', () => {
    const result = lowerEffectArray(
      [
        {
          moveToken: {
            token: '$cube',
            from: 'deck',
            to: { zoneExpr: { concat: ['available:', { ref: 'binding', name: '$faction' }] } },
          },
        },
      ],
      { ...context, bindingScope: ['$cube', '$faction'] },
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null && result.value.length === 1);
    const effect = result.value[0]!;
    assert.ok('moveToken' in effect);
    assert.equal(effect.moveToken.from, 'deck:none');
    assert.deepEqual(effect.moveToken.to, {
      zoneExpr: { concat: ['available:', { ref: 'binding', name: '$faction' }] },
    });
  });

  it('lowers explicit zoneExpr wrapper with static concat', () => {
    const result = lowerEffectArray(
      [{ shuffle: { zone: { zoneExpr: { concat: ['deck:', 'none'] } } } }],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null && result.value.length === 1);
    const effect = result.value[0]!;
    assert.ok('shuffle' in effect);
    assert.deepEqual(effect.shuffle.zone, { zoneExpr: { concat: ['deck:', 'none'] } });
  });

  it('rejects implicit object-based dynamic zone selectors', () => {
    const result = lowerEffectArray(
      [{ shuffle: { zone: { concat: ['deck:', 'none'] } } }],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_ZONE_SELECTOR_INVALID');
    assert.equal(result.diagnostics[0]?.path, 'doc.actions.0.effects.0.shuffle.zone');
  });
});
