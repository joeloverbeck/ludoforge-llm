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

const collectNamedImportsByModule = (sourceFile: ts.SourceFile): ReadonlyMap<string, readonly string[]> => {
  const imports = new Map<string, string[]>();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (statement.importClause?.namedBindings === undefined || !ts.isNamedImports(statement.importClause.namedBindings)) {
      continue;
    }
    imports.set(
      statement.moduleSpecifier.text,
      statement.importClause.namedBindings.elements.map((element) => element.name.text),
    );
  }
  return imports;
};

const collectNamedReExportsByModule = (sourceFile: ts.SourceFile): ReadonlyMap<string, readonly string[]> => {
  const exports = new Map<string, string[]>();
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) {
      continue;
    }
    const moduleSpecifier = statement.moduleSpecifier;
    if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) {
      continue;
    }
    if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) {
      continue;
    }
    exports.set(
      moduleSpecifier.text,
      statement.exportClause.elements.map((element) => element.name.text),
    );
  }
  return exports;
};

describe('turn-flow invariant contract source guard', () => {
  it('keeps runtime invariant emitters wired to the canonical invariant-contract module', () => {
    const runtimeInvariantSource = readKernelSource('src/kernel/turn-flow-runtime-invariants.ts');
    const effectTurnFlowSource = readKernelSource('src/kernel/effects-turn-flow.ts');

    const runtimeInvariantImports = collectImportSpecifiers(
      parseTypeScriptSource(runtimeInvariantSource, 'turn-flow-runtime-invariants.ts'),
    );
    const effectTurnFlowImports = collectImportSpecifiers(
      parseTypeScriptSource(effectTurnFlowSource, 'effects-turn-flow.ts'),
    );

    assert.equal(
      runtimeInvariantImports.includes('./turn-flow-invariant-contracts.js'),
      true,
      'turn-flow-runtime-invariants.ts must import canonical invariant builders/messages',
    );
    assert.equal(
      effectTurnFlowImports.includes('./turn-flow-invariant-contracts.js'),
      true,
      'effects-turn-flow.ts must import canonical invariant builders/messages',
    );
  });

  it('prevents literal invariant/message drift in emitter call sites', () => {
    const runtimeInvariantSource = readKernelSource('src/kernel/turn-flow-runtime-invariants.ts');
    const effectTurnFlowSource = readKernelSource('src/kernel/effects-turn-flow.ts');

    for (const source of [runtimeInvariantSource, effectTurnFlowSource]) {
      assert.equal(
        source.includes('turnFlow.activeSeat.unresolvable'),
        false,
        'emitters must not inline active-seat invariant literal ids',
      );
      assert.equal(
        source.includes('turnFlow.cardMetadataSeatOrder.shapeInvalid'),
        false,
        'emitters must not inline card seat-order invariant literal ids',
      );
      assert.equal(
        source.includes('could not resolve active seat'),
        false,
        'emitters must not inline active-seat invariant message text',
      );
      assert.equal(
        source.includes('card metadata seat order shape invalid'),
        false,
        'emitters must not inline card seat-order invariant message text',
      );
    }
  });

  it('enforces canonical module ownership for active-seat invariant surface types', () => {
    const invariantContractsSource = readKernelSource('src/kernel/turn-flow-invariant-contracts.ts');
    const helperSource = readKernelSource('test/helpers/active-seat-invariant-parity-helpers.ts');

    const invariantContractsExports = collectNamedReExportsByModule(
      parseTypeScriptSource(invariantContractsSource, 'turn-flow-invariant-contracts.ts'),
    );
    const helperImports = collectNamedImportsByModule(
      parseTypeScriptSource(helperSource, 'active-seat-invariant-parity-helpers.ts'),
    );

    assert.equal(
      invariantContractsExports
        .get('./turn-flow-active-seat-invariant-surfaces.js')
        ?.includes('TurnFlowActiveSeatInvariantSurface') ?? false,
      false,
      'turn-flow-invariant-contracts.ts must not re-export TurnFlowActiveSeatInvariantSurface',
    );
    assert.equal(
      helperImports
        .get('../../src/kernel/turn-flow-active-seat-invariant-surfaces.js')
        ?.includes('TurnFlowActiveSeatInvariantSurface') ?? false,
      true,
      'active-seat-invariant-parity-helpers.ts must import TurnFlowActiveSeatInvariantSurface from owner module',
    );
  });
});
