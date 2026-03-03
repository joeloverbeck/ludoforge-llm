import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findEnginePackageJson } from '../../helpers/lint-policy-helpers.js';

describe('engine build script clean policy', () => {
  it('cleans dist before TypeScript compilation to avoid stale test artifacts', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = findEnginePackageJson(thisDir);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      readonly scripts?: Record<string, string>;
    };
    const buildScript = packageJson.scripts?.build;

    assert.equal(typeof buildScript, 'string');
    assert.match(
      buildScript ?? '',
      /^pnpm run clean && /u,
      'packages/engine build script must clean dist before compiling',
    );
  });
});
