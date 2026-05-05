// @test-class: architectural-invariant
import * as assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, it } from 'node:test';

import type { GameDef } from '../../../src/kernel/types.js';
import {
  clearGameDefCache,
  deriveGameKeyFromEntrypoint,
  GAMEDEF_CACHE_FORMAT_VERSION,
  readGameDefCache,
  writeGameDefCache,
  type GameDefCacheKey,
} from '../../helpers/gamedef-cache.js';
import { createValidGameDef } from '../../helpers/gamedef-fixtures.js';

const ORIGINAL_CACHE_DIR = process.env.LUDOFORGE_GAMEDEF_CACHE_DIR;
const ORIGINAL_CACHE_MODE = process.env.LUDOFORGE_GAMEDEF_CACHE;

afterEach(() => {
  restoreEnv();
});

describe('gamedef persistent cache', () => {
  it('reads a written GameDef entry for the same key', () => {
    const dir = useTempCacheDir();
    try {
      const key = makeKey('fingerprint-a');
      const gameDef = createValidGameDef();

      writeGameDefCache(key, { gameDef, sourceFingerprint: key.sourceFingerprint, compilerStamp: '' });

      assert.deepEqual(readGameDefCache(key)?.gameDef, gameDef);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a source fingerprint mismatch as a miss', () => {
    const dir = useTempCacheDir();
    try {
      const key = makeKey('fingerprint-a');
      writeGameDefCache(key, { gameDef: createValidGameDef(), sourceFingerprint: key.sourceFingerprint, compilerStamp: '' });

      assert.equal(readGameDefCache(makeKey('fingerprint-b')), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a compiler stamp mismatch as a miss', () => {
    const dir = useTempCacheDir();
    try {
      const key = makeKey('fingerprint-a');
      writeGameDefCache(key, { gameDef: createValidGameDef(), sourceFingerprint: key.sourceFingerprint, compilerStamp: '' });

      const cachePath = cacheFilePath(dir, key);
      const persisted = JSON.parse(readFileSync(cachePath, 'utf8')) as { compilerStamp: string };
      writeFileSync(cachePath, JSON.stringify({ ...persisted, compilerStamp: 'stale-compiler-stamp' }), 'utf8');

      assert.equal(readGameDefCache(key), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('treats a format-version mismatch as a miss', () => {
    const dir = useTempCacheDir();
    try {
      const key = makeKey('fingerprint-a');
      writeGameDefCache(key, { gameDef: createValidGameDef(), sourceFingerprint: key.sourceFingerprint, compilerStamp: '' });

      assert.equal(readGameDefCache({ ...key, cacheFormatVersion: 'v0' }), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('honors LUDOFORGE_GAMEDEF_CACHE=off for reads and writes', () => {
    const dir = useTempCacheDir();
    try {
      const key = makeKey('fingerprint-a');

      process.env.LUDOFORGE_GAMEDEF_CACHE = 'off';
      writeGameDefCache(key, { gameDef: createValidGameDef(), sourceFingerprint: key.sourceFingerprint, compilerStamp: '' });

      assert.equal(existsSync(cacheFilePath(dir, key)), false);

      process.env.LUDOFORGE_GAMEDEF_CACHE = undefined;
      writeGameDefCache(key, { gameDef: createValidGameDef(), sourceFingerprint: key.sourceFingerprint, compilerStamp: '' });

      process.env.LUDOFORGE_GAMEDEF_CACHE = 'off';
      assert.equal(readGameDefCache(key), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes through a temporary file and leaves a complete final JSON file', () => {
    const dir = useTempCacheDir();
    try {
      const key = makeKey('fingerprint-a');
      const gameDef = createValidGameDef();

      writeGameDefCache(key, { gameDef, sourceFingerprint: key.sourceFingerprint, compilerStamp: '' });

      const cachePath = cacheFilePath(dir, key);
      assert.equal(existsSync(cachePath), true);
      const persisted = JSON.parse(readFileSync(cachePath, 'utf8')) as { readonly gameDef: GameDef };
      assert.deepEqual(persisted.gameDef, gameDef);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('clears the configured cache directory', () => {
    const dir = useTempCacheDir();
    try {
      const key = makeKey('fingerprint-a');
      writeGameDefCache(key, { gameDef: createValidGameDef(), sourceFingerprint: key.sourceFingerprint, compilerStamp: '' });

      clearGameDefCache();

      assert.equal(existsSync(cacheFilePath(dir, key)), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('derives the game key from production entrypoint basenames', () => {
    assert.equal(deriveGameKeyFromEntrypoint('/repo/data/games/fire-in-the-lake.game-spec.md'), 'fire-in-the-lake');
    assert.equal(deriveGameKeyFromEntrypoint('/repo/data/games/texas-holdem.game-spec.md'), 'texas-holdem');
  });
});

function useTempCacheDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gamedef-cache-test-'));
  process.env.LUDOFORGE_GAMEDEF_CACHE_DIR = dir;
  delete process.env.LUDOFORGE_GAMEDEF_CACHE;
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

function makeKey(sourceFingerprint: string): GameDefCacheKey {
  return {
    gameKey: 'unit-game',
    sourceFingerprint,
    cacheFormatVersion: GAMEDEF_CACHE_FORMAT_VERSION,
  };
}

function cacheFilePath(dir: string, key: GameDefCacheKey): string {
  return join(dir, `${key.gameKey}.${key.sourceFingerprint}.${key.cacheFormatVersion}.gamedef.json`);
}
