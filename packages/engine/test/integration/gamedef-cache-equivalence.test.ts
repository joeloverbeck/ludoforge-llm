// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadGameSpecBundleFromEntrypoint, type CompileResult } from '../../src/cnl/index.js';
import {
  clearGameDefCache,
  deriveGameKeyFromEntrypoint,
  GAMEDEF_CACHE_FORMAT_VERSION,
  writeGameDefCache,
} from '../helpers/gamedef-cache.js';
import { createValidGameDef } from '../helpers/gamedef-fixtures.js';
import {
  __resetProductionSpecCacheForTests,
  compileProductionSpec,
  compileTexasProductionSpec,
} from '../helpers/production-spec-helpers.js';

const ORIGINAL_CACHE_DIR = process.env.LUDOFORGE_GAMEDEF_CACHE_DIR;
const ORIGINAL_CACHE_MODE = process.env.LUDOFORGE_GAMEDEF_CACHE;
const REPO_ROOT = resolveRepoRoot();

afterEach(() => {
  __resetProductionSpecCacheForTests();
  restoreEnv();
});

describe('production GameDef persistent cache equivalence', { concurrency: 1 }, () => {
  it('keeps FITL cache-disabled, cache-write, and cache-read GameDefs byte-identical', () => {
    assertCacheEquivalence('fire-in-the-lake', compileProductionSpec);
  });

  it('keeps Texas cache-disabled, cache-write, and cache-read GameDefs byte-identical', () => {
    assertCacheEquivalence('texas-holdem', compileTexasProductionSpec);
  });

  it('reads a production persistent-cache entry instead of falling back to a fresh compile', () => {
    const dir = useTempCacheDir();
    try {
      process.env.LUDOFORGE_GAMEDEF_CACHE = 'off';
      const disabled = compileProductionSpec();
      const entrypointPath = resolve(REPO_ROOT, 'data/games/fire-in-the-lake.game-spec.md');
      const sourceFingerprint = loadGameSpecBundleFromEntrypoint(entrypointPath).sourceFingerprint;

      const sentinelGameDef = createValidGameDef();
      process.env.LUDOFORGE_GAMEDEF_CACHE = undefined;
      __resetProductionSpecCacheForTests();
      writeGameDefCache(
        {
          gameKey: deriveGameKeyFromEntrypoint(entrypointPath),
          sourceFingerprint,
          cacheFormatVersion: GAMEDEF_CACHE_FORMAT_VERSION,
        },
        { gameDef: sentinelGameDef, sourceFingerprint, compilerStamp: '' },
      );

      const cached = compileProductionSpec();

      assert.equal(
        JSON.stringify(cached.compiled.gameDef),
        JSON.stringify(sentinelGameDef),
        'production helper should return the persistent cache entry when the production source fingerprint matches',
      );
      assert.notEqual(
        JSON.stringify(cached.compiled.gameDef),
        JSON.stringify(disabled.compiled.gameDef),
        'sentinel witness must differ from the fresh production compile so fallback compilation cannot satisfy this assertion',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function assertCacheEquivalence(
  label: string,
  compile: () => { readonly compiled: CompileResult & { readonly gameDef: NonNullable<CompileResult['gameDef']> } },
): void {
  const dir = useTempCacheDir();
  try {
    process.env.LUDOFORGE_GAMEDEF_CACHE = 'off';
    const disabledJson = JSON.stringify(compile().compiled.gameDef);

    process.env.LUDOFORGE_GAMEDEF_CACHE = undefined;
    __resetProductionSpecCacheForTests();
    clearGameDefCache();
    const missThenCompileJson = JSON.stringify(compile().compiled.gameDef);

    __resetProductionSpecCacheForTests();
    const hitJson = JSON.stringify(compile().compiled.gameDef);

    assert.equal(missThenCompileJson, disabledJson, `${label} cache-write path should match cache-disabled compile`);
    assert.equal(hitJson, disabledJson, `${label} persistent cache-read path should match cache-disabled compile`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function useTempCacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gamedef-cache-equivalence-'));
  process.env.LUDOFORGE_GAMEDEF_CACHE_DIR = dir;
  delete process.env.LUDOFORGE_GAMEDEF_CACHE;
  __resetProductionSpecCacheForTests();
  return dir;
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
