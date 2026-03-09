import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ts from 'typescript';
import {
  collectCallExpressionsByIdentifier,
  hasDirectNamedImport,
  parseTypeScriptSource,
  unwrapTypeScriptExpression,
} from '../../helpers/kernel-source-ast-guard.js';
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

const CONDITION_SURFACE_HELPER_IDENTIFIERS = new Set<string>([
  'appendValueExprConditionSurfacePath',
  'appendQueryConditionSurfacePath',
  'appendEffectConditionSurfacePath',
  'appendEventConditionSurfacePath',
  'appendActionPipelineConditionSurfacePath',
]);

function isConditionSurfaceHelperIdentifier(identifier: string): boolean {
  return (
    CONDITION_SURFACE_HELPER_IDENTIFIERS.has(identifier)
    || identifier.startsWith('conditionSurfacePathFor')
  );
}

function getConditionSurfaceHelperCalleeName(expression: ts.Expression): string | undefined {
  const unwrapped = unwrapTypeScriptExpression(expression);
  if (!ts.isCallExpression(unwrapped) || !ts.isIdentifier(unwrapped.expression)) {
    return undefined;
  }
  const callee = unwrapped.expression.text;
  return isConditionSurfaceHelperIdentifier(callee) ? callee : undefined;
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

function collectConditionPathViolations(
  sourceFile: ts.SourceFile,
  fileLabel: string,
): readonly ConditionPathViolation[] {
  const calls = collectCallExpressionsByIdentifier(sourceFile, 'validateConditionAst');
  const violations: ConditionPathViolation[] = [];

  for (const call of calls) {
    const enclosingFunctionName = findEnclosingFunctionName(call);
    if (enclosingFunctionName === 'validateConditionAst') {
      continue;
    }

    const conditionPathArg = call.arguments[2];
    if (conditionPathArg === undefined) {
      const line = sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).line + 1;
      violations.push({
        file: fileLabel,
        line,
        expression: call.getText(sourceFile),
        reason: 'missing third path argument',
      });
      continue;
    }

    const helperCalleeName = getConditionSurfaceHelperCalleeName(conditionPathArg);
    if (helperCalleeName === undefined) {
      const line = sourceFile.getLineAndCharacterOfPosition(conditionPathArg.getStart(sourceFile)).line + 1;
      violations.push({
        file: fileLabel,
        line,
        expression: conditionPathArg.getText(sourceFile),
        reason: 'path argument is not a condition-surface helper call',
      });
      continue;
    }

    if (!hasDirectNamedImport(sourceFile, '../contracts/index.js', helperCalleeName)) {
      const line = sourceFile.getLineAndCharacterOfPosition(conditionPathArg.getStart(sourceFile)).line + 1;
      violations.push({
        file: fileLabel,
        line,
        expression: conditionPathArg.getText(sourceFile),
        reason: 'condition-surface helper is not a direct named import from ../contracts/index.js',
      });
    }
  }

  return violations;
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
      violations.push(...collectConditionPathViolations(sourceFile, relative(engineRoot, absolutePath)));
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
        '- helper-like local wrappers that are not imported from ../contracts/index.js',
        '- helper aliases imported with `as` renaming (direct helper names only)',
        '- ad-hoc helper aliases/wrappers instead of condition-surface contract helpers',
        'Violations:',
        ...violations.map((violation) => `- ${violation.file}:${violation.line} (${violation.reason}) -> ${violation.expression}`),
      ].join('\n'),
    );
  });

  it('rejects same-name local helper wrappers even when callee text matches contracts helper naming', () => {
    const fixtureFile = 'validator-wrapper-fixture.ts';
    const source = `
      import { validateConditionAst } from './validate-gamedef-behavior.js';

      function appendQueryConditionSurfacePath(basePath: string, suffix: string): string {
        return basePath + suffix;
      }

      export function validateThing(diagnostics: unknown[], condition: unknown, context: unknown): void {
        validateConditionAst(diagnostics, condition, appendQueryConditionSurfacePath('actions[0].params[0].domain', '.where'), context);
      }
    `;
    const sourceFile = parseTypeScriptSource(source, fixtureFile);
    const violations = collectConditionPathViolations(sourceFile, fixtureFile);

    assert.equal(violations.length, 1, 'Local same-name wrappers must be rejected by import-origin policy.');
    assert.equal(
      violations[0]?.reason,
      'condition-surface helper is not a direct named import from ../contracts/index.js',
    );
  });
});
