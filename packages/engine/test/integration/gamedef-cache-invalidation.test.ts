// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  loadGameSpecBundleFromEntrypoint,
  runGameSpecStagesFromBundle,
  type CompileResult,
} from '../../src/cnl/index.js';
import { assertValidatedGameDef } from '../../src/kernel/validate-gamedef.js';
import {
  deriveGameKeyFromEntrypoint,
  GAMEDEF_CACHE_FORMAT_VERSION,
  readGameDefCache,
  writeGameDefCache,
  type GameDefCacheKey,
} from '../helpers/gamedef-cache.js';

const ORIGINAL_CACHE_DIR = process.env.LUDOFORGE_GAMEDEF_CACHE_DIR;
const ORIGINAL_CACHE_MODE = process.env.LUDOFORGE_GAMEDEF_CACHE;
const REPO_ROOT = resolveRepoRoot();

afterEach(() => {
  restoreEnv();
});

describe('GameDef persistent cache invalidation', { concurrency: 1 }, () => {
  it('misses the persistent cache when source markdown content changes at the same entrypoint path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gamedef-cache-invalidation-'));
    try {
      process.env.LUDOFORGE_GAMEDEF_CACHE_DIR = dir;
      delete process.env.LUDOFORGE_GAMEDEF_CACHE;

      const entrypointPath = join(dir, 'compile-valid.game-spec.md');
      const originalMarkdown = readFileSync(
        resolve(REPO_ROOT, 'packages/engine/test/fixtures/cnl/compiler/compile-valid.md'),
        'utf8',
      );
      writeFileSync(entrypointPath, originalMarkdown, 'utf8');

      const originalBundle = loadGameSpecBundleFromEntrypoint(entrypointPath);
      const originalGameDef = compileGameDef(originalBundle);
      const originalKey = cacheKey(entrypointPath, originalBundle.sourceFingerprint);
      writeGameDefCache(originalKey, {
        gameDef: originalGameDef,
        sourceFingerprint: originalKey.sourceFingerprint,
        compilerStamp: '',
      });

      const originalCached = readGameDefCache(originalKey);
      assert.notEqual(originalCached, null, 'expected the original source fingerprint to read the cache entry');
      if (originalCached === null) {
        assert.fail('expected original cache entry after write');
      }

      const mutatedMarkdown = originalMarkdown.replace('id: compiler-valid', 'id: compiler-valid-mutated');
      assert.notEqual(mutatedMarkdown, originalMarkdown, 'test mutation must change the source markdown bytes');
      writeFileSync(entrypointPath, mutatedMarkdown, 'utf8');

      const mutatedBundle = loadGameSpecBundleFromEntrypoint(entrypointPath);
      assert.notEqual(
        mutatedBundle.sourceFingerprint,
        originalBundle.sourceFingerprint,
        'same-path source markdown mutation should change sourceFingerprint',
      );

      const mutatedKey = cacheKey(entrypointPath, mutatedBundle.sourceFingerprint);
      assert.equal(readGameDefCache(mutatedKey), null, 'new source fingerprint should not read the stale cache entry');

      const staleGameDef = assertValidatedGameDef(originalCached.gameDef);
      const mutatedGameDef = compileGameDef(mutatedBundle);
      assert.notEqual(
        JSON.stringify(mutatedGameDef),
        JSON.stringify(staleGameDef),
        'mutated source should compile to a different GameDef than the stale cached content',
      );
      assert.notEqual(readGameDefCache(originalKey), null, 'old cache entry remains readable only under its old key');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function compileGameDef(bundle: ReturnType<typeof loadGameSpecBundleFromEntrypoint>): NonNullable<CompileResult['gameDef']> {
  const staged = runGameSpecStagesFromBundle(bundle);
  assert.equal(staged.validation.blocked, false);
  assert.equal(staged.compilation.blocked, false);
  assert.deepEqual(staged.parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
  assert.deepEqual(staged.validation.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
  assert.notEqual(staged.compilation.result, null);
  if (staged.compilation.result === null) {
    assert.fail('expected compilation result');
  }
  assert.deepEqual(staged.compilation.result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'), []);
  assert.notEqual(staged.compilation.result.gameDef, null);
  if (staged.compilation.result.gameDef === null) {
    assert.fail('expected compiled GameDef');
  }
  return staged.compilation.result.gameDef;
}

function cacheKey(entrypointPath: string, sourceFingerprint: string): GameDefCacheKey {
  return {
    gameKey: deriveGameKeyFromEntrypoint(entrypointPath),
    sourceFingerprint,
    cacheFormatVersion: GAMEDEF_CACHE_FORMAT_VERSION,
  };
}

function restoreEnv(): void {
  setEnv('LUDOFORGE_GAMEDEF_CACHE_DIR', ORIGINAL_CACHE_DIR);
  setEnv('LUDOFORGE_GAMEDEF_CACHE', ORIGINAL_CACHE_MODE);
}

function setEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function resolveRepoRoot(): string {
  let cursor = dirname(fileURLToPath(import.meta.url));

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(resolve(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = resolve(cursor, '..');
  }

  return process.cwd();
}
