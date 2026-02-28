import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { getObjectPropertyExpression, parseTypeScriptSource, unwrapTypeScriptExpression } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const getExportedArrowFunction = (
  sourceFile: ts.SourceFile,
  identifier: string,
): ts.ArrowFunction => {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    const isExported = statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (!isExported) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== identifier || declaration.initializer === undefined) {
        continue;
      }
      const initializer = unwrapTypeScriptExpression(declaration.initializer);
      assert.ok(
        ts.isArrowFunction(initializer),
        `${identifier} must be declared as an exported arrow-function constructor`,
      );
      if (ts.isArrowFunction(initializer)) {
        return initializer;
      }
    }
  }

  assert.fail(`Missing exported constructor: ${identifier}`);
};

const getReturnedExpression = (fn: ts.ArrowFunction, label: string): ts.Expression => {
  if (!ts.isBlock(fn.body)) {
    return unwrapTypeScriptExpression(fn.body);
  }

  const returnStatements = fn.body.statements.filter((statement): statement is ts.ReturnStatement => ts.isReturnStatement(statement));
  assert.equal(returnStatements.length, 1, `${label} must have exactly one return statement`);
  const returnExpression = returnStatements[0]?.expression;
  assert.ok(returnExpression !== undefined, `${label} must return a value`);
  if (returnExpression === undefined) {
    assert.fail(`${label} missing return expression`);
  }
  return unwrapTypeScriptExpression(returnExpression);
};

const getReturnedObjectLiteral = (fn: ts.ArrowFunction, label: string): ts.ObjectLiteralExpression => {
  const expression = getReturnedExpression(fn, label);
  assert.ok(ts.isObjectLiteralExpression(expression), `${label} must return an object literal`);
  if (!ts.isObjectLiteralExpression(expression)) {
    assert.fail(`${label} must return an object literal`);
  }
  return expression;
};

const assertStringProperty = (
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
  expected: string,
  label: string,
): void => {
  const propertyExpression = getObjectPropertyExpression(objectLiteral, propertyName);
  assert.ok(propertyExpression !== undefined, `${label} must include ${propertyName}`);
  if (propertyExpression === undefined) {
    return;
  }
  const valueExpression = unwrapTypeScriptExpression(propertyExpression);
  assert.ok(
    ts.isStringLiteral(valueExpression) || ts.isNoSubstitutionTemplateLiteral(valueExpression),
    `${label} ${propertyName} must be a string literal`,
  );
  if (!ts.isStringLiteral(valueExpression) && !ts.isNoSubstitutionTemplateLiteral(valueExpression)) {
    return;
  }
  assert.equal(valueExpression.text, expected, `${label} ${propertyName} must be '${expected}'`);
};

const assertDecisionAuthorityPlayerDefault = (fn: ts.ArrowFunction, label: string): void => {
  assert.ok(ts.isBlock(fn.body), `${label} must destructure options in a block body`);
  if (!ts.isBlock(fn.body)) {
    return;
  }

  const destructuringDeclaration = fn.body.statements
    .filter((statement): statement is ts.VariableStatement => ts.isVariableStatement(statement))
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) => {
      if (!ts.isObjectBindingPattern(declaration.name) || declaration.initializer === undefined) {
        return false;
      }
      const initializer = unwrapTypeScriptExpression(declaration.initializer);
      return ts.isIdentifier(initializer) && initializer.text === 'options';
    });

  assert.ok(destructuringDeclaration !== undefined, `${label} must destructure activePlayer and decisionAuthorityPlayer from options`);
  if (destructuringDeclaration === undefined || !ts.isObjectBindingPattern(destructuringDeclaration.name)) {
    return;
  }

  const decisionAuthorityBinding = destructuringDeclaration.name.elements.find((element) => {
    const bindingName = ts.isIdentifier(element.name) ? element.name.text : '';
    const propertyName =
      element.propertyName !== undefined && ts.isIdentifier(element.propertyName)
        ? element.propertyName.text
        : bindingName;
    return propertyName === 'decisionAuthorityPlayer';
  });

  assert.ok(decisionAuthorityBinding !== undefined, `${label} must bind decisionAuthorityPlayer from options`);
  if (decisionAuthorityBinding === undefined || decisionAuthorityBinding.initializer === undefined) {
    assert.fail(`${label} must default decisionAuthorityPlayer to activePlayer`);
  }

  const bindingDefault = unwrapTypeScriptExpression(decisionAuthorityBinding.initializer);
  assert.ok(
    ts.isIdentifier(bindingDefault) && bindingDefault.text === 'activePlayer',
    `${label} must default decisionAuthorityPlayer to activePlayer`,
  );
};

const assertRuntimeAuthorityConstructor = (
  sourceFile: ts.SourceFile,
  constructorName: 'createExecutionEffectContext' | 'createDiscoveryStrictEffectContext' | 'createDiscoveryProbeEffectContext',
  expectedMode: 'execution' | 'discovery',
  expectedOwnershipEnforcement: 'strict' | 'probe',
): void => {
  const constructor = getExportedArrowFunction(sourceFile, constructorName);
  const returnedObject = getReturnedObjectLiteral(constructor, constructorName);
  const decisionAuthorityExpression = getObjectPropertyExpression(returnedObject, 'decisionAuthority');
  assert.ok(decisionAuthorityExpression !== undefined, `${constructorName} must include decisionAuthority`);
  if (decisionAuthorityExpression === undefined) {
    return;
  }

  const authorityObject = unwrapTypeScriptExpression(decisionAuthorityExpression);
  assert.ok(ts.isObjectLiteralExpression(authorityObject), `${constructorName} decisionAuthority must be an object literal`);
  if (!ts.isObjectLiteralExpression(authorityObject)) {
    return;
  }

  assertStringProperty(authorityObject, 'source', 'engineRuntime', `${constructorName} decisionAuthority`);
  assertStringProperty(
    authorityObject,
    'ownershipEnforcement',
    expectedOwnershipEnforcement,
    `${constructorName} decisionAuthority`,
  );
  assertStringProperty(returnedObject, 'mode', expectedMode, constructorName);

  const playerExpression = getObjectPropertyExpression(authorityObject, 'player');
  assert.ok(playerExpression !== undefined, `${constructorName} decisionAuthority must include player`);
  if (playerExpression !== undefined) {
    const playerIdentifier = unwrapTypeScriptExpression(playerExpression);
    assert.ok(
      ts.isIdentifier(playerIdentifier) && playerIdentifier.text === 'decisionAuthorityPlayer',
      `${constructorName} decisionAuthority.player must reference decisionAuthorityPlayer`,
    );
  }

  assertDecisionAuthorityPlayerDefault(constructor, constructorName);
};

const assertDiscoveryWrapperDelegation = (sourceFile: ts.SourceFile): void => {
  const wrapperConstructor = getExportedArrowFunction(sourceFile, 'createDiscoveryEffectContext');
  const returnedExpression = getReturnedExpression(wrapperConstructor, 'createDiscoveryEffectContext');
  assert.ok(
    ts.isConditionalExpression(returnedExpression),
    'createDiscoveryEffectContext must return a strict/probe conditional delegation',
  );
  if (!ts.isConditionalExpression(returnedExpression)) {
    return;
  }

  const condition = unwrapTypeScriptExpression(returnedExpression.condition);
  assert.ok(
    ts.isBinaryExpression(condition) &&
      condition.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isIdentifier(condition.left) &&
      condition.left.text === 'ownershipEnforcement' &&
      (ts.isStringLiteral(condition.right) || ts.isNoSubstitutionTemplateLiteral(condition.right)) &&
      condition.right.text === 'probe',
    'createDiscoveryEffectContext must branch on ownershipEnforcement === \"probe\"',
  );

  const probeBranch = unwrapTypeScriptExpression(returnedExpression.whenTrue);
  const strictBranch = unwrapTypeScriptExpression(returnedExpression.whenFalse);
  const probeArg = ts.isCallExpression(probeBranch) ? probeBranch.arguments[0] : undefined;
  const strictArg = ts.isCallExpression(strictBranch) ? strictBranch.arguments[0] : undefined;
  assert.ok(
    ts.isCallExpression(probeBranch) &&
      ts.isIdentifier(probeBranch.expression) &&
      probeBranch.expression.text === 'createDiscoveryProbeEffectContext' &&
      probeBranch.arguments.length === 1 &&
      probeArg !== undefined &&
      ts.isIdentifier(probeArg) &&
      probeArg.text === 'options',
    'createDiscoveryEffectContext probe branch must delegate to createDiscoveryProbeEffectContext(options)',
  );
  assert.ok(
    ts.isCallExpression(strictBranch) &&
      ts.isIdentifier(strictBranch.expression) &&
      strictBranch.expression.text === 'createDiscoveryStrictEffectContext' &&
      strictBranch.arguments.length === 1 &&
      strictArg !== undefined &&
      ts.isIdentifier(strictArg) &&
      strictArg.text === 'options',
    'createDiscoveryEffectContext strict branch must delegate to createDiscoveryStrictEffectContext(options)',
  );
};

describe('effect-context construction contract', () => {
  it('keeps runtime authority defaults centralized in effect-context constructors', () => {
    const source = readKernelSource('src/kernel/effect-context.ts');
    const sourceFile = parseTypeScriptSource(source, 'effect-context.ts');

    assertRuntimeAuthorityConstructor(
      sourceFile,
      'createExecutionEffectContext',
      'execution',
      'strict',
    );
    assertRuntimeAuthorityConstructor(
      sourceFile,
      'createDiscoveryStrictEffectContext',
      'discovery',
      'strict',
    );
    assertRuntimeAuthorityConstructor(
      sourceFile,
      'createDiscoveryProbeEffectContext',
      'discovery',
      'probe',
    );
    assertDiscoveryWrapperDelegation(sourceFile);
  });
});
