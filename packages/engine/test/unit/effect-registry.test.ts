import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EFFECT_KIND_TAG,
  TAG_TO_KIND,
  effectKindOf,
  makeEffect,
} from '../../src/kernel/index.js';
import type { EffectKind } from '../../src/kernel/index.js';

describe('TAG_TO_KIND', () => {
  it('has exactly as many entries as EFFECT_KIND_TAG', () => {
    const tagCount = Object.keys(EFFECT_KIND_TAG).length;
    assert.equal(TAG_TO_KIND.length, tagCount);
  });

  it('round-trips every kind through EFFECT_KIND_TAG', () => {
    for (const [kind, tag] of Object.entries(EFFECT_KIND_TAG)) {
      assert.equal(
        TAG_TO_KIND[tag],
        kind,
        `TAG_TO_KIND[${tag}] should be '${kind}'`,
      );
    }
  });

  it('has contiguous tag values 0..N-1', () => {
    const tags = Object.values(EFFECT_KIND_TAG).sort((a, b) => a - b);
    const expected = Array.from({ length: tags.length }, (_, i) => i);
    assert.deepStrictEqual(tags, expected);
  });
});

describe('effectKindOf (tag-based)', () => {
  it('returns setVar for a setVar effect', () => {
    const effect = makeEffect('setVar', {
      scope: 'global',
      var: 'x',
      value: 1,
    });
    assert.equal(effectKindOf(effect), 'setVar');
  });

  it('returns forEach for a forEach effect', () => {
    const effect = makeEffect('forEach', {
      bind: 'item',
      over: { query: 'zones' },
      effects: [],
    });
    assert.equal(effectKindOf(effect), 'forEach');
  });

  it('returns the correct kind for every effect kind', () => {
    const kindPayloads: Record<EffectKind, Record<string, unknown>> = {
      setVar: { scope: 'global', var: 'x', value: 1 },
      addVar: { scope: 'global', var: 'x', delta: 1 },
      setActivePlayer: { player: 'actor' },
      transferVar: { from: { scope: 'global', var: 'a' }, to: { scope: 'global', var: 'b' }, amount: 1 },
      moveToken: { token: 'tok', from: 'zA', to: 'zB' },
      moveAll: { from: 'zA', to: 'zB' },
      moveTokenAdjacent: { token: 'tok', zone: 'z', direction: 'toward', target: 'z2' },
      draw: { from: 'zA', to: 'zB', count: 1 },
      shuffle: { zone: 'z' },
      createToken: { id: 'tok', type: 't', zone: 'z' },
      destroyToken: { token: 'tok', zone: 'z' },
      setTokenProp: { token: 'tok', zone: 'z', prop: 'p', value: 1 },
      reveal: { token: 'tok', zone: 'z', to: 'all' },
      conceal: { token: 'tok', zone: 'z' },
      bindValue: { bind: 'b', value: 1, in: [] },
      chooseOne: { chooser: 'actor', bind: 'b', options: [], in: [] },
      chooseN: { chooser: 'actor', bind: 'b', from: [], min: 0, max: 1, in: [] },
      setMarker: { zone: 'z', marker: 'm', value: 0 },
      shiftMarker: { zone: 'z', marker: 'm', delta: 1 },
      setGlobalMarker: { marker: 'm', value: 0 },
      flipGlobalMarker: { marker: 'm' },
      shiftGlobalMarker: { marker: 'm', delta: 1 },
      grantFreeOperation: { seat: 's', operationClass: 'operation', actionIds: [] },
      gotoPhaseExact: { phase: 'p' },
      advancePhase: {},
      pushInterruptPhase: { phase: 'p' },
      popInterruptPhase: {},
      rollRandom: { bind: 'r', min: 1, max: 6, in: [] },
      if: { when: true, then: [] },
      forEach: { bind: 'b', over: { query: 'zones' }, effects: [] },
      reduce: { bind: 'b', over: { query: 'zones' }, initial: 0, accumulator: 'acc', value: 0 },
      removeByPriority: { zone: 'z', count: 1, priorities: [] },
      let: { bind: 'b', value: 1, in: [] },
      evaluateSubset: { from: { query: 'zones' }, bind: 'b', filterCondition: true, effects: [] },
    };
    for (const kind of Object.keys(kindPayloads) as EffectKind[]) {
      const effect = makeEffect(kind, kindPayloads[kind] as any);
      assert.equal(
        effectKindOf(effect),
        kind,
        `effectKindOf should return '${kind}' for a ${kind} effect`,
      );
    }
  });
});
