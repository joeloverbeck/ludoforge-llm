import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import { lowerConditionNode } from '../../src/cnl/compile-conditions.js';
import { lowerEffectArray, type EffectLoweringContext } from '../../src/cnl/compile-effects.js';
import {
  buildConditionLoweringContext,
  buildEffectLoweringContext,
  lowerEffectsWithDiagnostics,
  lowerOptionalCondition,
} from '../../src/cnl/compile-lowering.js';
import { expandEffectMacros } from '../../src/cnl/expand-effect-macros.js';
import { createEmptyGameSpecDoc, type EffectMacroDef } from '../../src/cnl/game-spec-doc.js';
import { assertNoDiagnostics } from '../helpers/diagnostic-helpers.js';
import { buildDiscriminatedEndpointMatrix } from '../helpers/transfer-endpoint-matrix.js';

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
  it('builds canonical condition-lowering context and preserves lowering parity', () => {
    const diagnostics: Diagnostic[] = [];
    const source = { op: '==', left: { ref: 'binding', name: '$actor' }, right: { ref: 'binding', name: '$actor' } };
    const sharedContext = {
      ownershipByBase: context.ownershipByBase,
      tokenTraitVocabulary: { faction: ['US', 'NVA'] },
      namedSets: { safeActions: ['pass'] },
    };

    const loweredViaAdapter = lowerOptionalCondition(source, diagnostics, 'doc.actions.0.pre', sharedContext, ['$actor']);
    const loweredDirect = lowerConditionNode(source, buildConditionLoweringContext(sharedContext, ['$actor']), 'doc.actions.0.pre');

    assert.deepEqual(loweredViaAdapter, loweredDirect.value);
    assert.equal(diagnostics.length, 0);
    assertNoDiagnostics(loweredDirect);
  });

  it('builds canonical effect-lowering context and preserves lowering parity', () => {
    const diagnostics: Diagnostic[] = [];
    const source = [{ draw: { from: 'deck', to: 'hand:$actor', count: 1 } }];
    const sharedContext = {
      ownershipByBase: context.ownershipByBase,
      tokenTraitVocabulary: { faction: ['US', 'NVA'] },
      namedSets: { safeActions: ['pass'] },
      freeOperationActionIds: ['limitedOp'],
    };

    const loweredViaAdapter = lowerEffectsWithDiagnostics(source, diagnostics, 'doc.actions.0.effects', sharedContext, ['$actor']);
    const loweredDirect = lowerEffectArray(source, buildEffectLoweringContext(sharedContext, ['$actor']), 'doc.actions.0.effects');

    assert.deepEqual(loweredViaAdapter, loweredDirect.value);
    assert.equal(diagnostics.length, 0);
    assertNoDiagnostics(loweredDirect);
  });

  it('lowers supported effect nodes deterministically', () => {
    const source = [
      { draw: { from: 'deck', to: 'hand:$actor', count: 1 } },
      { setActivePlayer: { player: { chosen: '$actor' } } },
      { transferVar: { from: { scope: 'pvar', player: 'actor', var: 'coins' }, to: { scope: 'global', var: 'pot' }, amount: 2 } },
      { reveal: { zone: 'hand:$actor', to: { chosen: '$actor' }, filter: [{ prop: 'faction', eq: 'US' }] } },
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
      {
        reduce: {
          itemBind: '$n',
          accBind: '$acc',
          over: { query: 'intsInRange', min: 1, max: 3 },
          initial: 0,
          next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
          resultBind: '$sum',
          in: [{ setVar: { scope: 'global', var: 'total', value: { ref: 'binding', name: '$sum' } } }],
        },
      },
      {
        bindValue: {
          bind: '$computed',
          value: { op: '+', left: 1, right: 2 },
        },
      },
    ];

    const first = lowerEffectArray(source, context, 'doc.actions.0.effects');
    const second = lowerEffectArray(source, context, 'doc.actions.0.effects');

    assert.deepEqual(first, second);
    assertNoDiagnostics(first);
    assert.deepEqual(first.value, [
      { draw: { from: 'deck:none', to: 'hand:$actor', count: 1 } },
      { setActivePlayer: { player: { chosen: '$actor' } } },
      { transferVar: { from: { scope: 'pvar', player: 'actor', var: 'coins' }, to: { scope: 'global', var: 'pot' }, amount: 2 } },
      { reveal: { zone: 'hand:$actor', to: { chosen: '$actor' }, filter: [{ prop: 'faction', op: 'eq', value: 'US' }] } },
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
      {
        reduce: {
          itemBind: '$n',
          accBind: '$acc',
          over: { query: 'intsInRange', min: 1, max: 3 },
          initial: 0,
          next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
          resultBind: '$sum',
          in: [{ setVar: { scope: 'global', var: 'total', value: { ref: 'binding', name: '$sum' } } }],
        },
      },
      {
        bindValue: {
          bind: '$computed',
          value: { op: '+', left: 1, right: 2 },
        },
      },
    ]);
  });

  it('lowers conceal effect optional from/filter fields without changing zone-only behavior', () => {
    const result = lowerEffectArray(
      [
        {
          conceal: {
            zone: 'hand:$actor',
            from: { chosen: '$actor' },
            filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
          },
        },
        {
          conceal: {
            zone: 'hand:$actor',
            from: 'all',
          },
        },
        {
          conceal: {
            zone: 'hand:$actor',
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        conceal: {
          zone: 'hand:$actor',
          from: { chosen: '$actor' },
          filter: [{ prop: 'faction', op: 'eq', value: 'US' }],
        },
      },
      {
        conceal: {
          zone: 'hand:$actor',
          from: 'all',
        },
      },
      {
        conceal: {
          zone: 'hand:$actor',
        },
      },
    ]);
  });

  it('rejects reduce effects with conflicting binder identifiers', () => {
    const result = lowerEffectArray(
      [
        {
          reduce: {
            itemBind: '$same',
            accBind: '$same',
            over: { query: 'players' },
            initial: 0,
            next: 0,
            resultBind: '$sum',
            in: [],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.effects.0.reduce'), true);
  });

  it('preserves trusted compiler macroOrigin on control-flow binders during lowering', () => {
    const macroDef: EffectMacroDef = {
      id: 'collect-forced-bets',
      params: [],
      exports: [],
      effects: [
        {
          forEach: {
            bind: '$player',
            over: { query: 'players' },
            effects: [],
          },
        },
        {
          reduce: {
            itemBind: '$n',
            accBind: '$acc',
            over: { query: 'intsInRange', min: 1, max: 3 },
            initial: 0,
            next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
            resultBind: '$total',
            in: [],
          },
        },
        {
          removeByPriority: {
            budget: 2,
            groups: [
              { bind: '$target', over: { query: 'tokensInZone', zone: 'board' }, to: 'discard' },
            ],
          },
        },
      ],
    };
    const expansion = expandEffectMacros({
      ...createEmptyGameSpecDoc(),
      effectMacros: [macroDef],
      setup: [{ macro: 'collect-forced-bets', args: {} }],
    });
    assert.equal(expansion.diagnostics.length, 0);

    const result = lowerEffectArray(
      expansion.doc.setup ?? [],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null);
    assert.equal(result.value.length, 3);

    const forEachEffect = result.value[0] as { forEach: Record<string, unknown> };
    const reduceEffect = result.value[1] as { reduce: Record<string, unknown> };
    const removeByPriorityEntry = result.value[2];
    assert.ok(removeByPriorityEntry !== undefined && 'removeByPriority' in removeByPriorityEntry);
    const removeByPriorityEffect = removeByPriorityEntry.removeByPriority as { macroOrigin?: { macroId: string; stem: string }; groups: readonly Record<string, unknown>[] };

    assert.equal(typeof forEachEffect.forEach.bind, 'string');
    assert.equal((forEachEffect.forEach.bind as string).startsWith('$__macro_collect_forced_bets_'), true);
    assert.deepEqual(forEachEffect.forEach.macroOrigin, { macroId: 'collect-forced-bets', stem: 'player' });
    assert.deepEqual(forEachEffect.forEach.over, { query: 'players' });
    assert.deepEqual(forEachEffect.forEach.effects, []);

    assert.equal(typeof reduceEffect.reduce.itemBind, 'string');
    assert.equal(typeof reduceEffect.reduce.accBind, 'string');
    assert.equal(typeof reduceEffect.reduce.resultBind, 'string');
    assert.equal((reduceEffect.reduce.itemBind as string).startsWith('$__macro_collect_forced_bets_'), true);
    assert.equal((reduceEffect.reduce.accBind as string).startsWith('$__macro_collect_forced_bets_'), true);
    assert.equal((reduceEffect.reduce.resultBind as string).startsWith('$__macro_collect_forced_bets_'), true);
    assert.deepEqual(reduceEffect.reduce.itemMacroOrigin, { macroId: 'collect-forced-bets', stem: 'n' });
    assert.deepEqual(reduceEffect.reduce.accMacroOrigin, { macroId: 'collect-forced-bets', stem: 'acc' });
    assert.deepEqual(reduceEffect.reduce.resultMacroOrigin, { macroId: 'collect-forced-bets', stem: 'total' });
    assert.deepEqual(reduceEffect.reduce.over, { query: 'intsInRange', min: 1, max: 3 });
    assert.equal(reduceEffect.reduce.initial, 0);
    assert.deepEqual(reduceEffect.reduce.in, []);

    assert.deepEqual(removeByPriorityEffect.macroOrigin, { macroId: 'collect-forced-bets', stem: 'target' });
    assert.deepEqual(removeByPriorityEffect.groups[0]?.macroOrigin, { macroId: 'collect-forced-bets', stem: 'target' });
  });

  it('rejects malformed macroOrigin payloads on control-flow effects', () => {
    const result = lowerEffectArray(
      [
        {
          forEach: {
            bind: '$tok',
            macroOrigin: { macroId: 'collect-forced-bets' },
            over: { query: 'players' },
            effects: [],
          },
        },
        {
          reduce: {
            itemBind: '$n',
            accBind: '$acc',
            itemMacroOrigin: { stem: 'n' },
            accMacroOrigin: { stem: 'acc' },
            resultMacroOrigin: { stem: 'straightHigh' },
            over: { query: 'intsInRange', min: 1, max: 3 },
            initial: 0,
            next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
            resultBind: '$sum',
            in: [],
          },
        },
        {
          removeByPriority: {
            budget: 1,
            macroOrigin: { stem: 'target' },
            groups: [
              {
                bind: '$target',
                macroOrigin: { macroId: 'cleanup' },
                over: { query: 'tokensInZone', zone: 'board' },
                to: 'discard',
              },
            ],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.0.forEach.macroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.1.reduce.itemMacroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.1.reduce.accMacroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.1.reduce.resultMacroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.2.removeByPriority.macroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.2.removeByPriority.groups.0.macroOrigin',
      ),
      true,
    );
  });

  it('rejects removed legacy reduce.macroOrigin payloads', () => {
    const result = lowerEffectArray(
      [
        {
          reduce: {
            itemBind: '$n',
            accBind: '$acc',
            macroOrigin: { macroId: 'legacy', stem: 'sum' },
            over: { query: 'intsInRange', min: 1, max: 3 },
            initial: 0,
            next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
            resultBind: '$sum',
            in: [],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED'
          && diagnostic.path === 'doc.actions.0.effects.0.reduce.macroOrigin',
      ),
      true,
    );
  });

  it('rejects untrusted authored macroOrigin payloads', () => {
    const result = lowerEffectArray(
      [
        {
          forEach: {
            bind: '$tok',
            macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' },
            over: { query: 'players' },
            effects: [],
          },
        },
        {
          reduce: {
            itemBind: '$n',
            accBind: '$acc',
            itemMacroOrigin: { macroId: 'hand-rank-score', stem: 'n' },
            accMacroOrigin: { macroId: 'hand-rank-score', stem: 'acc' },
            resultMacroOrigin: { macroId: 'hand-rank-score', stem: 'straightHigh' },
            over: { query: 'intsInRange', min: 1, max: 3 },
            initial: 0,
            next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
            resultBind: '$sum',
            in: [],
          },
        },
        {
          removeByPriority: {
            budget: 1,
            macroOrigin: { macroId: 'cleanup', stem: 'target' },
            groups: [
              {
                bind: '$target',
                macroOrigin: { macroId: 'cleanup', stem: 'target' },
                over: { query: 'tokensInZone', zone: 'board' },
                to: 'discard',
              },
            ],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED'
          && diagnostic.path === 'doc.actions.0.effects.0.forEach.macroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED'
          && diagnostic.path === 'doc.actions.0.effects.1.reduce.itemMacroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED'
          && diagnostic.path === 'doc.actions.0.effects.1.reduce.accMacroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED'
          && diagnostic.path === 'doc.actions.0.effects.1.reduce.resultMacroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED'
          && diagnostic.path === 'doc.actions.0.effects.2.removeByPriority.macroOrigin',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_MACRO_ORIGIN_UNTRUSTED'
          && diagnostic.path === 'doc.actions.0.effects.2.removeByPriority.groups.0.macroOrigin',
      ),
      true,
    );
  });

  it('rejects authored reserved compiler metadata keys across effect shapes', () => {
    const result = lowerEffectArray(
      [
        {
          forEach: {
            bind: '$tok',
            __compilerMeta: { macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' } },
            over: { query: 'players' },
            effects: [],
          },
        },
        {
          reduce: {
            itemBind: '$n',
            accBind: '$acc',
            __compilerMeta: { macroOrigin: { macroId: 'hand-rank-score', stem: 'straightHigh' } },
            over: { query: 'intsInRange', min: 1, max: 3 },
            initial: 0,
            next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
            resultBind: '$sum',
            in: [],
          },
        },
        {
          setVar: {
            scope: 'global',
            var: 'score',
            value: 1,
            __internal: true,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_RESERVED_COMPILER_METADATA_FORBIDDEN'
          && diagnostic.path === 'doc.actions.0.effects.0.forEach.__compilerMeta',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_RESERVED_COMPILER_METADATA_FORBIDDEN'
          && diagnostic.path === 'doc.actions.0.effects.1.reduce.__compilerMeta',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_RESERVED_COMPILER_METADATA_FORBIDDEN'
          && diagnostic.path === 'doc.actions.0.effects.2.setVar.__internal',
      ),
      true,
    );
  });

  it('rejects authored binder declarations in compiler-owned namespace', () => {
    const result = lowerEffectArray(
      [
        { chooseOne: { bind: '$__choice', options: { query: 'enums', values: ['a'] } } },
        { forEach: { bind: '$__item', over: { query: 'tokensInZone', zone: 'board' }, effects: [] } },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_RESERVED_BINDING_NAMESPACE_FORBIDDEN'
          && diagnostic.path === 'doc.actions.0.effects.0.chooseOne.bind',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_RESERVED_BINDING_NAMESPACE_FORBIDDEN'
          && diagnostic.path === 'doc.actions.0.effects.1.forEach.bind',
      ),
      true,
    );
  });

  it('allows reserved-looking keys inside createToken props payload maps', () => {
    const result = lowerEffectArray(
      [
        {
          createToken: {
            type: 'unit',
            zone: 'board',
            props: {
              __engineIndependent: 1,
            },
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        createToken: {
          type: 'unit',
          zone: 'board:none',
          props: {
            __engineIndependent: 1,
          },
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

  it('lowers transferVar optional fields including player selectors and binders', () => {
    const result = lowerEffectArray(
      [
        {
          transferVar: {
            from: { scope: 'pvar', player: { chosen: '$actor' }, var: 'coins' },
            to: { scope: 'pvar', player: 'active', var: 'committed' },
            amount: { ref: 'gvar', var: 'stake' },
            min: 1,
            max: 4,
            actualBind: '$actual',
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        transferVar: {
          from: { scope: 'pvar', player: { chosen: '$actor' }, var: 'coins' },
          to: { scope: 'pvar', player: 'active', var: 'committed' },
          amount: { ref: 'gvar', var: 'stake' },
          min: 1,
          max: 4,
          actualBind: '$actual',
        },
      },
    ]);
  });

  it('lowers transferVar with a global source endpoint', () => {
    const result = lowerEffectArray(
      [
        {
          transferVar: {
            from: { scope: 'global', var: 'bank' },
            to: { scope: 'pvar', player: { chosen: '$actor' }, var: 'coins' },
            amount: 3,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        transferVar: {
          from: { scope: 'global', var: 'bank' },
          to: { scope: 'pvar', player: { chosen: '$actor' }, var: 'coins' },
          amount: 3,
        },
      },
    ]);
  });

  it('lowers transferVar with zoneVar endpoints and canonical zone selectors', () => {
    const result = lowerEffectArray(
      [
        {
          transferVar: {
            from: { scope: 'zoneVar', zone: 'board', var: 'supply' },
            to: { scope: 'zoneVar', zone: 'hand:$actor', var: 'supply' },
            amount: 3,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        transferVar: {
          from: { scope: 'zoneVar', zone: 'board:none', var: 'supply' },
          to: { scope: 'zoneVar', zone: 'hand:$actor', var: 'supply' },
          amount: 3,
        },
      },
    ]);
  });

  it('rejects invalid transferVar endpoint field combinations by scope for both endpoints', () => {
    const basePath = 'doc.actions.0.effects.0.transferVar';
    const cases = buildDiscriminatedEndpointMatrix({
      scopeField: 'scope',
      varField: 'var',
      playerField: 'player',
      zoneField: 'zone',
      scopes: {
        global: 'global',
        player: 'pvar',
        zone: 'zoneVar',
      },
      values: {
        globalVar: 'bank',
        playerVar: 'coins',
        zoneVar: 'supply',
        player: 'actor',
        zone: 'board',
      },
    });

    for (const testCase of cases) {
      const result = lowerEffectArray(
        [{ transferVar: { from: testCase.from, to: testCase.to, amount: 1 } }],
        context,
        'doc.actions.0.effects',
      );

      if (testCase.violation === undefined) {
        assertNoDiagnostics(result);
        continue;
      }

      const expectedPath = `${basePath}.${testCase.violation.endpoint}.${testCase.violation.field}`;
      assert.equal(result.value, null, testCase.name);
      assert.equal(
        result.diagnostics.some(
          (diagnostic) => diagnostic.severity === 'error' && diagnostic.path === expectedPath,
        ),
        true,
        testCase.name,
      );
    }
  });

  it('lowers chooseN range cardinality forms deterministically', () => {
    const source = [
      { chooseN: { bind: '$upToTwo', options: { query: 'players' }, max: 2 } },
      { chooseN: { bind: '$oneToThree', options: { query: 'players' }, min: 1, max: 3 } },
      {
        chooseN: {
          bind: '$dynamicRange',
          options: { query: 'players' },
          min: { if: { when: true, then: 0, else: 1 } },
          max: { ref: 'gvar', var: 'maxTargets' },
        },
      },
    ];

    const result = lowerEffectArray(source, context, 'doc.actions.0.effects');

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        chooseN: {
          internalDecisionId: 'decision:doc.actions.0.effects.0.chooseN',
          bind: '$upToTwo',
          options: { query: 'players' },
          max: 2,
        },
      },
      {
        chooseN: {
          internalDecisionId: 'decision:doc.actions.0.effects.1.chooseN',
          bind: '$oneToThree',
          options: { query: 'players' },
          min: 1,
          max: 3,
        },
      },
      {
        chooseN: {
          internalDecisionId: 'decision:doc.actions.0.effects.2.chooseN',
          bind: '$dynamicRange',
          options: { query: 'players' },
          min: { if: { when: true, then: 0, else: 1 } },
          max: { ref: 'gvar', var: 'maxTargets' },
        },
      },
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

  it('lowers explicit chooser selectors for chooseOne/chooseN', () => {
    const result = lowerEffectArray(
      [
        { chooseOne: { bind: '$target', chooser: { id: 1 }, options: { query: 'players' } } },
        { chooseN: { bind: '$targets', chooser: 'active', options: { query: 'players' }, max: 2 } },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        chooseOne: {
          internalDecisionId: 'decision:doc.actions.0.effects.0.chooseOne',
          bind: '$target',
          chooser: { id: 1 },
          options: { query: 'players' },
        },
      },
      {
        chooseN: {
          internalDecisionId: 'decision:doc.actions.0.effects.1.chooseN',
          bind: '$targets',
          chooser: 'active',
          options: { query: 'players' },
          max: 2,
        },
      },
    ]);
  });

  it('keeps non-distribute query contracts explicitly domain-agnostic', () => {
    const result = lowerEffectArray(
      [
        { chooseOne: { bind: '$choice', options: { query: 'tokensInZone', zone: 'deck' } } },
        { chooseN: { bind: '$choices', options: { query: 'mapSpaces' }, max: 1 } },
        { forEach: { bind: '$item', over: { query: 'globalMarkers' }, effects: [] } },
        {
          reduce: {
            itemBind: '$item',
            accBind: '$acc',
            over: {
              query: 'concat',
              sources: [
                { query: 'tokensInZone', zone: 'deck' },
                { query: 'zones' },
              ],
            },
            initial: 0,
            next: { ref: 'binding', name: '$acc' },
            resultBind: '$reduced',
            in: [],
          },
        },
        {
          evaluateSubset: {
            source: {
              query: 'concat',
              sources: [
                { query: 'players' },
                { query: 'mapSpaces' },
              ],
            },
            subsetSize: 1,
            subsetBind: '$subset',
            compute: [],
            scoreExpr: 1,
            resultBind: '$result',
            in: [],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null);
    assert.equal(result.value.length, 5);
  });

  it('rejects chooseOne/chooseN options that may evaluate to non-encodable runtime shapes', () => {
    const result = lowerEffectArray(
      [
        {
          chooseOne: {
            bind: '$row',
            options: { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
          },
        },
        {
          chooseN: {
            bind: '$mixed',
            options: {
              query: 'concat',
              sources: [
                { query: 'players' },
                { query: 'assetRows', tableId: 'tournament-standard::blindSchedule.levels' },
              ],
            },
            max: 1,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    const chooseOneDiagnostic = result.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
        && diagnostic.path === 'doc.actions.0.effects.0.chooseOne.options',
    );
    const chooseNDiagnostic = result.diagnostics.find(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_CHOICE_OPTIONS_RUNTIME_SHAPE_INVALID'
        && diagnostic.path === 'doc.actions.0.effects.1.chooseN.options',
    );
    assert.ok(chooseOneDiagnostic);
    assert.ok(chooseNDiagnostic);
    assert.deepEqual(chooseOneDiagnostic.alternatives, ['object']);
    assert.deepEqual(chooseNDiagnostic.alternatives, ['object']);
  });

  it('lowers distributeTokens into chooseN/forEach/chooseOne/moveToken sequence', () => {
    const result = lowerEffectArray(
      [
        {
          distributeTokens: {
            tokens: {
              query: 'tokensInZone',
              zone: 'deck',
            },
            destinations: {
              query: 'zones',
            },
            min: 1,
            max: 2,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        chooseN: {
          internalDecisionId: 'decision:doc.actions.0.effects.0.distributeTokens.selectTokens',
          bind: '$__selected_doc_actions_0_effects_0_distributeTokens',
          options: {
            query: 'tokensInZone',
            zone: 'deck:none',
          },
          min: 1,
          max: 2,
        },
      },
      {
        forEach: {
          bind: '$__token_doc_actions_0_effects_0_distributeTokens',
          over: {
            query: 'binding',
            name: '$__selected_doc_actions_0_effects_0_distributeTokens',
          },
          effects: [
            {
              chooseOne: {
                internalDecisionId: 'decision:doc.actions.0.effects.0.distributeTokens.chooseDestination',
                bind: '$__destination_doc_actions_0_effects_0_distributeTokens',
                options: {
                  query: 'zones',
                },
              },
            },
            {
              moveToken: {
                token: '$__token_doc_actions_0_effects_0_distributeTokens',
                from: {
                  zoneExpr: {
                    ref: 'tokenZone',
                    token: '$__token_doc_actions_0_effects_0_distributeTokens',
                  },
                },
                to: {
                  zoneExpr: {
                    ref: 'binding',
                    name: '$__destination_doc_actions_0_effects_0_distributeTokens',
                  },
                },
              },
            },
          ],
        },
      },
    ]);
  });

  it('accepts all zone-domain destination query families for distributeTokens', () => {
    const result = lowerEffectArray(
      [
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: { query: 'zones' },
            n: 1,
          },
        },
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: { query: 'mapSpaces' },
            n: 1,
          },
        },
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: { query: 'adjacentZones', zone: 'board' },
            n: 1,
          },
        },
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: { query: 'connectedZones', zone: 'board', includeStart: true, maxDepth: 2 },
            n: 1,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null);
    assert.equal(result.value.length, 8);
  });

  it('validates recursive destination-domain propagation for distributeTokens', () => {
    const result = lowerEffectArray(
      [
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: {
              query: 'nextInOrderByCondition',
              source: { query: 'mapSpaces' },
              from: 'board:none',
              bind: '$zone',
              where: { op: '==', left: 1, right: 1 },
            },
            n: 1,
          },
        },
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: {
              query: 'nextInOrderByCondition',
              source: { query: 'tokensInMapSpaces' },
              from: 'tok-1',
              bind: '$token',
              where: { op: '==', left: 1, right: 1 },
            },
            n: 1,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_DISTRIBUTE_TOKENS_DESTINATION_DOMAIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.1.distributeTokens.destinations',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_DISTRIBUTE_TOKENS_DESTINATION_DOMAIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.0.distributeTokens.destinations',
      ),
      false,
    );
  });

  it('rejects distributeTokens cardinality mixes and contradictory ranges', () => {
    const result = lowerEffectArray(
      [
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: { query: 'zones' },
            n: 2,
            max: 3,
          },
        },
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: { query: 'zones' },
            min: 3,
            max: 1,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.effects.0.distributeTokens'), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.path === 'doc.actions.0.effects.1.distributeTokens'), true);
  });

  it('rejects distributeTokens token/zone domain mismatches at compile time', () => {
    const result = lowerEffectArray(
      [
        {
          distributeTokens: {
            tokens: { query: 'players' },
            destinations: { query: 'zones' },
            n: 1,
          },
        },
        {
          distributeTokens: {
            tokens: { query: 'tokensInZone', zone: 'deck' },
            destinations: { query: 'players' },
            n: 1,
          },
        },
        {
          distributeTokens: {
            tokens: {
              query: 'concat',
              sources: [
                { query: 'tokensInZone', zone: 'deck' },
                { query: 'zones' },
              ],
            },
            destinations: { query: 'zones' },
            n: 1,
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.equal(result.value, null);
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_DISTRIBUTE_TOKENS_TOKEN_DOMAIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.0.distributeTokens.tokens',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_DISTRIBUTE_TOKENS_DESTINATION_DOMAIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.1.distributeTokens.destinations',
      ),
      true,
    );
    assert.equal(
      result.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'CNL_COMPILER_DISTRIBUTE_TOKENS_TOKEN_DOMAIN_INVALID'
          && diagnostic.path === 'doc.actions.0.effects.2.distributeTokens.tokens',
      ),
      true,
    );
  });

  it('lowers globalMarkers query and flipGlobalMarker effect with binding marker refs', () => {
    const result = lowerEffectArray(
      [
        {
          chooseOne: {
            bind: '$marker',
            options: { query: 'globalMarkers', markers: ['cap_topGun', 'cap_migs'], states: ['unshaded', 'shaded'] },
          },
        },
        {
          flipGlobalMarker: {
            marker: { ref: 'binding', name: '$marker' },
            stateA: 'unshaded',
            stateB: 'shaded',
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        chooseOne: {
          internalDecisionId: 'decision:doc.actions.0.effects.0.chooseOne',
          bind: '$marker',
          options: { query: 'globalMarkers', markers: ['cap_topGun', 'cap_migs'], states: ['unshaded', 'shaded'] },
        },
      },
      {
        flipGlobalMarker: {
          marker: { ref: 'binding', name: '$marker' },
          stateA: 'unshaded',
          stateB: 'shaded',
        },
      },
    ]);
  });

  it('lowers grantFreeOperation effect with optional sequencing and zone filter', () => {
    const result = lowerEffectArray(
      [
        {
          grantFreeOperation: {
            id: 'apc-vc-uprising',
            seat: '3',
            operationClass: 'limitedOperation',
            actionIds: ['operation'],
            uses: 1,
            sequence: { chain: 'apc-uprising', step: 0 },
            zoneFilter: { op: '==', left: { ref: 'zoneProp', zone: 'saigon:none', prop: 'country' }, right: 'southVietnam' },
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        grantFreeOperation: {
          id: 'apc-vc-uprising',
          seat: '3',
          operationClass: 'limitedOperation',
          actionIds: ['operation'],
          uses: 1,
          sequence: { chain: 'apc-uprising', step: 0 },
          zoneFilter: { op: '==', left: { ref: 'zoneProp', zone: 'saigon:none', prop: 'country' }, right: 'southVietnam' },
        },
      },
    ]);
  });

  it('emits warning diagnostics for risky free-operation sequence transitions', () => {
    const result = lowerEffectArray(
      [
        {
          grantFreeOperation: {
            seat: '1',
            operationClass: 'limitedOperation',
            actionIds: ['limitedOp'],
            sequence: { chain: 'risk-chain', step: 0 },
            zoneFilter: { op: '==', left: { ref: 'zoneProp', zone: 'saigon:none', prop: 'country' }, right: 'southVietnam' },
          },
        },
        {
          grantFreeOperation: {
            seat: '1',
            operationClass: 'operation',
            actionIds: ['operation'],
            sequence: { chain: 'risk-chain', step: 1 },
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.notEqual(result.value, null);
    const warnings = result.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK' &&
        diagnostic.severity === 'warning',
    );
    assert.equal(warnings.length > 0, true);
    assert.equal(
      warnings.some((diagnostic) => diagnostic.path === 'doc.actions.0.effects.1.grantFreeOperation.sequence'),
      true,
    );
  });

  it('emits sequence viability warning when explicit and default effective action domains are disjoint', () => {
    const result = lowerEffectArray(
      [
        {
          grantFreeOperation: {
            seat: '1',
            operationClass: 'operation',
            actionIds: ['limitedOp'],
            sequence: { chain: 'mixed-domain-chain', step: 0 },
          },
        },
        {
          grantFreeOperation: {
            seat: '1',
            operationClass: 'operation',
            sequence: { chain: 'mixed-domain-chain', step: 1 },
          },
        },
      ],
      {
        ...context,
        freeOperationActionIds: ['operation'],
      },
      'doc.actions.0.effects',
    );

    assert.notEqual(result.value, null);
    const warnings = result.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK'
        && diagnostic.severity === 'warning'
        && diagnostic.message.includes('non-overlapping actionIds'),
    );
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.path, 'doc.actions.0.effects.1.grantFreeOperation.sequence');
  });

  it('emits sequence viability warning when both effective action domains are absent', () => {
    const result = lowerEffectArray(
      [
        {
          grantFreeOperation: {
            seat: '1',
            operationClass: 'operation',
            sequence: { chain: 'absent-domain-chain', step: 0 },
          },
        },
        {
          grantFreeOperation: {
            seat: '1',
            operationClass: 'operation',
            sequence: { chain: 'absent-domain-chain', step: 1 },
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assert.notEqual(result.value, null);
    const warnings = result.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK'
        && diagnostic.severity === 'warning'
        && diagnostic.message.includes('non-overlapping actionIds'),
    );
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]?.path, 'doc.actions.0.effects.1.grantFreeOperation.sequence');
  });

  it('does not emit action-domain warning when explicit actionIds overlap turn-flow defaults', () => {
    const result = lowerEffectArray(
      [
        {
          grantFreeOperation: {
            seat: '1',
            operationClass: 'operation',
            actionIds: ['operation'],
            sequence: { chain: 'mixed-domain-overlap-chain', step: 0 },
          },
        },
        {
          grantFreeOperation: {
            seat: '1',
            operationClass: 'operation',
            sequence: { chain: 'mixed-domain-overlap-chain', step: 1 },
          },
        },
      ],
      {
        ...context,
        freeOperationActionIds: ['operation', 'limitedOp'],
      },
      'doc.actions.0.effects',
    );

    assert.notEqual(result.value, null);
    const actionDomainWarnings = result.diagnostics.filter(
      (diagnostic) =>
        diagnostic.code === 'CNL_COMPILER_FREE_OPERATION_SEQUENCE_VIABILITY_RISK'
        && diagnostic.severity === 'warning'
        && diagnostic.message.includes('non-overlapping actionIds'),
    );
    assert.equal(actionDomainWarnings.length, 0);
  });

  it('lowers gotoPhaseExact/advancePhase/pushInterruptPhase/popInterruptPhase effects', () => {
    const result = lowerEffectArray(
      [
        {
          gotoPhaseExact: {
            phase: 'commitment',
          },
        },
        {
          advancePhase: {},
        },
        {
          pushInterruptPhase: {
            phase: 'commitment',
            resumePhase: 'main',
          },
        },
        {
          popInterruptPhase: {},
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        gotoPhaseExact: {
          phase: 'commitment',
        },
      },
      {
        advancePhase: {},
      },
      {
        pushInterruptPhase: {
          phase: 'commitment',
          resumePhase: 'main',
        },
      },
      {
        popInterruptPhase: {},
      },
    ]);
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

  it('allows removeByPriority count/remaining bindings in subsequent sibling effects', () => {
    const result = lowerEffectArray(
      [
        {
          removeByPriority: {
            budget: 3,
            groups: [
              {
                bind: '$tok',
                over: { query: 'tokensInZone', zone: 'board' },
                to: 'discard:none',
                countBind: '$removed',
              },
            ],
            remainingBind: '$remaining',
          },
        },
        {
          addVar: {
            scope: 'global',
            var: 'score',
            delta: {
              op: '+',
              left: { ref: 'binding', name: '$removed' },
              right: { ref: 'binding', name: '$remaining' },
            },
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.ok(result.value !== null);
  });
});
