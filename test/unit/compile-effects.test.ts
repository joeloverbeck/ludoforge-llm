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
    assert.deepEqual(first.diagnostics, []);
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
});
