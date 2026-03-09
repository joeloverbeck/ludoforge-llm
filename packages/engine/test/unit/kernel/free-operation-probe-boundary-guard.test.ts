import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectNamedImportsByLocalName,
  hasImportWithModuleSubstring,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('free-operation probe boundary architecture guard', () => {
  it('routes viability probe move checks through discovery analysis contract', () => {
    const source = readKernelSource('src/kernel/free-operation-viability.ts');
    const sourceFile = parseTypeScriptSource(source, 'free-operation-viability.ts');
    const discoveryImports = collectNamedImportsByLocalName(sourceFile, './free-operation-discovery-analysis.js');

    assert.equal(
      discoveryImports.get('isFreeOperationApplicableForMove'),
      'isFreeOperationApplicableForMove',
      'free-operation-viability.ts must import isFreeOperationApplicableForMove from free-operation-discovery-analysis.ts',
    );
    assert.equal(
      discoveryImports.get('isFreeOperationGrantedForMove'),
      'isFreeOperationGrantedForMove',
      'free-operation-viability.ts must import isFreeOperationGrantedForMove from free-operation-discovery-analysis.ts',
    );
  });

  it('forbids direct viability imports from execution-only grant authorization helpers', () => {
    const source = readKernelSource('src/kernel/free-operation-viability.ts');
    const sourceFile = parseTypeScriptSource(source, 'free-operation-viability.ts');

    assert.equal(
      hasImportWithModuleSubstring(sourceFile, './free-operation-grant-authorization.js'),
      false,
      'free-operation-viability.ts must not import free-operation-grant-authorization.ts directly',
    );
  });
});
