import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertModuleExportContract,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const freeOperationDiscoveryModule = 'src/kernel/free-operation-discovery-analysis.ts';
const expectedDiscoveryExports = [
  'FreeOperationDiscoveryAnalysisResult',
  'resolveFreeOperationDiscoveryAnalysis',
  'isFreeOperationApplicableForMove',
  'isFreeOperationAllowedDuringMonsoonForMove',
  'isFreeOperationGrantedForMove',
  'isFreeOperationPotentiallyGrantedForMove',
] as const;

describe('free-operation discovery export surface architecture guard', () => {
  it('exports only the curated discovery analysis API', () => {
    const source = readKernelSource(freeOperationDiscoveryModule);
    const sourceFile = parseTypeScriptSource(source, freeOperationDiscoveryModule);
    assertModuleExportContract(sourceFile, 'free-operation-discovery-analysis.ts', {
      expectedNamedExports: expectedDiscoveryExports,
      forbiddenNamedExports: ['doesGrantAuthorizeMove'],
    });
  });

  it('forbids re-exporting internal free-operation authorizer module through kernel barrel', () => {
    const indexSource = readKernelSource('src/kernel/index.ts');
    assert.doesNotMatch(
      indexSource,
      /['"]\.\/free-operation-grant-authorization\.js['"]/u,
      'kernel index.ts must not re-export internal free-operation grant authorization module',
    );
  });
});
