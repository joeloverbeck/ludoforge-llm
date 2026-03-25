import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ConditionAST, EffectAST, ValueExpr } from '../../../src/kernel/types.js';
import {
  classifyEffect,
  computeCoverageRatio,
  isCompilableCondition,
  matchAddVar,
  matchCompilableCondition,
  matchForEachPlayers,
  matchGotoPhaseExact,
  matchIf,
  matchSetVar,
  matchSimpleNumericValue,
  matchSimpleValue,
} from '../../../src/kernel/effect-compiler-patterns.js';
import { eff } from '../../helpers/effect-tag-helper.js';

describe('effect-compiler-patterns', () => {
  describe('matchSimpleValue', () => {
    it('matches scalar literals and supported simple refs', () => {
      assert.deepEqual(matchSimpleValue(7), { kind: 'literal', value: 7 });
      assert.deepEqual(matchSimpleValue(true), { kind: 'literal', value: true });
      assert.deepEqual(matchSimpleValue('river'), { kind: 'literal', value: 'river' });
      assert.deepEqual(matchSimpleValue({ _t: 2, ref: 'gvar', var: 'pot' }), {
        kind: 'gvar',
        varName: 'pot',
      });
      assert.deepEqual(matchSimpleValue({ _t: 2, ref: 'pvar', player: 'active', var: 'chips' }), {
        kind: 'pvar',
        player: 'active',
        varName: 'chips',
      });
      assert.deepEqual(matchSimpleValue({ _t: 2, ref: 'binding', name: 'seat', displayName: 'Seat' }), {
        kind: 'binding',
        name: 'seat',
        displayName: 'Seat',
      });
    });

    it('rejects complex expressions and unsupported ref families', () => {
      const aggregateExpr: ValueExpr = { _t: 5, aggregate: { op: 'count', query: { query: 'players' } } };
      assert.equal(matchSimpleValue({ _t: 6, op: '+', left: 1, right: 2 }), null);
      assert.equal(matchSimpleValue(aggregateExpr), null);
      assert.equal(matchSimpleValue({ _t: 2, ref: 'zoneVar', zone: 'board', var: 'threat' }), null);
      assert.equal(matchSimpleValue({ _t: 2, ref: 'tokenProp', token: 't1', prop: 'face' }), null);
    });
  });

  describe('matchSimpleNumericValue', () => {
    it('accepts numeric literals and numeric-compatible refs only', () => {
      assert.deepEqual(matchSimpleNumericValue(3), { kind: 'literal', value: 3 });
      assert.deepEqual(matchSimpleNumericValue({ _t: 2, ref: 'binding', name: 'delta' }), {
        kind: 'binding',
        name: 'delta',
      });
      assert.equal(matchSimpleNumericValue({ _t: 6, op: '+', left: 1, right: 2 }), null);
    });
  });

  describe('matchCompilableCondition', () => {
    it('matches simple comparisons and nested logical trees', () => {
      const condition: ConditionAST = {
        op: 'and',
        args: [
          { op: '==', left: { _t: 2, ref: 'gvar', var: 'phase' }, right: 'deal' },
          {
            op: 'or',
            args: [
              { op: '>=', left: { _t: 2, ref: 'binding', name: 'count' }, right: 2 },
              { op: '<', left: { _t: 2, ref: 'pvar', player: 'active', var: 'chips' }, right: 5 },
            ],
          },
        ],
      };

      assert.deepEqual(matchCompilableCondition(condition), {
        kind: 'logical',
        op: 'and',
        args: [
          {
            kind: 'comparison',
            op: '==',
            left: { kind: 'gvar', varName: 'phase' },
            right: { kind: 'literal', value: 'deal' },
          },
          {
            kind: 'logical',
            op: 'or',
            args: [
              {
                kind: 'comparison',
                op: '>=',
                left: { kind: 'binding', name: 'count' },
                right: { kind: 'literal', value: 2 },
              },
              {
                kind: 'comparison',
                op: '<',
                left: { kind: 'pvar', player: 'active', varName: 'chips' },
                right: { kind: 'literal', value: 5 },
              },
            ],
          },
        ],
      });
      assert.equal(isCompilableCondition(condition), true);
    });

    it('rejects unsupported condition operators', () => {
      assert.equal(matchCompilableCondition({ op: 'not', arg: true }), null);
      assert.equal(matchCompilableCondition({ op: 'in', item: 'a', set: 'abc' }), null);
      assert.equal(isCompilableCondition({ op: 'zonePropIncludes', zone: 'x', prop: 'tags', value: 'hot' }), false);
    });
  });

  describe('effect matchers', () => {
    it('matches setVar for global and pvar targets with simple values', () => {
      assert.deepEqual(
        matchSetVar(eff({ setVar: { scope: 'global', var: 'pot', value: 0 } })),
        {
          kind: 'setVar',
          target: { scope: 'global', varName: 'pot' },
          value: { kind: 'literal', value: 0 },
        },
      );

      assert.deepEqual(
        matchSetVar(eff({ setVar: { scope: 'pvar', player: 'active', var: 'chips', value: { _t: 2, ref: 'binding', name: 'seat' } } })),
        {
          kind: 'setVar',
          target: { scope: 'pvar', player: 'active', varName: 'chips' },
          value: { kind: 'binding', name: 'seat' },
        },
      );
    });

    it('rejects zoneVar and complex setVar payloads', () => {
      assert.equal(
        matchSetVar(eff({ setVar: { scope: 'zoneVar', zone: 'board', var: 'threat', value: 1 } })),
        null,
      );
      assert.equal(
        matchSetVar(eff({ setVar: { scope: 'global', var: 'pot', value: { _t: 6, op: '+', left: 1, right: 2 } } })),
        null,
      );
    });

    it('matches numeric addVar and rejects non-compilable deltas', () => {
      assert.deepEqual(
        matchAddVar(eff({ addVar: { scope: 'global', var: 'pot', delta: { _t: 2, ref: 'gvar', var: 'ante' } } })),
        {
          kind: 'addVar',
          target: { scope: 'global', varName: 'pot' },
          delta: { kind: 'gvar', varName: 'ante' },
        },
      );

      assert.equal(
        matchAddVar(eff({ addVar: { scope: 'global', var: 'pot', delta: { _t: 2, ref: 'zoneVar', zone: 'board', var: 'threat' } } })),
        null,
      );
      assert.equal(
        matchAddVar(eff({ addVar: { scope: 'pvar', player: 'active', var: 'chips', delta: { _t: 6, op: '+', left: 1, right: 2 } } })),
        null,
      );
    });

    it('matches if, forEach players, and gotoPhaseExact', () => {
      const thenEffects: readonly EffectAST[] = [eff({ setVar: { scope: 'global', var: 'pot', value: 1 } })];
      const elseEffects: readonly EffectAST[] = [eff({ addVar: { scope: 'global', var: 'pot', delta: 2 } })];

      assert.deepEqual(
        matchIf(eff({
          if: {
            when: { op: '==', left: { _t: 2, ref: 'gvar', var: 'phase' }, right: 'deal' },
            then: thenEffects,
            else: elseEffects,
          },
        })),
        {
          kind: 'if',
          condition: {
            kind: 'comparison',
            op: '==',
            left: { kind: 'gvar', varName: 'phase' },
            right: { kind: 'literal', value: 'deal' },
          },
          thenEffects,
          elseEffects,
        },
      );

      assert.equal(
        matchIf(eff({
          if: {
            when: { op: 'not', arg: { op: '==', left: 1, right: 1 } },
            then: thenEffects,
          },
        })),
        null,
      );

      assert.deepEqual(
        matchForEachPlayers(eff({
          forEach: {
            bind: 'player',
            over: { query: 'players' },
            effects: thenEffects,
            countBind: 'count',
            in: elseEffects,
          },
        })),
        {
          kind: 'forEachPlayers',
          bind: 'player',
          effects: thenEffects,
          countBind: 'count',
          inEffects: elseEffects,
        },
      );

      assert.equal(
        matchForEachPlayers(eff({
          forEach: {
            bind: 'zone',
            over: { query: 'zones' },
            effects: thenEffects,
          },
        })),
        null,
      );

      assert.deepEqual(matchGotoPhaseExact(eff({ gotoPhaseExact: { phase: 'cleanup' } })), {
        kind: 'gotoPhaseExact',
        phase: 'cleanup',
      });
    });
  });

  describe('classifyEffect', () => {
    it('classifies supported Phase 1 families and rejects unsupported effects', () => {
      assert.equal(classifyEffect(eff({ setVar: { scope: 'global', var: 'pot', value: 0 } }))?.kind, 'setVar');
      assert.equal(classifyEffect(eff({ addVar: { scope: 'global', var: 'pot', delta: 1 } }))?.kind, 'addVar');
      assert.equal(
        classifyEffect(eff({ if: { when: { op: '==', left: 1, right: 1 }, then: [] } }))?.kind,
        'if',
      );
      assert.equal(
        classifyEffect(eff({ forEach: { bind: 'player', over: { query: 'players' }, effects: [] } }))?.kind,
        'forEachPlayers',
      );
      assert.equal(classifyEffect(eff({ gotoPhaseExact: { phase: 'main' } }))?.kind, 'gotoPhaseExact');

      assert.equal(classifyEffect(eff({ chooseOne: { internalDecisionId: 'd1', bind: 'choice', options: { query: 'players' } } })), null);
      assert.equal(classifyEffect(eff({ moveToken: { token: 't1', from: 'deck', to: 'discard' } })), null);
      assert.equal(classifyEffect(eff({ rollRandom: { bind: 'roll', min: 1, max: 6, in: [] } })), null);
    });
  });

  describe('computeCoverageRatio', () => {
    it('returns 1 for an empty sequence', () => {
      assert.equal(computeCoverageRatio([]), 1);
    });

    it('counts nested compilable and non-compilable nodes recursively', () => {
      const effects: readonly EffectAST[] = [
        eff({ setVar: { scope: 'global', var: 'pot', value: 0 } }),
        eff({
          if: {
            when: { op: '==', left: { _t: 2, ref: 'gvar', var: 'phase' }, right: 'deal' },
            then: [
              eff({ addVar: { scope: 'global', var: 'pot', delta: 1 } }),
              eff({ moveToken: { token: 't1', from: 'deck', to: 'board' } }),
            ],
            else: [
              eff({
                forEach: {
                  bind: 'player',
                  over: { query: 'players' },
                  effects: [
                    eff({ gotoPhaseExact: { phase: 'cleanup' } }),
                    eff({ chooseOne: { internalDecisionId: 'd1', bind: 'choice', options: { query: 'players' } } }),
                  ],
                },
              }),
            ],
          },
        }),
      ];

      assert.equal(computeCoverageRatio(effects), 5 / 7);
    });

    it('returns 1 for a fully compilable tree', () => {
      const effects: readonly EffectAST[] = [
        eff({
          forEach: {
            bind: 'player',
            over: { query: 'players' },
            effects: [
              eff({ setVar: { scope: 'pvar', player: 'active', var: 'chips', value: { _t: 2, ref: 'binding', name: 'seat' } } }),
              eff({ addVar: { scope: 'global', var: 'pot', delta: 1 } }),
            ],
            in: [
              eff({ gotoPhaseExact: { phase: 'cleanup' } }),
            ],
          },
        }),
      ];

      assert.equal(computeCoverageRatio(effects), 1);
    });
  });
});
