import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageRoot, listTypeScriptFiles } from '../../helpers/lint-policy-helpers.js';

describe('query-runtime-cache removal policy', () => {
  it('removes legacy query-runtime-cache module and forbids imports', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const engineRoot = findEnginePackageRoot(thisDir);
    const kernelDir = resolve(engineRoot, 'src', 'kernel');
    const sourceFiles = [
      ...listTypeScriptFiles(resolve(engineRoot, 'src')),
      ...listTypeScriptFiles(resolve(engineRoot, 'test')),
    ].filter((file) => !file.endsWith('query-runtime-cache-ownership-policy.test.ts'))
      .filter((file) => !file.endsWith('query-runtime-cache-key-literal-ownership-policy.test.ts'));

    const legacyModulePath = resolve(kernelDir, 'query-runtime-cache.ts');
    const lingeringImports = sourceFiles.filter((file) => {
      try {
        const content = readFileSync(file, 'utf8');
        return content.includes('query-runtime-cache');
      } catch {
        return false;
      }
    });

    assert.equal(existsSync(legacyModulePath), false, 'Legacy src/kernel/query-runtime-cache.ts must not exist');
    assert.deepEqual(
      lingeringImports,
      [],
      [
        'Legacy query-runtime-cache imports are forbidden after canonical token-state-index adoption.',
        ...lingeringImports.map((file) => `- ${file}`),
      ].join('\n'),
    );
  });
});
