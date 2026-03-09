import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertModuleExportContract,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const freeOperationSeatResolutionModule = 'src/kernel/free-operation-seat-resolution.ts';
const expectedSeatResolutionExports = [
  'resolveFreeOperationGrantSeatToken',
] as const;

describe('free-operation seat resolution export surface architecture guard', () => {
  it('exports only the curated seat-resolution API', () => {
    const source = readKernelSource(freeOperationSeatResolutionModule);
    const sourceFile = parseTypeScriptSource(source, freeOperationSeatResolutionModule);
    assertModuleExportContract(sourceFile, 'free-operation-seat-resolution.ts', {
      expectedNamedExports: expectedSeatResolutionExports,
    });
  });

  it('forbids re-exporting internal seat-resolution helper through kernel barrel', () => {
    const indexSource = readKernelSource('src/kernel/index.ts');
    assert.doesNotMatch(
      indexSource,
      /['"]\.\/free-operation-seat-resolution\.js['"]/u,
      'kernel index.ts must not re-export internal free-operation-seat-resolution module',
    );
  });
});
