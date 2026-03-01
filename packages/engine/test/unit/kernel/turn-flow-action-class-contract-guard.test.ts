import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const collectImportSpecifiers = (sourceFile: ts.SourceFile): readonly string[] => {
  const imports: string[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    imports.push(statement.moduleSpecifier.text);
  }
  return imports;
};

const ACTION_CLASS_UNION_LITERAL_PATTERN =
  /'pass'\s*\|\s*'event'\s*\|\s*'operation'\s*\|\s*'limitedOperation'\s*\|\s*'operationPlusSpecialActivity'/;

describe('turn-flow action-class canonical contract guard', () => {
  it('keeps canonical action-class values in the dedicated contract module', () => {
    const source = readKernelSource('src/contracts/turn-flow-action-class-contract.ts');

    assert.match(
      source,
      /export const TURN_FLOW_ACTION_CLASS_VALUES = \[[\s\S]*'pass',[\s\S]*'event',[\s\S]*'operation',[\s\S]*'limitedOperation',[\s\S]*'operationPlusSpecialActivity',[\s\S]*\] as const;/,
      'turn-flow-action-class-contract.ts must define canonical action-class literal values',
    );
    assert.match(
      source,
      /export type TurnFlowActionClass = \(typeof TURN_FLOW_ACTION_CLASS_VALUES\)\[number\];/,
      'turn-flow-action-class-contract.ts must derive TurnFlowActionClass from canonical values',
    );
    assert.match(
      source,
      /export const isTurnFlowActionClass = \(value: string\): value is TurnFlowActionClass =>/,
      'turn-flow-action-class-contract.ts must expose a canonical runtime guard',
    );
  });

  it('requires key consumers to import canonical action-class contracts', () => {
    const schemaSource = parseTypeScriptSource(
      readKernelSource('src/kernel/schemas-extensions.ts'),
      'schemas-extensions.ts',
    );
    const eligibilitySource = parseTypeScriptSource(
      readKernelSource('src/kernel/turn-flow-eligibility.ts'),
      'turn-flow-eligibility.ts',
    );
    const effectsSource = parseTypeScriptSource(
      readKernelSource('src/kernel/effects-turn-flow.ts'),
      'effects-turn-flow.ts',
    );
    const behaviorValidationSource = parseTypeScriptSource(
      readKernelSource('src/kernel/validate-gamedef-behavior.ts'),
      'validate-gamedef-behavior.ts',
    );

    assert.equal(
      collectImportSpecifiers(schemaSource).includes('../contracts/turn-flow-action-class-contract.js'),
      true,
      'schemas-extensions.ts must consume canonical action-class values',
    );
    assert.equal(
      collectImportSpecifiers(eligibilitySource).includes('../contracts/turn-flow-action-class-contract.js'),
      true,
      'turn-flow-eligibility.ts must consume canonical runtime action-class guard',
    );
    assert.equal(
      collectImportSpecifiers(effectsSource).includes('../contracts/turn-flow-action-class-contract.js'),
      true,
      'effects-turn-flow.ts must consume canonical runtime action-class guard',
    );
    assert.equal(
      collectImportSpecifiers(behaviorValidationSource).includes('../contracts/turn-flow-action-class-contract.js'),
      true,
      'validate-gamedef-behavior.ts must consume canonical action-class values',
    );
  });

  it('forbids reintroducing hardcoded full action-class union literals in key consumers', () => {
    const sources = [
      readKernelSource('src/kernel/types-turn-flow.ts'),
      readKernelSource('src/kernel/schemas-extensions.ts'),
      readKernelSource('src/kernel/turn-flow-eligibility.ts'),
      readKernelSource('src/kernel/effects-turn-flow.ts'),
      readKernelSource('src/kernel/types-ast.ts'),
      readKernelSource('src/kernel/legal-moves-turn-order.ts'),
      readKernelSource('src/kernel/validate-gamedef-behavior.ts'),
    ];

    for (const source of sources) {
      assert.equal(
        ACTION_CLASS_UNION_LITERAL_PATTERN.test(source),
        false,
        'canonical consumers must not redeclare full action-class union literal sequences',
      );
    }
  });
});
