// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';

import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';
import {
  collectCallExpressionsByIdentifier,
  hasDirectNamedImport,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';

const thisDir = dirname(fileURLToPath(import.meta.url));
const engineRoot = findEnginePackageRoot(thisDir);
const kernelLinkedWindowConsumerPath = resolve(engineRoot, 'src', 'kernel', 'validate-gamedef-extensions.ts');
const cnlLinkedWindowConsumerPath = resolve(engineRoot, 'src', 'cnl', 'cross-validate.ts');

const LINKED_WINDOW_MATCHING_ARRAY_IDENTIFIERS = new Set<string>([
  'linkedWindows',
  'overrideWindowIds',
  'overrideWindowCandidates',
]);
const DISALLOWED_ARRAY_MATCHING_METHODS = new Set<string>(['includes', 'indexOf', 'some', 'find', 'filter']);

const importsLinkedWindowHelperFromContractsIndex = (sourceFile: ts.SourceFile): boolean => {
  return hasDirectNamedImport(sourceFile, '../contracts/index.js', 'findMissingTurnFlowLinkedWindows');
};

const hasDisallowedAdHocLinkedWindowMatching = (sourceFile: ts.SourceFile): boolean => {
  let hasViolation = false;
  const visit = (node: ts.Node): void => {
    if (hasViolation) {
      return;
    }

    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const target = node.expression.expression;
      const method = node.expression.name.text;
      if (
        ts.isIdentifier(target)
        && LINKED_WINDOW_MATCHING_ARRAY_IDENTIFIERS.has(target.text)
        && DISALLOWED_ARRAY_MATCHING_METHODS.has(method)
      ) {
        hasViolation = true;
        return;
      }
    }

    if (
      ts.isNewExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'Set'
      && node.arguments?.[0] !== undefined
      && ts.isIdentifier(node.arguments[0])
      && LINKED_WINDOW_MATCHING_ARRAY_IDENTIFIERS.has(node.arguments[0].text)
    ) {
      hasViolation = true;
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return hasViolation;
};

describe('linked-window contract source guard', () => {
  it('keeps linked-window missing-reference matching owned by shared contracts helper', () => {
    const kernelConsumerSource = readFileSync(kernelLinkedWindowConsumerPath, 'utf8');
    const cnlConsumerSource = readFileSync(cnlLinkedWindowConsumerPath, 'utf8');
    const kernelSourceFile = parseTypeScriptSource(kernelConsumerSource, 'validate-gamedef-extensions.ts');
    const cnlSourceFile = parseTypeScriptSource(cnlConsumerSource, 'cross-validate.ts');

    assert.equal(
      importsLinkedWindowHelperFromContractsIndex(kernelSourceFile),
      true,
      'Kernel linked-window validation must import findMissingTurnFlowLinkedWindows from ../contracts/index.js.',
    );
    assert.equal(
      importsLinkedWindowHelperFromContractsIndex(cnlSourceFile),
      true,
      'CNL linked-window validation must import findMissingTurnFlowLinkedWindows from ../contracts/index.js.',
    );

    assert.equal(
      collectCallExpressionsByIdentifier(kernelSourceFile, 'findMissingTurnFlowLinkedWindows').length > 0,
      true,
      'Kernel linked-window validation must call findMissingTurnFlowLinkedWindows.',
    );
    assert.equal(
      collectCallExpressionsByIdentifier(cnlSourceFile, 'findMissingTurnFlowLinkedWindows').length > 0,
      true,
      'CNL linked-window validation must call findMissingTurnFlowLinkedWindows.',
    );

    assert.equal(
      hasDisallowedAdHocLinkedWindowMatching(kernelSourceFile),
      false,
      'Kernel linked-window validation must not implement local ad-hoc matching for linkedWindows/override windows.',
    );
    assert.equal(
      hasDisallowedAdHocLinkedWindowMatching(cnlSourceFile),
      false,
      'CNL linked-window validation must not implement local ad-hoc matching for linkedWindows/override windows.',
    );

    const consumerSourceFiles = [resolve(engineRoot, 'src', 'kernel'), resolve(engineRoot, 'src', 'cnl')]
      .flatMap((rootDir) => listTypeScriptFiles(rootDir));
    const linkedWindowHelperConsumers = consumerSourceFiles
      .filter((filePath) => {
        const source = readFileSync(filePath, 'utf8');
        const sourceFile = parseTypeScriptSource(source, filePath);
        return collectCallExpressionsByIdentifier(sourceFile, 'findMissingTurnFlowLinkedWindows').length > 0;
      })
      .sort();

    assert.deepEqual(
      linkedWindowHelperConsumers,
      [cnlLinkedWindowConsumerPath, kernelLinkedWindowConsumerPath].sort(),
      [
        'Only canonical CNL/kernel consumers should call findMissingTurnFlowLinkedWindows.',
        'Remediation: remove non-canonical call sites and keep shared linked-window matching centralized in contracts.',
      ].join('\n'),
    );
  });
});
