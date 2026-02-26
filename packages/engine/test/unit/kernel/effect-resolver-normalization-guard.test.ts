import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { listKernelModulesByPrefix, readKernelSource } from '../../helpers/kernel-source-guard.js';

const selectorNormalizedModules = {
  'effects-choice.ts': ['resolveZoneWithNormalization'],
  'effects-reveal.ts': ['resolveZoneWithNormalization', 'resolvePlayersWithNormalization'],
  'effects-token.ts': ['resolveZoneWithNormalization'],
  'effects-var.ts': ['resolveSinglePlayerWithNormalization'],
} as const satisfies Readonly<Record<string, readonly string[]>>;

const selectorFreeModules = [
  'effects-binding.ts',
  'effects-control.ts',
  'effects-resource.ts',
  'effects-subset.ts',
  'effects-turn-flow.ts',
] as const;

const prohibitedDirectResolvers = ['resolveZoneRef', 'resolvePlayerSel'] as const;

describe('effect resolver normalization architecture guard', () => {
  it('keeps effect handler resolver usage aligned with normalization policy', () => {
    const actualEffectModules = listKernelModulesByPrefix('effects-');
    const policyModules = [...Object.keys(selectorNormalizedModules), ...selectorFreeModules].sort();
    assert.deepEqual(
      actualEffectModules,
      policyModules,
      'Effect module policy list must stay in sync with src/kernel/effects-*.ts modules',
    );

    for (const moduleName of actualEffectModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      for (const resolver of prohibitedDirectResolvers) {
        assert.doesNotMatch(
          source,
          new RegExp(`\\b${resolver}\\b`, 'u'),
          `${moduleName} must not use direct ${resolver}; route via selector-resolution-normalization`,
        );
      }
    }

    for (const [moduleName, requiredHelpers] of Object.entries(selectorNormalizedModules)) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      for (const helperName of requiredHelpers) {
        assert.match(
          source,
          new RegExp(`\\b${helperName}\\b`, 'u'),
          `${moduleName} must resolve selectors/zones via ${helperName}`,
        );
      }
    }

    for (const moduleName of selectorFreeModules) {
      const source = readKernelSource(`src/kernel/${moduleName}`);
      assert.doesNotMatch(
        source,
        /\bresolve(?:Zone|Players|SinglePlayer)WithNormalization\b/u,
        `${moduleName} is expected to be selector-free and not depend on selector normalization helpers`,
      );
    }
  });
});
