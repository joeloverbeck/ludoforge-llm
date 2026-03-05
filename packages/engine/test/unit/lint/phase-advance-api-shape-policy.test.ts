import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { parseTypeScriptSource, unwrapTypeScriptExpression } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const hasExportModifier = (modifiers: ts.NodeArray<ts.ModifierLike> | undefined): boolean =>
  modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

describe('phase-advance API shape policy', () => {
  it('keeps advancePhase as a single request-object parameter entrypoint', () => {
    const source = readKernelSource('src/kernel/phase-advance.ts');
    const sourceFile = parseTypeScriptSource(source, 'phase-advance.ts');

    const overloadDeclarations = sourceFile.statements.filter(
      (statement): statement is ts.FunctionDeclaration =>
        ts.isFunctionDeclaration(statement)
        && statement.name?.text === 'advancePhase',
    );
    assert.equal(
      overloadDeclarations.length,
      0,
      [
        'advancePhase must not be declared as function overload signatures.',
        'Expected canonical API: export const advancePhase = (request: AdvancePhaseRequest) => ...',
        'Remediation: remove overload/positional forms and keep one request-object parameter.',
      ].join('\n'),
    );

    const exportedVariableStatements = sourceFile.statements.filter(
      (statement): statement is ts.VariableStatement => ts.isVariableStatement(statement) && hasExportModifier(statement.modifiers),
    );
    const advancePhaseVariableDeclarations = exportedVariableStatements.flatMap((statement) =>
      statement.declarationList.declarations.filter(
        (declaration): declaration is ts.VariableDeclaration & { name: ts.Identifier } =>
          ts.isIdentifier(declaration.name) && declaration.name.text === 'advancePhase',
      ),
    );

    assert.equal(
      advancePhaseVariableDeclarations.length,
      1,
      [
        'advancePhase must be exported exactly once as a variable declaration.',
        'Expected canonical API: export const advancePhase = (request: AdvancePhaseRequest) => ...',
        'Remediation: keep a single exported declaration and remove aliases/shims.',
      ].join('\n'),
    );

    const advancePhaseDeclaration = advancePhaseVariableDeclarations[0];
    assert.notEqual(advancePhaseDeclaration, undefined, 'advancePhase declaration must exist for API-shape guard');
    if (advancePhaseDeclaration === undefined || advancePhaseDeclaration.initializer === undefined) {
      return;
    }

    const initializer = unwrapTypeScriptExpression(advancePhaseDeclaration.initializer);
    const callable =
      ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer) ? initializer : undefined;
    assert.notEqual(
      callable,
      undefined,
      [
        'advancePhase export must be a function value.',
        'Expected canonical API: export const advancePhase = (request: AdvancePhaseRequest) => ...',
      ].join('\n'),
    );
    if (callable === undefined) {
      return;
    }

    assert.equal(
      callable.parameters.length,
      1,
      [
        'advancePhase must accept exactly one parameter.',
        'Expected canonical API: advancePhase(request: AdvancePhaseRequest)',
        'Remediation: remove positional tails and overload-style parameter forms.',
      ].join('\n'),
    );

    const [requestParameter] = callable.parameters;
    assert.notEqual(requestParameter, undefined, 'advancePhase must declare request parameter');
    if (requestParameter === undefined) {
      return;
    }

    assert.equal(
      requestParameter.dotDotDotToken === undefined,
      true,
      'advancePhase request parameter must not be variadic; use one explicit request object.',
    );
    assert.equal(
      requestParameter.questionToken === undefined,
      true,
      'advancePhase request parameter must be required; do not allow optional positional fallback.',
    );
    assert.equal(
      ts.isIdentifier(requestParameter.name) && requestParameter.name.text === 'request',
      true,
      'advancePhase first parameter should be named request to keep contract intent explicit.',
    );
    assert.equal(
      requestParameter.type !== undefined
      && ts.isTypeReferenceNode(requestParameter.type)
      && ts.isIdentifier(requestParameter.type.typeName)
      && requestParameter.type.typeName.text === 'AdvancePhaseRequest',
      true,
      [
        'advancePhase parameter must be typed as AdvancePhaseRequest.',
        'Expected canonical API: advancePhase(request: AdvancePhaseRequest)',
        'Remediation: keep request-object contract type explicit and remove positional aliases.',
      ].join('\n'),
    );
  });
});
