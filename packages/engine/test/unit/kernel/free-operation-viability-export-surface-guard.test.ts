// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertModuleExportContract,
  parseTypeScriptSource,
} from '../../helpers/kernel-source-ast-guard.js';
import { readKernelSource } from '../../helpers/kernel-source-guard.js';

const freeOperationViabilityModule = 'src/kernel/free-operation-viability.ts';
const expectedViabilityExports = [
  'DEFAULT_FREE_OPERATION_GRANT_VIABILITY_POLICY',
  'resolveFreeOperationGrantViabilityPolicy',
  'grantRequiresUsableProbe',
  'doesCompletedProbeMoveChangeGameplayState',
  'canResolveAmbiguousFreeOperationOverlapInCurrentState',
  'hasLegalCompletedFreeOperationMoveInCurrentState',
  'isFreeOperationGrantUsableInCurrentState',
] as const;

describe('free-operation viability export surface architecture guard', () => {
  it('exports only the curated viability API', () => {
    const source = readKernelSource(freeOperationViabilityModule);
    const sourceFile = parseTypeScriptSource(source, freeOperationViabilityModule);
    assertModuleExportContract(sourceFile, 'free-operation-viability.ts', {
      expectedNamedExports: expectedViabilityExports,
      forbiddenNamedExports: ['toPendingFreeOperationGrant'],
    });
  });

  it('re-exports free-operation viability API through kernel barrel', () => {
    const indexSource = readKernelSource('src/kernel/index.ts');
    assert.match(
      indexSource,
      /['"]\.\/free-operation-viability\.js['"]/u,
      'kernel index.ts must re-export free-operation-viability.ts',
    );
  });
});
