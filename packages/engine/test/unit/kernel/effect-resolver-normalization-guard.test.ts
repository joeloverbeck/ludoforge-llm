import * as assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const readKernelSource = (relativePath: string): string => {
  const candidates = [join(process.cwd(), relativePath), join(process.cwd(), 'packages/engine', relativePath)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readFileSync(candidate, 'utf8');
    }
  }

  throw new Error(`Could not find kernel source file for guard: ${relativePath}`);
};

const listEffectModules = (): readonly string[] => {
  const candidates = [join(process.cwd(), 'src/kernel'), join(process.cwd(), 'packages/engine/src/kernel')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return readdirSync(candidate)
        .filter((name) => name.startsWith('effects-') && name.endsWith('.ts'))
        .sort();
    }
  }

  throw new Error('Could not find kernel source directory for effect guard');
};

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
    const actualEffectModules = listEffectModules();
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
