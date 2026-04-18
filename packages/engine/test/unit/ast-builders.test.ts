// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { effectKindOf } from '../../src/kernel/effect-registry.js';
import { eff } from '../helpers/effect-tag-helper.js';
import {
  buildEffect,
  setVar,
  setActivePlayer,
  addVar,
  transferVar,
  moveToken,
  moveAll,
  moveTokenAdjacent,
  draw,
  reveal,
  conceal,
  shuffle,
  createToken,
  destroyToken,
  setTokenProp,
  ifEffect,
  forEach,
  reduce,
  removeByPriority,
  letEffect,
  bindValue,
  evaluateSubset,
  chooseOne,
  chooseN,
  rollRandom,
  setMarker,
  shiftMarker,
  setGlobalMarker,
  flipGlobalMarker,
  shiftGlobalMarker,
  grantFreeOperation,
  gotoPhaseExact,
  advancePhase,
  pushInterruptPhase,
  popInterruptPhase,
} from '../../src/kernel/ast-builders.js';
import type { EffectKind } from '../../src/kernel/types-ast.js';

describe('ast-builders', () => {
  describe('buildEffect generic', () => {
    it('produces correct tagged shape for setVar', () => {
      const effect = buildEffect('setVar', { scope: 'global', var: 'x', value: 1 });
      assert.deepEqual(effect, eff({ setVar: { scope: 'global', var: 'x', value: 1 } }));
    });

    it('produces correct tagged shape for advancePhase', () => {
      const effect = buildEffect('advancePhase', {});
      assert.deepEqual(effect, eff({ advancePhase: {} }));
    });
  });

  describe('named builders produce correct shapes', () => {
    const cases: readonly { name: string; effect: unknown; expectedKind: EffectKind }[] = [
      { name: 'setVar', effect: setVar({ scope: 'global', var: 'x', value: 1 }), expectedKind: 'setVar' },
      { name: 'setActivePlayer', effect: setActivePlayer({ player: 'active' }), expectedKind: 'setActivePlayer' },
      { name: 'addVar', effect: addVar({ scope: 'global', var: 'x', delta: 1 }), expectedKind: 'addVar' },
      { name: 'transferVar', effect: transferVar({ from: { scope: 'global', var: 'a' }, to: { scope: 'global', var: 'b' }, amount: 1 }), expectedKind: 'transferVar' },
      { name: 'moveToken', effect: moveToken({ token: '$t', from: 'hand:0', to: 'discard:none' }), expectedKind: 'moveToken' },
      { name: 'moveAll', effect: moveAll({ from: 'hand:0', to: 'discard:none' }), expectedKind: 'moveAll' },
      { name: 'moveTokenAdjacent', effect: moveTokenAdjacent({ token: '$t', from: 'board:none' }), expectedKind: 'moveTokenAdjacent' },
      { name: 'draw', effect: draw({ from: 'deck:none', to: 'hand:0', count: 2 }), expectedKind: 'draw' },
      { name: 'reveal', effect: reveal({ zone: 'hand:0', to: 'all' }), expectedKind: 'reveal' },
      { name: 'conceal', effect: conceal({ zone: 'hand:0' }), expectedKind: 'conceal' },
      { name: 'shuffle', effect: shuffle({ zone: 'deck:none' }), expectedKind: 'shuffle' },
      { name: 'createToken', effect: createToken({ type: 'card', zone: 'deck:none' }), expectedKind: 'createToken' },
      { name: 'destroyToken', effect: destroyToken({ token: '$t' }), expectedKind: 'destroyToken' },
      { name: 'setTokenProp', effect: setTokenProp({ token: '$t', prop: 'vp', value: 5 }), expectedKind: 'setTokenProp' },
      { name: 'ifEffect', effect: ifEffect({ when: true, then: [] }), expectedKind: 'if' },
      { name: 'forEach', effect: forEach({ bind: '$t', over: { query: 'tokensInZone', zone: 'deck:none' }, effects: [] }), expectedKind: 'forEach' },
      { name: 'reduce', effect: reduce({ itemBind: '$t', accBind: '$acc', over: { query: 'tokensInZone', zone: 'deck:none' }, initial: 0, next: 0, resultBind: '$r', in: [] }), expectedKind: 'reduce' },
      { name: 'removeByPriority', effect: removeByPriority({ budget: 1, groups: [] }), expectedKind: 'removeByPriority' },
      { name: 'letEffect', effect: letEffect({ bind: '$x', value: 1, in: [] }), expectedKind: 'let' },
      { name: 'bindValue', effect: bindValue({ bind: '$x', value: 1 }), expectedKind: 'bindValue' },
      { name: 'evaluateSubset', effect: evaluateSubset({ source: { query: 'tokensInZone', zone: 'deck:none' }, subsetSize: 1, subsetBind: '$s', compute: [], scoreExpr: 0, resultBind: '$r', in: [] }), expectedKind: 'evaluateSubset' },
      { name: 'chooseOne', effect: chooseOne({ internalDecisionId: 'c1', bind: '$c', options: { query: 'tokensInZone', zone: 'deck:none' } }), expectedKind: 'chooseOne' },
      { name: 'chooseN', effect: chooseN({ internalDecisionId: 'cn', bind: '$c', options: { query: 'tokensInZone', zone: 'deck:none' }, n: 2 }), expectedKind: 'chooseN' },
      { name: 'rollRandom', effect: rollRandom({ bind: '$r', min: 1, max: 6, in: [] }), expectedKind: 'rollRandom' },
      { name: 'setMarker', effect: setMarker({ space: 'alpha:none', marker: 'support', state: 'active' }), expectedKind: 'setMarker' },
      { name: 'shiftMarker', effect: shiftMarker({ space: 'alpha:none', marker: 'support', delta: 1 }), expectedKind: 'shiftMarker' },
      { name: 'setGlobalMarker', effect: setGlobalMarker({ marker: 'monsoon', state: 'on' }), expectedKind: 'setGlobalMarker' },
      { name: 'flipGlobalMarker', effect: flipGlobalMarker({ marker: 'monsoon', stateA: 'on', stateB: 'off' }), expectedKind: 'flipGlobalMarker' },
      { name: 'shiftGlobalMarker', effect: shiftGlobalMarker({ marker: 'round', delta: 1 }), expectedKind: 'shiftGlobalMarker' },
      { name: 'grantFreeOperation', effect: grantFreeOperation({ seat: 'p0', operationClass: 'limitedOperation' }), expectedKind: 'grantFreeOperation' },
      { name: 'gotoPhaseExact', effect: gotoPhaseExact({ phase: 'cleanup' }), expectedKind: 'gotoPhaseExact' },
      { name: 'advancePhase', effect: advancePhase({}), expectedKind: 'advancePhase' },
      { name: 'pushInterruptPhase', effect: pushInterruptPhase({ phase: 'coup', resumePhase: 'main' }), expectedKind: 'pushInterruptPhase' },
      { name: 'popInterruptPhase', effect: popInterruptPhase({}), expectedKind: 'popInterruptPhase' },
    ];

    for (const { name, effect, expectedKind } of cases) {
      it(`${name} → effectKindOf returns '${expectedKind}'`, () => {
        assert.equal(effectKindOf(effect as never), expectedKind);
      });

      it(`${name} → has correct tagged key`, () => {
        assert.ok(expectedKind in (effect as Record<string, unknown>));
      });
    }
  });
});
