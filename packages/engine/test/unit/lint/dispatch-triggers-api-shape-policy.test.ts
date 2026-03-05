import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { parseTypeScriptSource, unwrapTypeScriptExpression } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const hasExportModifier = (modifiers: ts.NodeArray<ts.ModifierLike> | undefined): boolean =>
  modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

describe('dispatchTriggers API shape policy', () => {
  it('keeps dispatchTriggers as a single request-object parameter entrypoint', () => {
    const source = readKernelSource('src/kernel/trigger-dispatch.ts');
    const sourceFile = parseTypeScriptSource(source, 'trigger-dispatch.ts');

    const overloadDeclarations = sourceFile.statements.filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement)
        && statement.name?.text === 'dispatchTriggers',
    );
    assert.equal(
      overloadDeclarations.length,
      0,
      [
        'dispatchTriggers must not be declared as function overload signatures.',
        'Expected canonical API: export const dispatchTriggers = (request: DispatchTriggersRequest) => ...',
        'Remediation: remove overload/positional forms and keep one request-object parameter.',
      ].join('\n'),
    );

    const exportedVariableStatements = sourceFile.statements.filter(
      (statement): statement is ts.VariableStatement => ts.isVariableStatement(statement) && hasExportModifier(statement.modifiers),
    );
    const dispatchVariableDeclarations = exportedVariableStatements.flatMap((statement) =>
      statement.declarationList.declarations.filter(
        (declaration): declaration is ts.VariableDeclaration & { name: ts.Identifier } =>
          ts.isIdentifier(declaration.name) && declaration.name.text === 'dispatchTriggers',
      ),
    );

    assert.equal(
      dispatchVariableDeclarations.length,
      1,
      [
        'dispatchTriggers must be exported exactly once as a variable declaration.',
        'Expected canonical API: export const dispatchTriggers = (request: DispatchTriggersRequest) => ...',
        'Remediation: keep a single exported declaration and remove aliases/shims.',
      ].join('\n'),
    );

    const dispatchDeclaration = dispatchVariableDeclarations[0];
    assert.notEqual(dispatchDeclaration, undefined, 'dispatchTriggers declaration must exist for API-shape guard');
    if (dispatchDeclaration === undefined || dispatchDeclaration.initializer === undefined) {
      return;
    }

    const initializer = unwrapTypeScriptExpression(dispatchDeclaration.initializer);
    const callable =
      ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer) ? initializer : undefined;
    assert.notEqual(
      callable,
      undefined,
      [
        'dispatchTriggers export must be a function value.',
        'Expected canonical API: export const dispatchTriggers = (request: DispatchTriggersRequest) => ...',
      ].join('\n'),
    );
    if (callable === undefined) {
      return;
    }

    assert.equal(
      callable.parameters.length,
      1,
      [
        'dispatchTriggers must accept exactly one parameter.',
        'Expected canonical API: dispatchTriggers(request: DispatchTriggersRequest)',
        'Remediation: remove positional tails and overload-style parameter forms.',
      ].join('\n'),
    );

    const [requestParameter] = callable.parameters;
    assert.notEqual(requestParameter, undefined, 'dispatchTriggers must declare request parameter');
    if (requestParameter === undefined) {
      return;
    }

    assert.equal(
      requestParameter.dotDotDotToken === undefined,
      true,
      'dispatchTriggers request parameter must not be variadic; use one explicit request object.',
    );
    assert.equal(
      requestParameter.questionToken === undefined,
      true,
      'dispatchTriggers request parameter must be required; do not allow optional positional fallback.',
    );
    assert.equal(
      ts.isIdentifier(requestParameter.name) && requestParameter.name.text === 'request',
      true,
      'dispatchTriggers first parameter should be named request to keep contract intent explicit.',
    );
    assert.equal(
      requestParameter.type !== undefined
      && ts.isTypeReferenceNode(requestParameter.type)
      && ts.isIdentifier(requestParameter.type.typeName)
      && requestParameter.type.typeName.text === 'DispatchTriggersRequest',
      true,
      [
        'dispatchTriggers parameter must be typed as DispatchTriggersRequest.',
        'Expected canonical API: dispatchTriggers(request: DispatchTriggersRequest)',
        'Remediation: keep request-object contract type explicit and remove positional aliases.',
      ].join('\n'),
    );
  });
});
