import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listKernelModulesByPrefix, readKernelSource } from '../../helpers/kernel-source-guard.js';

const malformedSupportModules = ['effects-resource.ts'] as const;

const strictResolverName = 'resolveRuntimeScopedEndpoint';
const tolerantResolverName = 'resolveRuntimeScopedEndpointWithMalformedSupport';
const anyScopedResolverPattern = /\bresolveRuntimeScopedEndpoint(?:WithMalformedSupport)?\b/u;

describe('effect scoped-endpoint resolver architecture guard', () => {
  it('keeps tolerant scoped-endpoint resolver usage isolated to malformed-boundary modules', () => {
    const effectModules = listKernelModulesByPrefix('effects-');
    const malformedSupportAllowset = new Set<string>(malformedSupportModules);

    for (const moduleName of malformedSupportModules) {
      assert.equal(
        effectModules.includes(moduleName),
        true,
        `Malformed-support allowlist includes unknown effect module: ${moduleName}`,
      );
    }

    for (const moduleName of effectModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      if (malformedSupportAllowset.has(moduleName)) {
        assert.match(
          source,
          new RegExp(`\\b${tolerantResolverName}\\b`, 'u'),
          `${moduleName} must explicitly use ${tolerantResolverName} for malformed-boundary handling`,
        );
        continue;
      }

      assert.doesNotMatch(
        source,
        new RegExp(`\\b${tolerantResolverName}\\b`, 'u'),
        `${moduleName} must not import/use tolerant scoped-endpoint resolver`,
      );

      if (anyScopedResolverPattern.test(source)) {
        assert.match(
          source,
          new RegExp(`\\b${strictResolverName}\\b`, 'u'),
          `${moduleName} must route scoped endpoint resolution through strict ${strictResolverName}`,
        );
      }
    }
  });
});
