// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasImportWithModuleSubstring, parseTypeScriptSource } from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const importsModule = (sourcePath: string, modulePath: string): boolean => {
  const source = readKernelSource(sourcePath);
  const sourceFile = parseTypeScriptSource(source, sourcePath);
  return hasImportWithModuleSubstring(sourceFile, modulePath);
};

describe('kernel boundary cycle guard', () => {
  it('enforces expected forward edges and forbids legacy back-edge in turn-flow legality chain', () => {
    assert.equal(
      importsModule('src/kernel/free-operation-viability.ts', './microturn/continuation.js'),
      true,
      'free-operation-viability.ts must import microturn/continuation.ts',
    );
    assert.equal(
      importsModule('src/kernel/turn-flow-eligibility.ts', './free-operation-viability.js'),
      true,
      'turn-flow-eligibility.ts must import free-operation-viability.ts',
    );
    assert.equal(
      importsModule('src/kernel/microturn/continuation.ts', '../legal-choices.js'),
      true,
      'microturn/continuation.ts must import legal-choices.ts',
    );
    assert.equal(
      importsModule('src/kernel/legal-choices.ts', './turn-flow-eligibility.js'),
      false,
      'legal-choices.ts must not import turn-flow-eligibility.ts',
    );
  });
});
