// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';

import { collectCallExpressionsByIdentifier, parseTypeScriptSource, unwrapTypeScriptExpression } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

type GuardTarget = Readonly<{
  readonly sourcePath: string;
  readonly fileName: string;
}>;

const GUARD_TARGETS: readonly GuardTarget[] = [
  {
    sourcePath: 'src/kernel/validate-gamedef-extensions.ts',
    fileName: 'validate-gamedef-extensions.ts',
  },
  {
    sourcePath: 'src/kernel/turn-flow-runtime-invariants.ts',
    fileName: 'turn-flow-runtime-invariants.ts',
  },
];

const RELATIONAL_OPERATORS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

const isDistinctSeatCountExpression = (expression: ts.Expression): boolean => {
  const unwrapped = unwrapTypeScriptExpression(expression);
  if (ts.isIdentifier(unwrapped) && unwrapped.text === 'distinctSeatCount') {
    return true;
  }

  if (ts.isPropertyAccessExpression(unwrapped) && unwrapped.name.text === 'distinctSeatCount') {
    return true;
  }

  return false;
};

const isNumericLiteralExpression = (expression: ts.Expression): boolean => {
  const unwrapped = unwrapTypeScriptExpression(expression);
  return ts.isNumericLiteral(unwrapped);
};

const collectForbiddenDistinctSeatComparisons = (sourceFile: ts.SourceFile): readonly ts.BinaryExpression[] => {
  const forbidden: ts.BinaryExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) && RELATIONAL_OPERATORS.has(node.operatorToken.kind)) {
      const left = unwrapTypeScriptExpression(node.left);
      const right = unwrapTypeScriptExpression(node.right);
      const comparesDistinctSeatCountToNumericLiteral =
        (isDistinctSeatCountExpression(left) && isNumericLiteralExpression(right)) ||
        (isDistinctSeatCountExpression(right) && isNumericLiteralExpression(left));
      if (comparesDistinctSeatCountToNumericLiteral) {
        forbidden.push(node);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return forbidden;
};

describe('turn-flow-seat-order policy contract source guard', () => {
  it('keeps validator/runtime cardinality checks wired to the shared seat-order policy helper', () => {
    for (const target of GUARD_TARGETS) {
      const source = readKernelSource(target.sourcePath);
      const sourceFile = parseTypeScriptSource(source, target.fileName);

      const helperCalls = collectCallExpressionsByIdentifier(sourceFile, 'isCardSeatOrderDistinctSeatCountValid');
      assert.equal(
        helperCalls.length > 0,
        true,
        `${target.fileName} must call isCardSeatOrderDistinctSeatCountValid for card seat-order cardinality checks`,
      );
    }
  });

  it('blocks direct literal distinct-seat threshold comparisons in validator/runtime cardinality surfaces', () => {
    for (const target of GUARD_TARGETS) {
      const source = readKernelSource(target.sourcePath);
      const sourceFile = parseTypeScriptSource(source, target.fileName);

      const forbiddenComparisons = collectForbiddenDistinctSeatComparisons(sourceFile);
      assert.equal(
        forbiddenComparisons.length,
        0,
        `${target.fileName} must not compare distinctSeatCount directly against numeric literal thresholds`,
      );
    }
  });
});
