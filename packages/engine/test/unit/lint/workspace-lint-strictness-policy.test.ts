// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { findRepoRootFile } from '../../helpers/lint-policy-helpers.js';

type PackageJson = {
  readonly scripts?: Record<string, string>;
};

describe('workspace lint strictness policy', () => {
  it('requires package lint scripts to fail on warnings', () => {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = dirname(findRepoRootFile(thisDir, 'eslint.config.js'));
    const packagesRoot = resolve(repoRoot, 'packages');
    const packageJsonPaths = readdirSync(packagesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(packagesRoot, entry.name, 'package.json'));

    for (const packageJsonPath of packageJsonPaths) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson;
      const lintScript = packageJson.scripts?.lint;
      if (typeof lintScript !== 'string') {
        continue;
      }
      assert.match(
        lintScript,
        /(?:^|\s)--max-warnings(?:=|\s+)0(?:\s|$)/u,
        `${packageJsonPath} lint script must include --max-warnings 0`,
      );
    }
  });
});
