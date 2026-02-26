import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listKernelModulesByPrefix, readKernelSource } from '../../helpers/kernel-source-guard.js';

const canonicalScopedWriteHelper = 'writeScopedVarsToState';
const branchScopedWriteHelpers = ['writeScopedVarToBranches', 'writeScopedVarsToBranches'] as const;
const removedSingularAlias = 'writeScopedVarToState';
const scopedVarRuntimeAccessModule = 'src/kernel/scoped-var-runtime-access.ts';

describe('scoped-var write surface architecture guard', () => {
  it('keeps branch-level scoped write helpers private and preserves one runtime write entry point', () => {
    const scopedVarSource = readKernelSource(scopedVarRuntimeAccessModule);

    assert.match(
      scopedVarSource,
      /\bexport const writeScopedVarsToState\b/u,
      'scoped-var-runtime-access.ts must export canonical writeScopedVarsToState',
    );

    for (const helperName of branchScopedWriteHelpers) {
      assert.doesNotMatch(
        scopedVarSource,
        new RegExp(`\\bexport\\s+(?:const|function)\\s+${helperName}\\b`, 'u'),
        `scoped-var-runtime-access.ts must not export ${helperName}`,
      );
    }

    assert.doesNotMatch(
      scopedVarSource,
      new RegExp(`\\b(?:export\\s+)?(?:const|function)\\s+${removedSingularAlias}\\b`, 'u'),
      'scoped-var-runtime-access.ts must not define legacy singular write alias',
    );
  });

  it('forbids effect modules from bypassing canonical scoped write helper', () => {
    const effectModules = listKernelModulesByPrefix('effects-');

    for (const moduleName of effectModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);

      for (const helperName of branchScopedWriteHelpers) {
        assert.doesNotMatch(
          source,
          new RegExp(`\\b${helperName}\\b`, 'u'),
          `${moduleName} must not use branch-level scoped write helper ${helperName}`,
        );
      }

      assert.doesNotMatch(
        source,
        new RegExp(`\\b${removedSingularAlias}\\b`, 'u'),
        `${moduleName} must not use removed singular scoped write alias ${removedSingularAlias}`,
      );
    }

    const effectsVarSource = readKernelSource('src/kernel/effects-var.ts');
    const effectsResourceSource = readKernelSource('src/kernel/effects-resource.ts');
    assert.match(
      effectsVarSource,
      new RegExp(`\\b${canonicalScopedWriteHelper}\\b`, 'u'),
      'effects-var.ts must use canonical writeScopedVarsToState',
    );
    assert.match(
      effectsResourceSource,
      new RegExp(`\\b${canonicalScopedWriteHelper}\\b`, 'u'),
      'effects-resource.ts must use canonical writeScopedVarsToState',
    );
  });
});
