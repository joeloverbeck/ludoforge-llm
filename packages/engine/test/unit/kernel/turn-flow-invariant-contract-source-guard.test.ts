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
});
