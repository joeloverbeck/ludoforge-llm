import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tagEffectAsts, EFFECT_KIND_TAG } from '../../src/kernel/index.js';

describe('tagEffectAsts', () => {
  describe('basic tagging', () => {
    it('adds _k to a flat setVar effect', () => {
      const input = { setVar: { scope: 'global', var: 'x', value: 1 } };
      const result = tagEffectAsts(input);
      assert.equal((result as any)._k, EFFECT_KIND_TAG.setVar);
      assert.equal((result as any)._k, 0);
      assert.deepStrictEqual((result as any).setVar, {
        scope: 'global',
        var: 'x',
        value: 1,
      });
    });

    it('adds _k to an addVar effect', () => {
      const input = { addVar: { scope: 'global', var: 'y', delta: 5 } };
      const result = tagEffectAsts(input);
      assert.equal((result as any)._k, EFFECT_KIND_TAG.addVar);
    });

    it('adds _k to a moveToken effect', () => {
      const input = { moveToken: { token: 'tok1', from: 'zoneA', to: 'zoneB' } };
      const result = tagEffectAsts(input);
      assert.equal((result as any)._k, EFFECT_KIND_TAG.moveToken);
    });
  });

  describe('recursive tagging', () => {
    it('tags nested effects inside if.then and if.else', () => {
      const input = {
        if: {
          when: true,
          then: [
            { setVar: { scope: 'global', var: 'a', value: 1 } },
          ],
          else: [
            { addVar: { scope: 'global', var: 'b', delta: 2 } },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.if);
      assert.equal(result.if.then[0]._k, EFFECT_KIND_TAG.setVar);
      assert.equal(result.if.else[0]._k, EFFECT_KIND_TAG.addVar);
    });

    it('tags nested effects inside forEach.effects', () => {
      const input = {
        forEach: {
          bind: 'item',
          over: { query: 'zones' },
          effects: [
            { setVar: { scope: 'global', var: 'count', value: 0 } },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.forEach);
      assert.equal(result.forEach.effects[0]._k, EFFECT_KIND_TAG.setVar);
    });

    it('tags nested effects inside forEach.in', () => {
      const input = {
        forEach: {
          bind: 'item',
          over: { query: 'zones' },
          effects: [],
          in: [
            { addVar: { scope: 'global', var: 'total', delta: 1 } },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result.forEach.in[0]._k, EFFECT_KIND_TAG.addVar);
    });

    it('tags nested effects inside let.in', () => {
      const input = {
        let: {
          bind: 'temp',
          value: 42,
          in: [
            { setVar: { scope: 'global', var: 'z', value: 0 } },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.let);
      assert.equal(result.let.in[0]._k, EFFECT_KIND_TAG.setVar);
    });

    it('tags nested effects inside reduce.in', () => {
      const input = {
        reduce: {
          itemBind: 'item',
          accBind: 'acc',
          over: { query: 'zones' },
          initial: 0,
          next: 1,
          resultBind: 'total',
          in: [
            { setVar: { scope: 'global', var: 'r', value: 0 } },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.reduce);
      assert.equal(result.reduce.in[0]._k, EFFECT_KIND_TAG.setVar);
    });

    it('tags nested effects inside removeByPriority.in', () => {
      const input = {
        removeByPriority: {
          budget: 3,
          groups: [],
          in: [
            { addVar: { scope: 'global', var: 'removed', delta: 1 } },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.removeByPriority);
      assert.equal(result.removeByPriority.in[0]._k, EFFECT_KIND_TAG.addVar);
    });

    it('tags nested effects inside evaluateSubset.compute and evaluateSubset.in', () => {
      const input = {
        evaluateSubset: {
          source: { query: 'zones' },
          subsetSize: 2,
          subsetBind: 'sub',
          compute: [
            { setVar: { scope: 'global', var: 'score', value: 0 } },
          ],
          scoreExpr: 1,
          resultBind: 'best',
          in: [
            { addVar: { scope: 'global', var: 'total', delta: 1 } },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.evaluateSubset);
      assert.equal(result.evaluateSubset.compute[0]._k, EFFECT_KIND_TAG.setVar);
      assert.equal(result.evaluateSubset.in[0]._k, EFFECT_KIND_TAG.addVar);
    });

    it('tags nested effects inside rollRandom.in', () => {
      const input = {
        rollRandom: {
          bind: 'roll',
          min: 1,
          max: 6,
          in: [
            { setVar: { scope: 'global', var: 'result', value: 0 } },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.rollRandom);
      assert.equal(result.rollRandom.in[0]._k, EFFECT_KIND_TAG.setVar);
    });

    it('tags deeply nested effects (if inside forEach)', () => {
      const input = {
        forEach: {
          bind: 'item',
          over: { query: 'zones' },
          effects: [
            {
              if: {
                when: true,
                then: [
                  { setVar: { scope: 'global', var: 'deep', value: 1 } },
                ],
              },
            },
          ],
        },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.forEach);
      assert.equal(result.forEach.effects[0]._k, EFFECT_KIND_TAG.if);
      assert.equal(result.forEach.effects[0].if.then[0]._k, EFFECT_KIND_TAG.setVar);
    });
  });

  describe('arrays', () => {
    it('tags all effects in an array', () => {
      const input = [
        { setVar: { scope: 'global', var: 'a', value: 1 } },
        { addVar: { scope: 'global', var: 'b', delta: 2 } },
        { moveToken: { token: 'tok1', from: 'z1', to: 'z2' } },
      ];
      const result = tagEffectAsts(input) as any[];
      assert.equal(result[0]._k, EFFECT_KIND_TAG.setVar);
      assert.equal(result[1]._k, EFFECT_KIND_TAG.addVar);
      assert.equal(result[2]._k, EFFECT_KIND_TAG.moveToken);
    });
  });

  describe('idempotency', () => {
    it('produces the same result when run twice', () => {
      const input = {
        if: {
          when: true,
          then: [
            { setVar: { scope: 'global', var: 'a', value: 1 } },
          ],
          else: [
            { forEach: {
              bind: 'item',
              over: { query: 'zones' },
              effects: [
                { addVar: { scope: 'global', var: 'b', delta: 2 } },
              ],
            } },
          ],
        },
      };
      const first = tagEffectAsts(input);
      const second = tagEffectAsts(first);
      assert.deepStrictEqual(first, second);
    });

    it('does not change an already-tagged effect', () => {
      const input = {
        _k: EFFECT_KIND_TAG.setVar,
        setVar: { scope: 'global', var: 'x', value: 1 },
      };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, EFFECT_KIND_TAG.setVar);
      assert.deepStrictEqual(result.setVar, input.setVar);
    });
  });

  describe('non-effect passthrough', () => {
    it('does not modify primitives', () => {
      assert.equal(tagEffectAsts(42), 42);
      assert.equal(tagEffectAsts('hello'), 'hello');
      assert.equal(tagEffectAsts(true), true);
      assert.equal(tagEffectAsts(null), null);
      assert.equal(tagEffectAsts(undefined), undefined);
    });

    it('does not add _k to non-effect objects', () => {
      const input = { foo: 'bar', baz: 123 };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, undefined);
      assert.equal(result.foo, 'bar');
      assert.equal(result.baz, 123);
    });

    it('does not modify objects with keys not in EFFECT_KIND_TAG', () => {
      const input = { customProp: { nested: true } };
      const result = tagEffectAsts(input) as any;
      assert.equal(result._k, undefined);
      assert.deepStrictEqual(result.customProp, { nested: true });
    });
  });

  describe('immutability', () => {
    it('does not mutate the input', () => {
      const input = {
        setVar: { scope: 'global', var: 'x', value: 1 },
      };
      const inputCopy = JSON.parse(JSON.stringify(input));
      tagEffectAsts(input);
      assert.deepStrictEqual(input, inputCopy);
    });

    it('returns a new object', () => {
      const input = { setVar: { scope: 'global', var: 'x', value: 1 } };
      const result = tagEffectAsts(input);
      assert.notEqual(result, input);
    });
  });
});
