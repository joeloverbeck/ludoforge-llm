import * as assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

function findEnginePackageJson(startDir: string): string {
  let current = startDir;
  while (true) {
    const candidate = resolve(current, 'package.json');
    if (existsSync(candidate)) {
      const parsed = JSON.parse(readFileSync(candidate, 'utf8')) as { readonly name?: string };
      if (parsed.name === '@ludoforge/engine') {
        return candidate;
      }
    }
    const parent = resolve(current, '..');
    if (parent === current) {
      throw new Error('Could not locate @ludoforge/engine package.json from test directory.');
    }
    current = parent;
  }
}

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
