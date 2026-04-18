// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

type FlatConfigEntry = {
  readonly files?: readonly string[];
  readonly rules?: Record<string, unknown>;
};

describe('effects/eval import boundary policy', () => {
  it('enforces no-restricted-imports for eval-error constructor imports in effects modules', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const eslintConfigPath = findRepoRootFile(thisDir, 'eslint.config.js');
    const module = (await import(pathToFileURL(eslintConfigPath).href)) as { default: FlatConfigEntry[] };
    const configEntries = module.default;

    const effectsEntry = configEntries.find((entry) =>
      entry.files?.includes('packages/engine/src/kernel/effects-*.ts'),
    );
    assert.ok(effectsEntry, 'eslint config must contain an effects-specific rules entry');

    const restrictedImports = effectsEntry.rules?.['no-restricted-imports'] as
      | [string, { patterns?: Array<{ group?: string[] }> }]
      | undefined;
    assert.ok(restrictedImports, 'effects lint entry must define no-restricted-imports');

    const [, options] = restrictedImports;
    const groups = (options.patterns ?? []).flatMap((pattern) => pattern.group ?? []);

    assert.ok(
      groups.includes('./eval-error.js'),
      'effects lint boundary must forbid direct ./eval-error.js imports',
    );
    assert.ok(
      groups.includes('./eval-error.ts'),
      'effects lint boundary must forbid direct ./eval-error.ts imports',
    );
  });
});
