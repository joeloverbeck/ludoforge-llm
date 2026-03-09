import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectNamedImportsByLocalName,
  hasImportWithModuleSubstring,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

describe('free-operation discovery boundary architecture guard', () => {
  it('routes legal-choices free-operation analysis through dedicated discovery module', () => {
    const source = readKernelSource('src/kernel/legal-choices.ts');
    const sourceFile = parseTypeScriptSource(source, 'legal-choices.ts');
    const discoveryImports = collectNamedImportsByLocalName(sourceFile, './free-operation-discovery-analysis.js');

    assert.equal(
      discoveryImports.get('resolveFreeOperationDiscoveryAnalysis'),
      'resolveFreeOperationDiscoveryAnalysis',
      'legal-choices.ts must import resolveFreeOperationDiscoveryAnalysis from free-operation-discovery-analysis.ts',
    );

    const legacyImports = collectNamedImportsByLocalName(sourceFile, './turn-flow-eligibility.js');
    assert.equal(
      legacyImports.has('resolveFreeOperationDiscoveryAnalysis'),
      false,
      'legal-choices.ts must not import resolveFreeOperationDiscoveryAnalysis from turn-flow-eligibility.ts',
    );
    assert.equal(
      hasImportWithModuleSubstring(sourceFile, './turn-flow-eligibility.js'),
      false,
      'legal-choices.ts must not import turn-flow-eligibility.ts directly',
    );
  });
});
