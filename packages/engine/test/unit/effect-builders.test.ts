import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeEffect, EFFECT_KIND_TAG } from '../../src/kernel/index.js';
import type { EffectAST } from '../../src/kernel/index.js';

describe('makeEffect', () => {
  it('produces a setVar effect with correct _k tag', () => {
    const effect = makeEffect('setVar', {
      scope: 'global',
      var: 'x',
      value: 1,
    });
    assert.equal(effect._k, EFFECT_KIND_TAG.setVar);
    assert.equal(effect._k, 0);
    assert.deepStrictEqual(effect.setVar, {
      scope: 'global',
      var: 'x',
      value: 1,
    });
  });

  it('produces an if effect with correct _k tag', () => {
    const thenBranch: EffectAST[] = [
      makeEffect('setVar', { scope: 'global', var: 'a', value: 1 }),
    ];
    const elseBranch: EffectAST[] = [
      makeEffect('addVar', { scope: 'global', var: 'b', delta: 2 }),
    ];
    const effect = makeEffect('if', {
      when: true,
      then: thenBranch,
      else: elseBranch,
    });
    assert.equal(effect._k, EFFECT_KIND_TAG.if);
    assert.equal(effect._k, 28);
    assert.deepStrictEqual(effect.if.when, true);
    assert.equal(effect.if.then.length, 1);
    assert.equal(effect.if.else!.length, 1);
  });

  it('produces a forEach effect with correct _k tag', () => {
    const innerEffects: EffectAST[] = [
      makeEffect('setVar', { scope: 'global', var: 'y', value: 0 }),
    ];
    const effect = makeEffect('forEach', {
      bind: 'item',
      over: { query: 'zones' },
      effects: innerEffects,
    });
    assert.equal(effect._k, EFFECT_KIND_TAG.forEach);
    assert.equal(effect._k, 29);
    assert.equal(effect.forEach.bind, 'item');
    assert.equal(effect.forEach.effects.length, 1);
  });

  it('produces a let effect with correct _k tag', () => {
    const effect = makeEffect('let', {
      bind: 'temp',
      value: 42,
      in: [makeEffect('setVar', { scope: 'global', var: 'z', value: 0 })],
    });
    assert.equal(effect._k, EFFECT_KIND_TAG.let);
    assert.equal(effect._k, 32);
    assert.equal(effect.let.bind, 'temp');
    assert.equal(effect.let.in.length, 1);
  });

  it('produces a moveToken effect with correct _k tag', () => {
    const effect = makeEffect('moveToken', {
      token: 'tok1' as any,
      from: 'zoneA' as any,
      to: 'zoneB' as any,
    });
    assert.equal(effect._k, EFFECT_KIND_TAG.moveToken);
    assert.equal(effect._k, 4);
  });

  it('always sets _k consistent with EFFECT_KIND_TAG', () => {
    const effect = makeEffect('rollRandom', {
      bind: 'roll',
      min: 1,
      max: 6,
      in: [],
    });
    assert.equal(effect._k, EFFECT_KIND_TAG.rollRandom);
  });

  it('rejects incorrect payload at compile time', () => {
    // @ts-expect-error - wrong payload shape for setVar
    makeEffect('setVar', { wrong: 'payload' });
  });

  it('does not mutate between calls', () => {
    const a = makeEffect('setVar', { scope: 'global', var: 'a', value: 1 });
    const b = makeEffect('setVar', { scope: 'global', var: 'b', value: 2 });
    assert.notEqual(a, b);
    assert.equal(a.setVar.var, 'a');
    assert.equal(b.setVar.var, 'b');
  });
});
