import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertModuleExportContract,
  collectCallExpressionsByIdentifier,
  collectTopLevelExportSurface,
  collectTopLevelObjectLiteralInitializers,
  isIdentifierExported,
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

  it('asserts module export contracts including disallowed export mechanisms', () => {
    const sourceFile = parseTypeScriptSource(
      `
      export const alpha = 1;
      export const beta = 2;
      `,
      'contract-pass.ts',
    );

    assert.doesNotThrow(() =>
      assertModuleExportContract(sourceFile, 'contract-pass.ts', {
        expectedNamedExports: ['alpha', 'beta'],
      }),
    );
  });

  it('fails module export contracts when default/wildcard/assignment exports are present', () => {
    const wildcardSource = parseTypeScriptSource("export * from './dep.js';", 'contract-wildcard.ts');
    assert.throws(
      () =>
        assertModuleExportContract(wildcardSource, 'contract-wildcard.ts', {
          expectedNamedExports: [],
        }),
      /forbid wildcard re-exports/u,
    );

    const defaultSource = parseTypeScriptSource('const value = 1; export default value;', 'contract-default.ts');
    assert.throws(
      () =>
        assertModuleExportContract(defaultSource, 'contract-default.ts', {
          expectedNamedExports: [],
        }),
      /forbid default export forms/u,
    );

    const assignmentSource = parseTypeScriptSource('const value = 1; export = value;', 'contract-assignment.ts');
    assert.throws(
      () =>
        assertModuleExportContract(assignmentSource, 'contract-assignment.ts', {
          expectedNamedExports: [],
        }),
      /forbid export assignment/u,
    );
  });

  it('recognizes aliased named re-export semantics for local and exported identifiers', () => {
    const sourceFile = parseTypeScriptSource(
      `
      const localValue = 1;
      export { localValue as renamedValue };
      export { upstream as externalAlias } from './dep.js';
      `,
      'contract-alias.ts',
    );

    assert.equal(isIdentifierExported(sourceFile, 'localValue'), true);
    assert.equal(isIdentifierExported(sourceFile, 'renamedValue'), true);
    assert.equal(isIdentifierExported(sourceFile, 'upstream'), true);
    assert.equal(isIdentifierExported(sourceFile, 'externalAlias'), true);

    const exportSurface = collectTopLevelExportSurface(sourceFile);
    assert.deepEqual([...exportSurface.namedExports].sort(), ['externalAlias', 'renamedValue']);
  });

  it('detects default export declaration forms and mixed export surfaces', () => {
    const defaultDeclarationSource = parseTypeScriptSource(
      `
      export default function exportedFn(): number {
        return 1;
      }
      export default class ExportedClass {}
      `,
      'contract-default-declarations.ts',
    );
    const defaultDeclarationSurface = collectTopLevelExportSurface(defaultDeclarationSource);
    assert.equal(defaultDeclarationSurface.hasDefaultExport, true);

    const mixedSource = parseTypeScriptSource(
      `
      export const alpha = 1;
      const beta = 2;
      export { beta as gamma };
      export * from './dep.js';
      export default alpha;
      `,
      'contract-mixed.ts',
    );
    const mixedSurface = collectTopLevelExportSurface(mixedSource);
    assert.deepEqual([...mixedSurface.namedExports].sort(), ['alpha', 'gamma']);
    assert.equal(mixedSurface.hasExportAll, true);
    assert.equal(mixedSurface.hasDefaultExport, true);
    assert.equal(mixedSurface.hasExportAssignment, false);
  });
});
