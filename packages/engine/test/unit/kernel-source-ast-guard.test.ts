import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectCallExpressionsByIdentifier,
  collectTopLevelObjectLiteralInitializers,
  parseTypeScriptSource,
  resolveObjectLiteralFromExpression,
  resolveStringLiteralObjectPropertyWithSpreads,
} from '../helpers/kernel-source-ast-guard.js';

describe('kernel source ast guard helpers', () => {
  it('resolves object literal contexts from direct literals and identifier references', () => {
    const source = `
      const base = { mode: 'execution' as const };
      const context = { ...base, effectPath: '' };
      applyEffects([], context);
      applyEffects([], { ...base });
    `;
    const sourceFile = parseTypeScriptSource(source, 'fixture.ts');
    const objectInitializers = collectTopLevelObjectLiteralInitializers(sourceFile);
    const applyEffectsCalls = collectCallExpressionsByIdentifier(sourceFile, 'applyEffects');
    assert.equal(applyEffectsCalls.length, 2, 'fixture must contain two applyEffects calls');
    const callA = applyEffectsCalls[0];
    const callB = applyEffectsCalls[1];
    assert.ok(callA !== undefined && callB !== undefined, 'fixture applyEffects calls must exist');
    if (callA === undefined || callB === undefined) {
      return;
    }

    const ctxA = callA.arguments[1];
    const ctxB = callB.arguments[1];
    assert.ok(ctxA !== undefined && ctxB !== undefined, 'fixture call contexts must exist');
    if (ctxA === undefined || ctxB === undefined) {
      return;
    }

    assert.ok(resolveObjectLiteralFromExpression(ctxA, objectInitializers) !== undefined);
    assert.ok(resolveObjectLiteralFromExpression(ctxB, objectInitializers) !== undefined);
  });

  it('resolves string literal object properties through spread chains', () => {
    const source = `
      const root = { mode: 'execution' as const };
      const middle = { ...root };
      const leaf = { ...middle, effectPath: '' };
      const override = { ...leaf, mode: 'discovery' };
      const nonLiteral = { mode: someDynamicMode };
    `;
    const sourceFile = parseTypeScriptSource(source, 'fixture-spreads.ts');
    const objectInitializers = collectTopLevelObjectLiteralInitializers(sourceFile);
    const leaf = objectInitializers.get('leaf');
    const override = objectInitializers.get('override');
    const nonLiteral = objectInitializers.get('nonLiteral');

    assert.ok(leaf !== undefined && override !== undefined && nonLiteral !== undefined);
    if (leaf === undefined || override === undefined || nonLiteral === undefined) {
      return;
    }

    assert.equal(resolveStringLiteralObjectPropertyWithSpreads(leaf, 'mode', objectInitializers), 'execution');
    assert.equal(resolveStringLiteralObjectPropertyWithSpreads(override, 'mode', objectInitializers), 'discovery');
    assert.equal(resolveStringLiteralObjectPropertyWithSpreads(nonLiteral, 'mode', objectInitializers), undefined);
  });
});
