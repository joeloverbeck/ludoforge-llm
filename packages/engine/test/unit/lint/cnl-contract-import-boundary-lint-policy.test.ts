import * as assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

type FlatConfigEntry = {
  readonly files?: readonly string[];
  readonly rules?: Record<string, unknown>;
};

describe('cnl contract import lint boundary policy', () => {
  it('enforces no-restricted-imports for kernel contract modules in CNL sources', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const eslintConfigPath = findRepoRootFile(thisDir, 'eslint.config.js');
    const module = (await import(pathToFileURL(eslintConfigPath).href)) as { default: FlatConfigEntry[] };
    const configEntries = module.default;

    const cnlEntry = configEntries.find((entry) =>
      entry.files?.includes('packages/engine/src/cnl/**/*.ts'),
    );
    assert.ok(cnlEntry, 'eslint config must contain a CNL-specific rules entry');

    const restrictedImports = cnlEntry.rules?.['no-restricted-imports'] as [string, { patterns?: Array<{ group?: string[] }> }] | undefined;
    assert.ok(restrictedImports, 'CNL lint entry must define no-restricted-imports');

    const [, options] = restrictedImports;
    const groups = (options.patterns ?? []).flatMap((pattern) => pattern.group ?? []);
    assert.ok(
      groups.includes('**/kernel/*contract*.js'),
      'CNL lint boundary must forbid kernel contract .js imports',
    );
    assert.ok(
      groups.includes('**/kernel/*contract*.ts'),
      'CNL lint boundary must forbid kernel contract .ts imports',
    );
  });
});
