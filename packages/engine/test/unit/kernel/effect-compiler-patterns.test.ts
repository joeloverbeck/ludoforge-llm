// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ConditionAST, EffectAST, ValueExpr } from '../../../src/kernel/types.js';
import {
  classifyEffect,
  classifyLifecycleEffect,
  computeCoverageRatio,
  isCompilableCondition,
  matchAddVar,
  matchBindValue,
  matchChooseN,
  matchChooseOne,
  matchCompilableCondition,
  matchCreateToken,
  matchDestroyToken,
  matchDraw,
  matchForEach,
  matchFlipGlobalMarker,
  matchGotoPhaseExact,
  matchIf,
  matchLet,
  matchAdvancePhase,
  matchMoveAll,
  matchMoveToken,
  matchMoveTokenAdjacent,
  matchPopInterruptPhase,
  matchConceal,
  matchReduce,
  matchReveal,
  matchRemoveByPriority,
  matchSetActivePlayer,
  matchSetGlobalMarker,
  matchSetMarker,
  matchSetTokenProp,
  matchSetVar,
  matchShuffle,
  matchShiftGlobalMarker,
  matchShiftMarker,
  matchSimpleNumericValue,
  matchSimpleValue,
  matchTransferVar,
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

    it('falls back to generic condition descriptors for unsupported optimized shapes', () => {
      assert.deepEqual(matchCompilableCondition({ op: 'not', arg: true }), {
        kind: 'generic',
        condition: { op: 'not', arg: true },
      });
      assert.deepEqual(matchCompilableCondition({ op: 'in', item: 'a', set: 'abc' }), {
        kind: 'generic',
        condition: { op: 'in', item: 'a', set: 'abc' },
      });
      assert.equal(isCompilableCondition({ op: 'zonePropIncludes', zone: 'x', prop: 'tags', value: 'hot' }), true);
    });
  });

  describe('effect matchers', () => {
    it('matches setVar for global and pvar targets with simple values', () => {
      assert.deepEqual(
        matchSetVar(eff({ setVar: { scope: 'global', var: 'pot', value: 0 } })),
        {
          kind: 'setVar',
          mode: 'optimized',
          target: { scope: 'global', varName: 'pot' },
          value: { kind: 'literal', value: 0 },
        },
      );

      assert.deepEqual(
        matchSetVar(eff({ setVar: { scope: 'pvar', player: 'active', var: 'chips', value: { _t: 2, ref: 'binding', name: 'seat' } } })),
        {
          kind: 'setVar',
          mode: 'optimized',
          target: { scope: 'pvar', player: 'active', varName: 'chips' },
          value: { kind: 'binding', name: 'seat' },
        },
      );
    });

    it('rejects zoneVar and complex setVar payloads', () => {
      assert.deepEqual(
        matchSetVar(eff({ setVar: { scope: 'zoneVar', zone: 'board', var: 'threat', value: 1 } })),
        {
          kind: 'setVar',
          mode: 'delegate',
          payload: { scope: 'zoneVar', zone: 'board', var: 'threat', value: 1 },
        },
      );
      assert.deepEqual(
        matchSetVar(eff({ setVar: { scope: 'global', var: 'pot', value: { _t: 6, op: '+', left: 1, right: 2 } } })),
        {
          kind: 'setVar',
          mode: 'delegate',
          payload: { scope: 'global', var: 'pot', value: { _t: 6, op: '+', left: 1, right: 2 } },
        },
      );
    });

    it('matches numeric addVar and rejects non-compilable deltas', () => {
      assert.deepEqual(
        matchAddVar(eff({ addVar: { scope: 'global', var: 'pot', delta: { _t: 2, ref: 'gvar', var: 'ante' } } })),
        {
          kind: 'addVar',
          mode: 'optimized',
          target: { scope: 'global', varName: 'pot' },
          delta: { kind: 'gvar', varName: 'ante' },
        },
      );

      assert.deepEqual(
        matchAddVar(eff({ addVar: { scope: 'global', var: 'pot', delta: { _t: 2, ref: 'zoneVar', zone: 'board', var: 'threat' } } })),
        {
          kind: 'addVar',
          mode: 'delegate',
          payload: { scope: 'global', var: 'pot', delta: { _t: 2, ref: 'zoneVar', zone: 'board', var: 'threat' } },
        },
      );
      assert.deepEqual(
        matchAddVar(eff({ addVar: { scope: 'pvar', player: 'active', var: 'chips', delta: { _t: 6, op: '+', left: 1, right: 2 } } })),
        {
          kind: 'addVar',
          mode: 'delegate',
          payload: { scope: 'pvar', player: 'active', var: 'chips', delta: { _t: 6, op: '+', left: 1, right: 2 } },
        },
      );
    });

    it('matches if, forEach, gotoPhaseExact, and turn-flow leaves', () => {
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

      assert.deepEqual(
        matchIf(eff({
          if: {
            when: { op: 'not', arg: { op: '==', left: 1, right: 1 } },
            then: thenEffects,
          },
        })),
        {
          kind: 'if',
          condition: {
            kind: 'generic',
            condition: { op: 'not', arg: { op: '==', left: 1, right: 1 } },
          },
          thenEffects,
          elseEffects: [],
        },
      );

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

      assert.deepEqual(
        matchForEach(eff({
          forEach: {
            bind: 'player',
            over: { query: 'players' },
            effects: thenEffects,
            countBind: 'count',
            in: elseEffects,
          },
        })),
        {
          kind: 'forEach',
          bind: 'player',
          over: { query: 'players' },
          effects: thenEffects,
          countBind: 'count',
          inEffects: elseEffects,
        },
      );

      assert.deepEqual(
        matchForEach(eff({
          forEach: {
            bind: 'zone',
            over: { query: 'zones' },
            effects: thenEffects,
          },
        })),
        {
          kind: 'forEach',
          bind: 'zone',
          over: { query: 'zones' },
          effects: thenEffects,
        },
      );

      assert.deepEqual(matchGotoPhaseExact(eff({ gotoPhaseExact: { phase: 'cleanup' } })), {
        kind: 'gotoPhaseExact',
        phase: 'cleanup',
      });

      assert.deepEqual(matchSetActivePlayer(eff({ setActivePlayer: { player: 'active' } })), {
        kind: 'setActivePlayer',
        player: 'active',
      });

      assert.deepEqual(matchAdvancePhase(eff({ advancePhase: {} })), {
        kind: 'advancePhase',
      });

      assert.deepEqual(matchPopInterruptPhase(eff({ popInterruptPhase: {} })), {
        kind: 'popInterruptPhase',
      });
    });

    it('matches bindValue, transferVar, let, reduce, removeByPriority, and marker effects without narrowing away full payload support', () => {
      assert.deepEqual(
        matchBindValue(eff({ bindValue: { bind: '$sum', value: { _t: 6, op: '+', left: 1, right: 2 } } })),
        {
          kind: 'bindValue',
          bind: '$sum',
          value: { _t: 6, op: '+', left: 1, right: 2 },
        },
      );

      assert.deepEqual(
        matchTransferVar(eff({
          transferVar: {
            from: { scope: 'global', var: 'bank' },
            to: { scope: 'pvar', player: 'active', var: 'chips' },
            amount: { _t: 6, op: '+', left: 1, right: 2 },
            min: 1,
            max: 2,
            actualBind: '$actual',
          },
        })),
        {
          kind: 'transferVar',
          payload: {
            from: { scope: 'global', var: 'bank' },
            to: { scope: 'pvar', player: 'active', var: 'chips' },
            amount: { _t: 6, op: '+', left: 1, right: 2 },
            min: 1,
            max: 2,
            actualBind: '$actual',
          },
        },
      );

      const inEffects: readonly EffectAST[] = [eff({ bindValue: { bind: '$visible', value: 1 } })];
      assert.deepEqual(
        matchLet(eff({ let: { bind: 'tmp', value: { _t: 6, op: '+', left: 1, right: 2 }, in: inEffects } })),
        {
          kind: 'let',
          bind: 'tmp',
          value: { _t: 6, op: '+', left: 1, right: 2 },
          inEffects,
        },
      );

      assert.deepEqual(
        matchReduce(eff({
          reduce: {
            itemBind: '$item',
            accBind: '$acc',
            over: { query: 'zones' },
            initial: 0,
            next: { _t: 6, op: '+', left: { _t: 2, ref: 'binding', name: '$acc' }, right: 1 },
            resultBind: '$result',
            in: inEffects,
          },
        })),
        {
          kind: 'reduce',
          payload: {
            itemBind: '$item',
            accBind: '$acc',
            over: { query: 'zones' },
            initial: 0,
            next: { _t: 6, op: '+', left: { _t: 2, ref: 'binding', name: '$acc' }, right: 1 },
            resultBind: '$result',
            in: inEffects,
          },
        },
      );

      assert.deepEqual(
        matchRemoveByPriority(eff({
          removeByPriority: {
            budget: 2,
            groups: [
              {
                bind: '$token',
                over: { query: 'tokensInZone', zone: 'city:none' },
                to: 'discard:none',
                countBind: '$removed',
              },
            ],
            remainingBind: '$remaining',
            in: inEffects,
          },
        })),
        {
          kind: 'removeByPriority',
          payload: {
            budget: 2,
            groups: [
              {
                bind: '$token',
                over: { query: 'tokensInZone', zone: 'city:none' },
                to: 'discard:none',
                countBind: '$removed',
              },
            ],
            remainingBind: '$remaining',
            in: inEffects,
          },
        },
      );

      assert.deepEqual(
        matchSetMarker(eff({ setMarker: { space: 'city:none', marker: 'supportOpposition', state: 'activeSupport' } })),
        {
          kind: 'setMarker',
          payload: { space: 'city:none', marker: 'supportOpposition', state: 'activeSupport' },
        },
      );

      assert.deepEqual(
        matchShiftMarker(eff({ shiftMarker: { space: 'city:none', marker: 'supportOpposition', delta: 1 } })),
        {
          kind: 'shiftMarker',
          payload: { space: 'city:none', marker: 'supportOpposition', delta: 1 },
        },
      );

      assert.deepEqual(
        matchSetGlobalMarker(eff({ setGlobalMarker: { marker: 'leaderFlipped', state: 'yes' } })),
        {
          kind: 'setGlobalMarker',
          payload: { marker: 'leaderFlipped', state: 'yes' },
        },
      );

      assert.deepEqual(
        matchFlipGlobalMarker(eff({
          flipGlobalMarker: {
            marker: { _t: 2, ref: 'binding', name: '$marker' },
            stateA: { _t: 2, ref: 'binding', name: '$stateA' },
            stateB: { _t: 2, ref: 'binding', name: '$stateB' },
          },
        })),
        {
          kind: 'flipGlobalMarker',
          payload: {
            marker: { _t: 2, ref: 'binding', name: '$marker' },
            stateA: { _t: 2, ref: 'binding', name: '$stateA' },
            stateB: { _t: 2, ref: 'binding', name: '$stateB' },
          },
        },
      );

      assert.deepEqual(
        matchShiftGlobalMarker(eff({ shiftGlobalMarker: { marker: 'momentum', delta: -1 } })),
        {
          kind: 'shiftGlobalMarker',
          payload: { marker: 'momentum', delta: -1 },
        },
      );

      assert.deepEqual(
        matchMoveToken(eff({ moveToken: { token: '$token', from: 'deck', to: 'hand', position: 'random' } })),
        {
          kind: 'moveToken',
          payload: { token: '$token', from: 'deck', to: 'hand', position: 'random' },
        },
      );

      assert.deepEqual(
        matchMoveAll(eff({ moveAll: { from: 'deck', to: 'discard', filter: { op: '==', left: { _t: 2, ref: 'binding', name: '$token' }, right: { _t: 2, ref: 'binding', name: '$token' } } } })),
        {
          kind: 'moveAll',
          payload: { from: 'deck', to: 'discard', filter: { op: '==', left: { _t: 2, ref: 'binding', name: '$token' }, right: { _t: 2, ref: 'binding', name: '$token' } } },
        },
      );

      assert.deepEqual(
        matchMoveTokenAdjacent(eff({ moveTokenAdjacent: { token: '$token', from: 'city:none', direction: '$to' } })),
        {
          kind: 'moveTokenAdjacent',
          payload: { token: '$token', from: 'city:none', direction: '$to' },
        },
      );

      assert.deepEqual(
        matchDraw(eff({ draw: { from: 'deck', to: 'hand', count: 2 } })),
        {
          kind: 'draw',
          payload: { from: 'deck', to: 'hand', count: 2 },
        },
      );

      assert.deepEqual(matchShuffle(eff({ shuffle: { zone: 'deck' } })), {
        kind: 'shuffle',
        payload: { zone: 'deck' },
      });

      assert.deepEqual(
        matchCreateToken(eff({ createToken: { type: 'card', zone: 'deck', props: { rank: 'A' } } })),
        {
          kind: 'createToken',
          payload: { type: 'card', zone: 'deck', props: { rank: 'A' } },
        },
      );

      assert.deepEqual(
        matchDestroyToken(eff({ destroyToken: { token: '$token' } })),
        {
          kind: 'destroyToken',
          payload: { token: '$token' },
        },
      );

      assert.deepEqual(
        matchSetTokenProp(eff({ setTokenProp: { token: '$token', prop: 'face', value: 'up' } })),
        {
          kind: 'setTokenProp',
          payload: { token: '$token', prop: 'face', value: 'up' },
        },
      );
    });

    it('matches chooseOne and chooseN as payload-backed descriptors', () => {
      assert.deepEqual(
        matchChooseOne(eff({
          chooseOne: {
            internalDecisionId: 'decision:$choice',
            bind: '$choice',
            options: { query: 'players' },
          },
        })),
        {
          kind: 'chooseOne',
          payload: {
            internalDecisionId: 'decision:$choice',
            bind: '$choice',
            options: { query: 'players' },
          },
        },
      );

      assert.deepEqual(
        matchChooseN(eff({
          chooseN: {
            internalDecisionId: 'decision:$picks',
            bind: '$picks',
            options: { query: 'players' },
            min: 0,
            max: 2,
          },
        })),
        {
          kind: 'chooseN',
          payload: {
            internalDecisionId: 'decision:$picks',
            bind: '$picks',
            options: { query: 'players' },
            min: 0,
            max: 2,
          },
        },
      );
    });
  });

  describe('classifyEffect', () => {
    it('classifies compiled families and rejects unsupported effects', () => {
      assert.equal(classifyEffect(eff({ setVar: { scope: 'global', var: 'pot', value: 0 } }))?.kind, 'setVar');
      assert.equal(classifyEffect(eff({ addVar: { scope: 'global', var: 'pot', delta: 1 } }))?.kind, 'addVar');
      assert.equal(
        classifyEffect(eff({ if: { when: { op: '==', left: 1, right: 1 }, then: [] } }))?.kind,
        'if',
      );
      assert.equal(
        classifyEffect(eff({ forEach: { bind: 'player', over: { query: 'players' }, effects: [] } }))?.kind,
        'forEach',
      );
      assert.equal(
        classifyEffect(eff({ reduce: { itemBind: 'x', accBind: 'acc', over: { query: 'players' }, initial: 0, next: 0, resultBind: 'r', in: [] } }))?.kind,
        'reduce',
      );
      assert.equal(
        classifyEffect(eff({ removeByPriority: { budget: 1, groups: [] } }))?.kind,
        'removeByPriority',
      );
      assert.equal(classifyEffect(eff({ gotoPhaseExact: { phase: 'main' } }))?.kind, 'gotoPhaseExact');
      assert.equal(classifyEffect(eff({ setActivePlayer: { player: 'active' } }))?.kind, 'setActivePlayer');
      assert.equal(classifyEffect(eff({ advancePhase: {} }))?.kind, 'advancePhase');
      assert.equal(classifyEffect(eff({ pushInterruptPhase: { phase: 'int', resumePhase: 'main' } }))?.kind, 'pushInterruptPhase');
      assert.equal(classifyEffect(eff({ popInterruptPhase: {} }))?.kind, 'popInterruptPhase');
      assert.equal(classifyEffect(eff({ rollRandom: { bind: 'roll', min: 1, max: 6, in: [] } }))?.kind, 'rollRandom');
      assert.equal(classifyEffect(eff({ bindValue: { bind: '$x', value: { _t: 6, op: '+', left: 1, right: 2 } } }))?.kind, 'bindValue');
      assert.equal(classifyEffect(eff({ transferVar: { from: { scope: 'global', var: 'a' }, to: { scope: 'global', var: 'b' }, amount: 1 } }))?.kind, 'transferVar');
      assert.equal(classifyEffect(eff({ let: { bind: 'x', value: { _t: 6, op: '+', left: 1, right: 2 }, in: [] } }))?.kind, 'let');
      assert.equal(classifyEffect(eff({ evaluateSubset: { source: { query: 'players' }, subsetSize: 2, subsetBind: 's', compute: [], scoreExpr: 0, resultBind: 'r', in: [] } }))?.kind, 'evaluateSubset');
      assert.equal(classifyEffect(eff({ setMarker: { space: 'city:none', marker: 'supportOpposition', state: 'activeSupport' } }))?.kind, 'setMarker');
      assert.equal(classifyEffect(eff({ shiftMarker: { space: 'city:none', marker: 'supportOpposition', delta: 1 } }))?.kind, 'shiftMarker');
      assert.equal(classifyEffect(eff({ setGlobalMarker: { marker: 'leaderFlipped', state: 'yes' } }))?.kind, 'setGlobalMarker');
      assert.equal(classifyEffect(eff({ flipGlobalMarker: { marker: 'leaderFlipped', stateA: 'no', stateB: 'yes' } }))?.kind, 'flipGlobalMarker');
      assert.equal(classifyEffect(eff({ shiftGlobalMarker: { marker: 'momentum', delta: -1 } }))?.kind, 'shiftGlobalMarker');

      assert.equal(classifyEffect(eff({ chooseOne: { internalDecisionId: 'd1', bind: 'choice', options: { query: 'players' } } }))?.kind, 'chooseOne');
      assert.equal(classifyEffect(eff({ chooseN: { internalDecisionId: 'd1', bind: 'choice', options: { query: 'players' }, n: 2 } }))?.kind, 'chooseN');
      assert.equal(classifyEffect(eff({ moveToken: { token: '$token', from: 'deck', to: 'discard' } }))?.kind, 'moveToken');
    });

    it('returns correct PatternDescriptor for each compiled _k tag', () => {
      const setVarDesc = classifyEffect(eff({ setVar: { scope: 'global', var: 'pot', value: 0 } }));
      assert.equal(setVarDesc?.kind, 'setVar');

      const addVarDesc = classifyEffect(eff({ addVar: { scope: 'global', var: 'pot', delta: 1 } }));
      assert.equal(addVarDesc?.kind, 'addVar');

      const ifDesc = classifyEffect(eff({
        if: { when: { op: '==', left: 1, right: 1 }, then: [], else: [] },
      }));
      assert.equal(ifDesc?.kind, 'if');

      const forEachDesc = classifyEffect(eff({
        forEach: { bind: 'p', over: { query: 'players' }, effects: [] },
      }));
      assert.equal(forEachDesc?.kind, 'forEach');

      const reduceDesc = classifyEffect(eff({
        reduce: { itemBind: 'x', accBind: 'acc', over: { query: 'players' }, initial: 0, next: 0, resultBind: 'r', in: [] },
      }));
      assert.equal(reduceDesc?.kind, 'reduce');

      const removeByPriorityDesc = classifyEffect(eff({
        removeByPriority: { budget: 1, groups: [] },
      }));
      assert.equal(removeByPriorityDesc?.kind, 'removeByPriority');

      const gotoDesc = classifyEffect(eff({ gotoPhaseExact: { phase: 'end' } }));
      assert.equal(gotoDesc?.kind, 'gotoPhaseExact');

      const setActivePlayerDesc = classifyEffect(eff({ setActivePlayer: { player: 'active' } }));
      assert.equal(setActivePlayerDesc?.kind, 'setActivePlayer');

      const advancePhaseDesc = classifyEffect(eff({ advancePhase: {} }));
      assert.equal(advancePhaseDesc?.kind, 'advancePhase');

      const pushInterruptPhaseDesc = classifyEffect(eff({ pushInterruptPhase: { phase: 'int', resumePhase: 'main' } }));
      assert.equal(pushInterruptPhaseDesc?.kind, 'pushInterruptPhase');

      const popInterruptPhaseDesc = classifyEffect(eff({ popInterruptPhase: {} }));
      assert.equal(popInterruptPhaseDesc?.kind, 'popInterruptPhase');

      const rollRandomDesc = classifyEffect(eff({ rollRandom: { bind: 'roll', min: 1, max: 6, in: [] } }));
      assert.equal(rollRandomDesc?.kind, 'rollRandom');

      const chooseOneDesc = classifyEffect(eff({ chooseOne: { internalDecisionId: 'd1', bind: 'c', options: { query: 'players' } } }));
      assert.equal(chooseOneDesc?.kind, 'chooseOne');

      const chooseNDesc = classifyEffect(eff({ chooseN: { internalDecisionId: 'd1', bind: 'c', options: { query: 'players' }, n: 2 } }));
      assert.equal(chooseNDesc?.kind, 'chooseN');

      const bindValueDesc = classifyEffect(eff({ bindValue: { bind: '$x', value: { _t: 6, op: '+', left: 1, right: 2 } } }));
      assert.equal(bindValueDesc?.kind, 'bindValue');

      const transferVarDesc = classifyEffect(eff({ transferVar: { from: { scope: 'global', var: 'a' }, to: { scope: 'global', var: 'b' }, amount: 1 } }));
      assert.equal(transferVarDesc?.kind, 'transferVar');

      const letDesc = classifyEffect(eff({ let: { bind: 'x', value: { _t: 6, op: '+', left: 1, right: 2 }, in: [] } }));
      assert.equal(letDesc?.kind, 'let');

      const evaluateSubsetDesc = classifyEffect(eff({ evaluateSubset: { source: { query: 'players' }, subsetSize: 2, subsetBind: 's', compute: [], scoreExpr: 0, resultBind: 'r', in: [] } }));
      assert.equal(evaluateSubsetDesc?.kind, 'evaluateSubset');

      const setMarkerDesc = classifyEffect(eff({ setMarker: { space: 'city:none', marker: 'supportOpposition', state: 'activeSupport' } }));
      assert.equal(setMarkerDesc?.kind, 'setMarker');

      const shiftMarkerDesc = classifyEffect(eff({ shiftMarker: { space: 'city:none', marker: 'supportOpposition', delta: 1 } }));
      assert.equal(shiftMarkerDesc?.kind, 'shiftMarker');

      const setGlobalMarkerDesc = classifyEffect(eff({ setGlobalMarker: { marker: 'leaderFlipped', state: 'yes' } }));
      assert.equal(setGlobalMarkerDesc?.kind, 'setGlobalMarker');

      const flipGlobalMarkerDesc = classifyEffect(eff({ flipGlobalMarker: { marker: 'leaderFlipped', stateA: 'no', stateB: 'yes' } }));
      assert.equal(flipGlobalMarkerDesc?.kind, 'flipGlobalMarker');

      const shiftGlobalMarkerDesc = classifyEffect(eff({ shiftGlobalMarker: { marker: 'momentum', delta: -1 } }));
      assert.equal(shiftGlobalMarkerDesc?.kind, 'shiftGlobalMarker');

      const moveTokenDesc = classifyEffect(eff({ moveToken: { token: '$token', from: 'deck', to: 'hand' } }));
      assert.equal(moveTokenDesc?.kind, 'moveToken');

      const moveAllDesc = classifyEffect(eff({ moveAll: { from: 'deck', to: 'discard' } }));
      assert.equal(moveAllDesc?.kind, 'moveAll');

      const moveTokenAdjacentDesc = classifyEffect(eff({ moveTokenAdjacent: { token: '$token', from: 'city:none', direction: '$to' } }));
      assert.equal(moveTokenAdjacentDesc?.kind, 'moveTokenAdjacent');

      const drawDesc = classifyEffect(eff({ draw: { from: 'deck', to: 'hand', count: 1 } }));
      assert.equal(drawDesc?.kind, 'draw');

      const shuffleDesc = classifyEffect(eff({ shuffle: { zone: 'deck' } }));
      assert.equal(shuffleDesc?.kind, 'shuffle');

      const createTokenDesc = classifyEffect(eff({ createToken: { type: 'card', zone: 'deck' } }));
      assert.equal(createTokenDesc?.kind, 'createToken');

      const destroyTokenDesc = classifyEffect(eff({ destroyToken: { token: '$token' } }));
      assert.equal(destroyTokenDesc?.kind, 'destroyToken');

      const setTokenPropDesc = classifyEffect(eff({ setTokenProp: { token: '$token', prop: 'face', value: 'up' } }));
      assert.equal(setTokenPropDesc?.kind, 'setTokenProp');

      const revealDesc = classifyEffect(eff({ reveal: { zone: 'hand', to: 'all' } }));
      assert.equal(revealDesc?.kind, 'reveal');

      const concealDesc = classifyEffect(eff({ conceal: { zone: 'hand' } }));
      assert.equal(concealDesc?.kind, 'conceal');
    });

    it('returns null for grantFreeOperation (deferred)', () => {
      const node = eff({
        grantFreeOperation: {
          seat: 'NVA',
          operationClass: 'operation' as const,
          actionIds: ['march'],
        },
      });
      assert.equal(classifyEffect(node), null);
    });

    it('throws for grantFreeOperation in lifecycle compilation', () => {
      const node = eff({
        grantFreeOperation: {
          seat: 'NVA',
          operationClass: 'operation' as const,
          actionIds: ['march'],
        },
      });

      assert.throws(
        () => classifyLifecycleEffect(node),
        /grantFreeOperation is an action-context effect and must not appear in lifecycle effect sequences/,
      );
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
              eff({ moveToken: { token: '$token', from: 'deck', to: 'board' } }),
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

      assert.equal(computeCoverageRatio(effects), 1);
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

    it('counts compiled turn-flow leaves in coverage ratios', () => {
      const effects: readonly EffectAST[] = [
        eff({ setActivePlayer: { player: 'active' } }),
        eff({ advancePhase: {} }),
        eff({ pushInterruptPhase: { phase: 'int', resumePhase: 'main' } }),
        eff({ popInterruptPhase: {} }),
        eff({ moveToken: { token: 't1', from: 'z1', to: 'z2' } }),
      ];

      assert.equal(computeCoverageRatio(effects), 1);
    });

    it('traverses let.in bodies via walkEffects', () => {
      const effects: readonly EffectAST[] = [
        eff({
          let: {
            bind: 'x',
            value: 1,
            in: [
              eff({ setVar: { scope: 'global', var: 'pot', value: 0 } }),
              eff({ moveToken: { token: 't1', from: 'z1', to: 'z2' } }),
            ],
          },
        }),
      ];
      // 3 nodes: let + setVar + moveToken are all compiled.
      assert.equal(computeCoverageRatio(effects), 1);
    });

    it('traverses reduce.in bodies via walkEffects', () => {
      const effects: readonly EffectAST[] = [
        eff({
          reduce: {
            itemBind: 'x',
            accBind: 'acc',
            over: { query: 'players' },
            initial: 0,
            next: 0,
            resultBind: 'r',
            in: [
              eff({ addVar: { scope: 'global', var: 'pot', delta: 1 } }),
            ],
          },
        }),
      ];
      // 2 nodes: reduce + addVar are both compiled.
      assert.equal(computeCoverageRatio(effects), 1);
    });

    it('traverses rollRandom.in bodies via walkEffects', () => {
      const effects: readonly EffectAST[] = [
        eff({
          rollRandom: {
            bind: 'roll',
            min: 1,
            max: 6,
            in: [
              eff({ setVar: { scope: 'global', var: 'result', value: 0 } }),
            ],
          },
        }),
      ];
      assert.equal(computeCoverageRatio(effects), 1);
    });

    it('traverses evaluateSubset.compute and evaluateSubset.in bodies via walkEffects', () => {
      const effects: readonly EffectAST[] = [
        eff({
          evaluateSubset: {
            source: { query: 'players' },
            subsetSize: 2,
            subsetBind: 's',
            compute: [
              eff({ addVar: { scope: 'global', var: 'score', delta: 1 } }),
            ],
            scoreExpr: 0,
            resultBind: 'r',
            in: [
              eff({ setVar: { scope: 'global', var: 'best', value: 0 } }),
            ],
          },
        }),
      ];
      assert.equal(computeCoverageRatio(effects), 1);
    });

    it('traverses removeByPriority.in bodies via walkEffects', () => {
      const effects: readonly EffectAST[] = [
        eff({
          removeByPriority: {
            budget: 3,
            groups: [],
            in: [
              eff({ gotoPhaseExact: { phase: 'cleanup' } }),
            ],
          },
        }),
      ];
      // 2 nodes: removeByPriority + gotoPhaseExact are both compiled.
      assert.equal(computeCoverageRatio(effects), 1);
    });

    it('counts reveal and conceal as compiled leaf effects', () => {
      const effects: readonly EffectAST[] = [
        eff({ reveal: { zone: 'hand', to: 'all' } }),
        eff({ conceal: { zone: 'hand' } }),
      ];

      assert.equal(computeCoverageRatio(effects), 1);
    });
  });

  describe('information-effect matchers', () => {
    it('matches reveal and conceal payloads verbatim', () => {
      const revealNode = eff({
        reveal: {
          zone: 'hand:none',
          to: { chosen: '$seat' },
          filter: { op: 'and', args: [{ prop: 'faction', op: 'eq', value: 'US' }] },
        },
      });
      const concealNode = eff({
        conceal: {
          zone: 'hand:none',
          from: 'all',
          filter: { op: 'and', args: [{ prop: 'rank', op: 'eq', value: 'A' }] },
        },
      });

      assert.ok('reveal' in revealNode);
      assert.deepEqual(matchReveal(revealNode), {
        kind: 'reveal',
        payload: revealNode.reveal,
      });
      assert.ok('conceal' in concealNode);
      assert.deepEqual(matchConceal(concealNode), {
        kind: 'conceal',
        payload: concealNode.conceal,
      });
    });
  });
});
