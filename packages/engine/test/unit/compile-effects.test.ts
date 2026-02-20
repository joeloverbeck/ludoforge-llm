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

  it('preserves macroOrigin on forEach and reduce during lowering', () => {
    const result = lowerEffectArray(
      [
        {
          forEach: {
            bind: '$__macro_collect_forced_bets_path_player',
            macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' },
            over: { query: 'players' },
            effects: [],
          },
        },
        {
          reduce: {
            itemBind: '$n',
            accBind: '$acc',
            macroOrigin: { macroId: 'hand-rank-score', stem: 'straightHigh' },
            over: { query: 'intsInRange', min: 1, max: 3 },
            initial: 0,
            next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
            resultBind: '$__macro_hand_rank_score_path_straightHigh',
            in: [],
          },
        },
      ],
      context,
      'doc.actions.0.effects',
    );

    assertNoDiagnostics(result);
    assert.deepEqual(result.value, [
      {
        forEach: {
          bind: '$__macro_collect_forced_bets_path_player',
          macroOrigin: { macroId: 'collect-forced-bets', stem: 'player' },
          over: { query: 'players' },
          effects: [],
        },
      },
      {
        reduce: {
          itemBind: '$n',
          accBind: '$acc',
          macroOrigin: { macroId: 'hand-rank-score', stem: 'straightHigh' },
          over: { query: 'intsInRange', min: 1, max: 3 },
          initial: 0,
          next: { op: '+', left: { ref: 'binding', name: '$acc' }, right: { ref: 'binding', name: '$n' } },
          resultBind: '$__macro_hand_rank_score_path_straightHigh',
          in: [],
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
            faction: '3',
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
          faction: '3',
          operationClass: 'limitedOperation',
          actionIds: ['operation'],
          uses: 1,
          sequence: { chain: 'apc-uprising', step: 0 },
          zoneFilter: { op: '==', left: { ref: 'zoneProp', zone: 'saigon:none', prop: 'country' }, right: 'southVietnam' },
        },
      },
    ]);
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
