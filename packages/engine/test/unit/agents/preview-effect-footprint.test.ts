// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeEffectFootprint,
  structuralImpactScore,
  unionFootprints,
} from '../../../src/cnl/compile-effect-footprint.js';
import { setVar, moveToken, ifEffect } from '../../../src/kernel/ast-builders.js';
import { VALUE_EXPR_TAG } from '../../../src/kernel/index.js';
import type { EffectAST, EffectFootprint, GameDef } from '../../../src/kernel/index.js';
import { compileProductionSpec } from '../../helpers/production-spec-helpers.js';

const readGlobalVar = (name: string): EffectFootprint => ({
  writes: { tokens: [], zones: [], variables: [], scores: [] },
  reads: { tokens: [], zones: [], variables: [`global:${name}`], scores: [] },
  mayTouchTokens: [],
  mayTouchZones: [],
  mayTouchVariables: [],
  mayTouchScores: [],
});

const readZone = (zone: string): EffectFootprint => ({
  writes: { tokens: [], zones: [], variables: [], scores: [] },
  reads: { tokens: [], zones: [zone], variables: [], scores: [] },
  mayTouchTokens: [],
  mayTouchZones: [],
  mayTouchVariables: [],
  mayTouchScores: [],
});

describe('preview effect footprint', () => {
  it('marks demonstrable global variable writes without false negatives', () => {
    const footprint = computeEffectFootprint(setVar({ scope: 'global', var: 'projected', value: 1 }));

    assert.deepEqual(footprint.writes.variables, ['global:projected']);
    assert.deepEqual(footprint.mayTouchVariables, ['global:projected']);
    assert.equal(structuralImpactScore(footprint, readGlobalVar('projected')), 3);
    assert.equal(structuralImpactScore(footprint, readGlobalVar('unrelated')), 1);
  });

  it('propagates unknown zone touches through dynamic token movement', () => {
    const footprint = computeEffectFootprint(moveToken({
      token: '$token',
      from: 'board:none',
      to: { zoneExpr: { _t: VALUE_EXPR_TAG.REF, ref: 'binding', name: '$destination' } },
    }));

    assert.equal(footprint.writes.tokens, 'unknown');
    assert.equal(footprint.reads.zones, 'unknown');
    assert.equal(footprint.mayTouchTokens, 'unknown');
  });

  it('marks demonstrable zone touches for token movement', () => {
    const footprint = computeEffectFootprint(moveToken({
      token: '$token',
      from: 'board:a',
      to: 'board:b',
    }));

    assert.deepEqual(footprint.mayTouchZones, ['board:a', 'board:b']);
    assert.equal(structuralImpactScore(footprint, readZone('board:b')), 3);
    assert.equal(structuralImpactScore(footprint, readZone('board:c')), 1);
  });

  it('unions branch footprints deterministically', () => {
    const effect = ifEffect({
      when: true,
      then: [setVar({ scope: 'global', var: 'alpha', value: 1 })],
      else: [setVar({ scope: 'global', var: 'bravo', value: 1 })],
    });
    const first = computeEffectFootprint(effect);
    const second = computeEffectFootprint(effect);

    assert.deepEqual(first, second);
    assert.deepEqual(first.writes.variables, ['global:alpha', 'global:bravo']);
  });

  it('keeps union ordering stable for compiled-effect arrays', () => {
    const effects: readonly EffectAST[] = [
      setVar({ scope: 'global', var: 'bravo', value: 1 }),
      setVar({ scope: 'global', var: 'alpha', value: 1 }),
    ];
    const footprint = unionFootprints(effects.map(computeEffectFootprint));

    assert.deepEqual(footprint.writes.variables, ['global:alpha', 'global:bravo']);
  });

  it('covers demonstrable variable writes across the FITL action corpus', () => {
    const { compiled } = compileProductionSpec();

    for (const action of compiled.gameDef.actions) {
      const expectedWrites = new Set<string>();
      const actionEffects = visitEffects(action.effects);
      for (const effect of actionEffects) {
        assert.ok(effect.footprint, `${action.id} has a compiled effect without footprint metadata`);
        collectDemonstrableVariableWrites(effect, expectedWrites);
      }

      const actionFootprint = unionFootprints(action.effects.map((effect) => effect.footprint ?? computeEffectFootprint(effect)));
      assertNoMissingVariables(action.id, actionFootprint, expectedWrites);
    }
  });

  it('emits deterministic footprints for production compiles', () => {
    const first = compileProductionSpec().compiled.gameDef;
    const second = compileProductionSpec().compiled.gameDef;

    assert.deepEqual(collectActionFootprints(first), collectActionFootprints(second));
  });
});

function collectActionFootprints(gameDef: GameDef): Readonly<Record<string, readonly EffectFootprint[]>> {
  return Object.fromEntries(gameDef.actions.map((action) => [
    action.id,
    action.effects.map((effect) => effect.footprint ?? computeEffectFootprint(effect)),
  ]));
}

function assertNoMissingVariables(
  actionId: string,
  footprint: EffectFootprint,
  expectedWrites: ReadonlySet<string>,
): void {
  if (footprint.writes.variables === 'unknown' || footprint.mayTouchVariables === 'unknown') {
    return;
  }
  const covered = new Set([...footprint.writes.variables, ...footprint.mayTouchVariables]);
  const missing = [...expectedWrites].filter((variable) => !covered.has(variable));

  assert.deepEqual(missing, [], `${actionId} footprint missed demonstrable variable writes`);
}

function collectDemonstrableVariableWrites(effect: EffectAST, writes: Set<string>): void {
  if ('setVar' in effect && typeof effect.setVar.var === 'string') {
    writes.add(`${effect.setVar.scope}:${effect.setVar.var}`);
  }
  if ('addVar' in effect && typeof effect.addVar.var === 'string') {
    writes.add(`${effect.addVar.scope}:${effect.addVar.var}`);
  }
  if ('transferVar' in effect && typeof effect.transferVar.to.var === 'string') {
    writes.add(`${effect.transferVar.to.scope}:${effect.transferVar.to.var}`);
  }
}

function visitEffects(effects: readonly EffectAST[]): readonly EffectAST[] {
  const visited: EffectAST[] = [];
  for (const effect of effects) {
    visited.push(effect);
    visited.push(...visitEffects(childEffects(effect)));
  }
  return visited;
}

function childEffects(effect: EffectAST): readonly EffectAST[] {
  if ('if' in effect) {
    return [...effect.if.then, ...(effect.if.else ?? [])];
  }
  if ('forEach' in effect) {
    return [...effect.forEach.effects, ...(effect.forEach.in ?? [])];
  }
  if ('reduce' in effect) {
    return effect.reduce.in;
  }
  if ('removeByPriority' in effect) {
    return effect.removeByPriority.in ?? [];
  }
  if ('let' in effect) {
    return effect.let.in;
  }
  if ('evaluateSubset' in effect) {
    return [...effect.evaluateSubset.compute, ...effect.evaluateSubset.in];
  }
  if ('rollRandom' in effect) {
    return effect.rollRandom.in;
  }
  return [];
}
