import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { collectCallExpressionsByIdentifier, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { findEnginePackageRoot } from '../../helpers/lint-policy-helpers.js';

type ConditionPathViolation = {
  readonly file: string;
  readonly line: number;
  readonly expression: string;
  readonly reason: string;
};

const VALIDATOR_FILES = [
  ['src', 'kernel', 'validate-gamedef-core.ts'],
  ['src', 'kernel', 'validate-gamedef-behavior.ts'],
  ['src', 'kernel', 'validate-gamedef-extensions.ts'],
] as const;

function isConditionSurfaceHelperCall(expression: ts.Expression): boolean {
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
    return false;
  }
  const callee = expression.expression.text;
  return (
    callee === 'appendValueExprConditionSurfacePath'
    || callee === 'appendQueryConditionSurfacePath'
    || callee === 'appendEffectConditionSurfacePath'
    || callee === 'appendActionPipelineConditionSurfacePath'
    || callee.startsWith('conditionSurfacePathFor')
  );
}

function findEnclosingFunctionName(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node.parent;
  while (current !== undefined) {
    if (ts.isFunctionDeclaration(current) && current.name !== undefined) {
      return current.name.text;
    }
    if (ts.isMethodDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      const parent = current.parent;
      if (parent !== undefined && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
        return parent.name.text;
      }
    }
    current = current.parent;
  }
  return undefined;
}

describe('condition-surface validator callsite policy', () => {
  it('keeps top-level validator validateConditionAst paths owned by condition-surface helpers', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const violations: ConditionPathViolation[] = [];

    for (const segments of VALIDATOR_FILES) {
      const absolutePath = resolve(engineRoot, ...segments);
      const source = readFileSync(absolutePath, 'utf8');
      const sourceFile = parseTypeScriptSource(source, absolutePath);
      const calls = collectCallExpressionsByIdentifier(sourceFile, 'validateConditionAst');

      for (const call of calls) {
        const enclosingFunctionName = findEnclosingFunctionName(call);
        if (enclosingFunctionName === 'validateConditionAst') {
          continue;
        }

        const conditionPathArg = call.arguments[2];
        if (conditionPathArg === undefined) {
          const line = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line + 1;
          violations.push({
            file: relative(engineRoot, absolutePath),
            line,
            expression: call.getText(sourceFile),
            reason: 'missing third path argument',
          });
          continue;
        }

        if (!isConditionSurfaceHelperCall(conditionPathArg)) {
          const line = sourceFile.getLineAndCharacterOfPosition(conditionPathArg.getStart(sourceFile)).line + 1;
          violations.push({
            file: relative(engineRoot, absolutePath),
            line,
            expression: conditionPathArg.getText(sourceFile),
            reason: 'path argument is not a condition-surface helper call',
          });
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      [
        'Top-level validator validateConditionAst callsites must pass path values via condition-surface contract helpers.',
        'Allowed path construction patterns:',
        '- conditionSurfacePathFor* helper calls',
        '- append*ConditionSurfacePath(basePath, CONDITION_SURFACE_SUFFIX.<family>.*)',
        'Disallowed at top-level validator callsites:',
        '- raw string literals (for example "triggers[0].when")',
        '- raw template literals (for example `actions[${index}].pre`)',
        '- ad-hoc helper aliases/wrappers instead of condition-surface contract helpers',
        'Violations:',
        ...violations.map((violation) => `- ${violation.file}:${violation.line} (${violation.reason}) -> ${violation.expression}`),
      ].join('\n'),
    );
  });
});
