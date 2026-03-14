import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { findEnginePackageRoot } from '../../helpers/lint-policy-helpers.js';

const TOKEN_FILTER_LOWERING_FILE = ['src', 'cnl', 'compile-conditions-token-filters.ts'] as const;
const FORBIDDEN_ALIAS_KEYS = new Set(['eq', 'neq', 'in', 'notIn']);
const TARGET_FUNCTIONS = ['lowerTokenFilterEntry', 'lowerAssetRowFilterEntry'] as const;

function findNamedFunction(sourceFile: ts.SourceFile, name: string): ts.FunctionDeclaration {
  let match: ts.FunctionDeclaration | null = null;
  const visit = (node: ts.Node): void => {
    if (match !== null) {
      return;
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (match !== null) {
    return match;
  }
  throw new Error(`Could not find function ${name} in ${sourceFile.fileName}.`);
}

function formatLocation(sourceFile: ts.SourceFile, node: ts.Node): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${line + 1}:${character + 1}`;
}

function collectAliasPropertyReads(
  sourceFile: ts.SourceFile,
  fn: ts.FunctionDeclaration,
): readonly string[] {
  const violations: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'source'
      && FORBIDDEN_ALIAS_KEYS.has(node.name.text)
    ) {
      violations.push(formatLocation(sourceFile, node));
    }

    if (
      ts.isElementAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'source'
      && ts.isStringLiteral(node.argumentExpression)
      && FORBIDDEN_ALIAS_KEYS.has(node.argumentExpression.text)
    ) {
      violations.push(formatLocation(sourceFile, node));
    }

    ts.forEachChild(node, visit);
  };

  if (fn.body !== undefined) {
    visit(fn.body);
  }

  return violations;
}

function countAliasRejectionCalls(fn: ts.FunctionDeclaration): number {
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'rejectPredicateAliasKeysWhenCanonicalShapePresent') {
      count += 1;
    }
    ts.forEachChild(node, visit);
  };
  if (fn.body !== undefined) {
    visit(fn.body);
  }
  return count;
}

describe('cnl predicate shape policy', () => {
  it('forbids alias key property reads in token-filter and assetRows predicate lowering, with explicit canonical-shape rejection', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const tokenFilterLoweringPath = resolve(engineRoot, ...TOKEN_FILTER_LOWERING_FILE);
    const source = readFileSync(tokenFilterLoweringPath, 'utf8');
    const sourceFile = parseTypeScriptSource(source, tokenFilterLoweringPath);

    const violations: string[] = [];
    for (const fnName of TARGET_FUNCTIONS) {
      const fn = findNamedFunction(sourceFile, fnName);
      const aliasReads = collectAliasPropertyReads(sourceFile, fn);
      violations.push(...aliasReads.map((location) => `${fnName}:${location}`));
      assert.ok(
        countAliasRejectionCalls(fn) >= 1,
        `${fnName} must call rejectPredicateAliasKeysWhenCanonicalShapePresent before predicate op/value lowering`,
      );
    }

    assert.deepEqual(
      violations,
      [],
      'compile-conditions predicate lowering must not read alias keys (source.eq/source.neq/source.in/source.notIn); canonical op/value shape is required',
    );
  });
});
