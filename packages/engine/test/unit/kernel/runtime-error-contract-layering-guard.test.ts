import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import ts from 'typescript';
import { assertModuleExportContract, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
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

describe('runtime error contract layering guard', () => {
  it('keeps runtime-error.ts contract imports implementation-agnostic', () => {
    const source = readKernelSource('src/kernel/runtime-error.ts');
    const sourceFile = parseTypeScriptSource(source, 'runtime-error.ts');
    const imports = collectImportSpecifiers(sourceFile);
    const relativeImports = [...new Set(imports.filter((specifier) => specifier.startsWith('./')))].sort();

    assert.deepEqual(
      relativeImports,
      [
        './action-selector-contract-registry.js',
        './free-operation-denial-contract.js',
        './runtime-reasons.js',
        './types.js',
      ],
      'runtime-error.ts must import only canonical contract/primitive kernel modules',
    );
    assert.equal(
      imports.includes('./turn-flow-eligibility.js'),
      false,
      'runtime-error.ts must not import turn-flow-eligibility implementation module',
    );
  });

  it('keeps free-operation-denial-contract.ts as a pure contract module', () => {
    const source = readKernelSource('src/kernel/free-operation-denial-contract.ts');
    const sourceFile = parseTypeScriptSource(source, 'free-operation-denial-contract.ts');
    const imports = collectImportSpecifiers(sourceFile);

    assert.deepEqual(imports, [], 'free-operation-denial-contract.ts must remain import-free and implementation-agnostic');
    assertModuleExportContract(sourceFile, 'free-operation-denial-contract.ts', {
      expectedNamedExports: [
        'FreeOperationActionClass',
        'FreeOperationBlockCause',
        'FreeOperationBlockExplanation',
      ],
    });
  });
});
