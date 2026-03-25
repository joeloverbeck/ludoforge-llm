import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ConditionAST, EffectAST, ValueExpr } from '../../../src/kernel/types.js';
import {
  classifyEffect,
  computeCoverageRatio,
  isCompilableCondition,
  matchAddVar,
  matchBindValue,
  matchCompilableCondition,
  matchCreateToken,
  matchDestroyToken,
  matchDraw,
  matchForEachPlayers,
  matchFlipGlobalMarker,
  matchGotoPhaseExact,
  matchIf,
  matchLet,
  matchAdvancePhase,
  matchMoveAll,
  matchMoveToken,
  matchMoveTokenAdjacent,
  matchPopInterruptPhase,
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

    it('matches if, forEach players, gotoPhaseExact, and turn-flow leaves', () => {
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

    it('matches bindValue, transferVar, let, and marker effects without narrowing away full payload support', () => {
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
        'forEachPlayers',
      );
      assert.equal(classifyEffect(eff({ gotoPhaseExact: { phase: 'main' } }))?.kind, 'gotoPhaseExact');
      assert.equal(classifyEffect(eff({ setActivePlayer: { player: 'active' } }))?.kind, 'setActivePlayer');
      assert.equal(classifyEffect(eff({ advancePhase: {} }))?.kind, 'advancePhase');
      assert.equal(classifyEffect(eff({ popInterruptPhase: {} }))?.kind, 'popInterruptPhase');
      assert.equal(classifyEffect(eff({ bindValue: { bind: '$x', value: { _t: 6, op: '+', left: 1, right: 2 } } }))?.kind, 'bindValue');
      assert.equal(classifyEffect(eff({ transferVar: { from: { scope: 'global', var: 'a' }, to: { scope: 'global', var: 'b' }, amount: 1 } }))?.kind, 'transferVar');
      assert.equal(classifyEffect(eff({ let: { bind: 'x', value: { _t: 6, op: '+', left: 1, right: 2 }, in: [] } }))?.kind, 'let');
      assert.equal(classifyEffect(eff({ setMarker: { space: 'city:none', marker: 'supportOpposition', state: 'activeSupport' } }))?.kind, 'setMarker');
      assert.equal(classifyEffect(eff({ shiftMarker: { space: 'city:none', marker: 'supportOpposition', delta: 1 } }))?.kind, 'shiftMarker');
      assert.equal(classifyEffect(eff({ setGlobalMarker: { marker: 'leaderFlipped', state: 'yes' } }))?.kind, 'setGlobalMarker');
      assert.equal(classifyEffect(eff({ flipGlobalMarker: { marker: 'leaderFlipped', stateA: 'no', stateB: 'yes' } }))?.kind, 'flipGlobalMarker');
      assert.equal(classifyEffect(eff({ shiftGlobalMarker: { marker: 'momentum', delta: -1 } }))?.kind, 'shiftGlobalMarker');

      assert.equal(classifyEffect(eff({ chooseOne: { internalDecisionId: 'd1', bind: 'choice', options: { query: 'players' } } })), null);
      assert.equal(classifyEffect(eff({ moveToken: { token: '$token', from: 'deck', to: 'discard' } }))?.kind, 'moveToken');
      assert.equal(classifyEffect(eff({ rollRandom: { bind: 'roll', min: 1, max: 6, in: [] } })), null);
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
      assert.equal(forEachDesc?.kind, 'forEachPlayers');

      const gotoDesc = classifyEffect(eff({ gotoPhaseExact: { phase: 'end' } }));
      assert.equal(gotoDesc?.kind, 'gotoPhaseExact');

      const setActivePlayerDesc = classifyEffect(eff({ setActivePlayer: { player: 'active' } }));
      assert.equal(setActivePlayerDesc?.kind, 'setActivePlayer');

      const advancePhaseDesc = classifyEffect(eff({ advancePhase: {} }));
      assert.equal(advancePhaseDesc?.kind, 'advancePhase');

      const popInterruptPhaseDesc = classifyEffect(eff({ popInterruptPhase: {} }));
      assert.equal(popInterruptPhaseDesc?.kind, 'popInterruptPhase');

      const bindValueDesc = classifyEffect(eff({ bindValue: { bind: '$x', value: { _t: 6, op: '+', left: 1, right: 2 } } }));
      assert.equal(bindValueDesc?.kind, 'bindValue');

      const transferVarDesc = classifyEffect(eff({ transferVar: { from: { scope: 'global', var: 'a' }, to: { scope: 'global', var: 'b' }, amount: 1 } }));
      assert.equal(transferVarDesc?.kind, 'transferVar');

      const letDesc = classifyEffect(eff({ let: { bind: 'x', value: { _t: 6, op: '+', left: 1, right: 2 }, in: [] } }));
      assert.equal(letDesc?.kind, 'let');

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
    });

    it('returns null for every remaining not-yet-compiled _k tag', () => {
      const stubTags: Array<{ tag: string; node: EffectAST }> = [
        { tag: 'reveal', node: eff({ reveal: { zone: 'hand', to: 'all' } }) },
        { tag: 'conceal', node: eff({ conceal: { zone: 'hand' } }) },
        { tag: 'reduce', node: eff({ reduce: { itemBind: 'x', accBind: 'acc', over: { query: 'players' }, initial: 0, next: 0, resultBind: 'r', in: [] } }) },
        { tag: 'removeByPriority', node: eff({ removeByPriority: { budget: 1, groups: [] } }) },
        { tag: 'rollRandom', node: eff({ rollRandom: { bind: 'roll', min: 1, max: 6, in: [] } }) },
        { tag: 'pushInterruptPhase', node: eff({ pushInterruptPhase: { phase: 'int', resumePhase: 'main' } }) },
        { tag: 'evaluateSubset', node: eff({ evaluateSubset: { source: { query: 'players' }, subsetSize: 2, subsetBind: 's', compute: [], scoreExpr: 0, resultBind: 'r', in: [] } }) },
        { tag: 'chooseOne', node: eff({ chooseOne: { internalDecisionId: 'd1', bind: 'c', options: { query: 'players' } } }) },
        { tag: 'chooseN', node: eff({ chooseN: { internalDecisionId: 'd1', bind: 'c', options: { query: 'players' }, n: 2 } }) },
      ];

      for (const { tag, node } of stubTags) {
        assert.equal(classifyEffect(node), null, `expected null for not-yet-compiled tag: ${tag}`);
      }
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

      assert.equal(computeCoverageRatio(effects), 6 / 7);
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
      // 2 nodes: reduce (not compiled) + addVar (compiled) = 1/2
      assert.equal(computeCoverageRatio(effects), 1 / 2);
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
      // 2 nodes: rollRandom (not compiled) + setVar (compiled) = 1/2
      assert.equal(computeCoverageRatio(effects), 1 / 2);
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
      // 3 nodes: evaluateSubset (not compiled) + addVar (compiled) + setVar (compiled) = 2/3
      assert.equal(computeCoverageRatio(effects), 2 / 3);
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
      // 2 nodes: removeByPriority (not compiled) + gotoPhaseExact (compiled) = 1/2
      assert.equal(computeCoverageRatio(effects), 1 / 2);
    });
  });
});
