import * as assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

type FlatConfigEntry = {
  readonly files?: readonly string[];
  readonly rules?: Record<string, unknown>;
};

describe('canonical hot-path conditional spread lint policy', () => {
  it('scopes the local rule to engine kernel and agents sources', async () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const eslintConfigPath = findRepoRootFile(thisDir, 'eslint.config.js');
    const module = (await import(pathToFileURL(eslintConfigPath).href)) as { default: FlatConfigEntry[] };
    const configEntries = module.default;

    const scopedEntry = configEntries.find((entry) =>
      entry.files?.includes('packages/engine/src/kernel/**/*.ts')
      && entry.files?.includes('packages/engine/src/agents/**/*.ts'),
    );
    assert.ok(scopedEntry, 'eslint config must contain a kernel/agents conditional-spread entry');
    assert.equal(
      scopedEntry.rules?.['local/no-conditional-spread'],
      'error',
      'conditional-spread lint policy must be enabled as an error',
    );
  });
});
