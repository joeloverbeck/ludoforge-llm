import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createEmptyGameSpecDoc, expandMacros } from '../../src/cnl/index.js';

describe('expandMacros', () => {
  it('expands board macro zones into deterministic zone definitions', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      zones: [
        { macro: 'grid', args: [2, 2] },
        { id: 'deck', owner: 'none', visibility: 'hidden', ordering: 'stack' },
      ] as unknown as NonNullable<ReturnType<typeof createEmptyGameSpecDoc>['zones']>,
    };

    const result = expandMacros(doc);

    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(
      result.doc.zones?.map((zone) => (zone as { readonly id?: string }).id),
      ['cell_0_0', 'cell_0_1', 'cell_1_0', 'cell_1_1', 'deck'],
    );
  });

  it('reports diagnostics for invalid board macro arguments and removes invalid macro output', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      zones: [{ macro: 'hex', args: [-1] }] as unknown as NonNullable<ReturnType<typeof createEmptyGameSpecDoc>['zones']>,
    };

    const result = expandMacros(doc);

    assert.equal(result.doc.zones?.length, 0);
    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_BOARD_MACRO_INVALID_ARGUMENT');
    assert.equal(result.diagnostics[0]?.path, 'doc.zones.0.args[0]');
  });

  it('expands draw:each into forEach over players and removes sugar from nested effects', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      setup: [
        { draw: { from: 'deck:none', to: 'hand:each', count: 1 } },
        {
          if: {
            when: { op: '==', left: 1, right: 1 },
            then: [{ draw: { from: 'deck:none', to: 'hand:each', count: 2 } }],
            else: [],
          },
        },
      ],
    };

    const result = expandMacros(doc);
    const setup = result.doc.setup as readonly Record<string, unknown>[];

    assert.deepEqual(result.diagnostics, []);
    assert.equal((setup[0]?.forEach as { readonly bind?: string }).bind, '$p');

    const nestedThen = (
      (setup[1]?.if as { readonly then?: readonly Record<string, unknown>[] }).then?.[0]?.forEach as {
        readonly bind?: string;
      }
    ).bind;
    assert.equal(nestedThen, '$p');
    assert.equal(containsHandEach(result.doc.setup), false);
  });

  it('enforces maxGeneratedZones and maxExpandedEffects during expansion', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      zones: [{ macro: 'grid', args: [3, 3] }] as unknown as NonNullable<ReturnType<typeof createEmptyGameSpecDoc>['zones']>,
      setup: [
        { draw: { from: 'deck:none', to: 'hand:each', count: 1 } },
        { draw: { from: 'deck:none', to: 'hand:each', count: 1 } },
      ],
    };

    const result = expandMacros(doc, {
      limits: {
        maxGeneratedZones: 4,
        maxExpandedEffects: 1,
      },
    });

    assert.equal(result.doc.zones?.length, 0);
    assert.equal(result.diagnostics.length, 2);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_LIMIT_EXCEEDED');
    assert.equal(result.diagnostics[1]?.code, 'CNL_COMPILER_LIMIT_EXCEEDED');
    assert.equal(containsHandEach(result.doc.setup), true);
  });

  it('expands refillToSize into bounded guarded per-iteration draw effects', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      setup: [{ refillToSize: { zone: 'hand:actor', size: 3, fromZone: 'deck:none' } }],
    };

    const result = expandMacros(doc);
    const setup = result.doc.setup as readonly Record<string, unknown>[];

    assert.deepEqual(result.diagnostics, []);
    assert.equal(setup.length, 3);

    for (const effect of setup) {
      const ifNode = effect.if as {
        readonly when?: Record<string, unknown>;
        readonly then?: readonly Record<string, unknown>[];
      };
      assert.ok(ifNode !== undefined);
      assert.deepEqual(ifNode.when, {
        op: '<',
        left: { ref: 'zoneCount', zone: 'hand:actor' },
        right: 3,
      });
      assert.deepEqual(ifNode.then, [{ draw: { from: 'deck:none', to: 'hand:actor', count: 1 } }]);
    }
  });

  it('reports missing capability when refillToSize size is not a compile-time integer literal', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      setup: [{ refillToSize: { zone: 'hand:actor', size: { ref: 'gvar', var: 'n' }, fromZone: 'deck:none' } }],
    };

    const result = expandMacros(doc);

    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(result.diagnostics[0]?.path, 'doc.setup.0.refillToSize.size');
    assert.deepEqual(result.doc.setup, doc.setup);
  });

  it('expands discardDownTo into deterministic surplus-only token processing', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      setup: [{ discardDownTo: { zone: 'hand:actor', size: 5, to: 'discard:none' } }],
    };

    const result = expandMacros(doc);
    const setup = result.doc.setup as readonly Record<string, unknown>[];
    const forEach = setup[0]?.forEach as {
      readonly bind?: string;
      readonly over?: Record<string, unknown>;
      readonly effects?: readonly Record<string, unknown>[];
    };
    const ifNode = forEach.effects?.[0]?.if as {
      readonly when?: Record<string, unknown>;
      readonly then?: readonly Record<string, unknown>[];
    };

    assert.deepEqual(result.diagnostics, []);
    assert.equal(forEach.bind, '$tok');
    assert.deepEqual(forEach.over, { query: 'tokensInZone', zone: 'hand:actor' });
    assert.deepEqual(ifNode.when, {
      op: '>',
      left: { ref: 'zoneCount', zone: 'hand:actor' },
      right: 5,
    });
    assert.deepEqual(ifNode.then, [
      { moveToken: { token: '$tok', from: 'hand:actor', to: 'discard:none' } },
    ]);
  });

  it('reports missing capability when discardDownTo size is not a compile-time integer literal', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      setup: [{ discardDownTo: { zone: 'hand:actor', size: '5' } }],
    };

    const result = expandMacros(doc);

    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_MISSING_CAPABILITY');
    assert.equal(result.diagnostics[0]?.path, 'doc.setup.0.discardDownTo.size');
    assert.deepEqual(result.doc.setup, doc.setup);
  });

  it('enforces maxExpandedEffects for refillToSize expansion size', () => {
    const doc = {
      ...createEmptyGameSpecDoc(),
      setup: [{ refillToSize: { zone: 'hand:actor', size: 2, fromZone: 'deck:none' } }],
    };

    const result = expandMacros(doc, { limits: { maxExpandedEffects: 1 } });

    assert.equal(result.diagnostics.length, 1);
    assert.equal(result.diagnostics[0]?.code, 'CNL_COMPILER_LIMIT_EXCEEDED');
    assert.deepEqual(result.doc.setup, doc.setup);
  });
});

function containsHandEach(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => containsHandEach(entry));
  }

  if (value === null || typeof value !== 'object') {
    return false;
  }

  for (const nested of Object.values(value)) {
    if (nested === 'hand:each') {
      return true;
    }
    if (containsHandEach(nested)) {
      return true;
    }
  }

  return false;
}
