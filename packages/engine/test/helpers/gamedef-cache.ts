import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Diagnostic } from '../../src/kernel/diagnostics.js';
import type { GameDef } from '../../src/kernel/types.js';
import type { LoadedGameSpecBundle } from '../../src/cnl/index.js';

export interface GameDefCacheKey {
  readonly gameKey: string;
  readonly sourceFingerprint: string;
  readonly cacheFormatVersion: string;
}

export interface CachedGameDefEntry {
  readonly gameDef: GameDef;
  readonly sourceFingerprint: string;
  readonly compilerStamp: string;
  readonly parsed?: LoadedGameSpecBundle['parsed'];
  readonly validatorDiagnostics?: readonly Diagnostic[];
}

export const GAMEDEF_CACHE_FORMAT_VERSION = 'v2' as const;

let memoizedCompilerStamp: string | null = null;

export function readGameDefCache(key: GameDefCacheKey): CachedGameDefEntry | null {
  if (isCacheDisabled()) {
    return null;
  }

  try {
    const cachePath = cacheFilePath(key);
    if (!existsSync(cachePath)) {
      return null;
    }

    const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as Partial<CachedGameDefEntry>;
    if (parsed.sourceFingerprint !== key.sourceFingerprint) {
      return null;
    }
    if (parsed.compilerStamp !== currentCompilerStamp()) {
      return null;
    }
    if (parsed.gameDef == null || typeof parsed.gameDef !== 'object') {
      return null;
    }

    return parsed as CachedGameDefEntry;
  } catch {
    return null;
  }
}

export function writeGameDefCache(key: GameDefCacheKey, entry: CachedGameDefEntry): void {
  if (isCacheDisabled()) {
    return;
  }

  const cachePath = cacheFilePath(key);
  mkdirSync(cacheDirectory(), { recursive: true });

  const tempPath = `${cachePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;
  const persisted: CachedGameDefEntry = {
    gameDef: entry.gameDef,
    sourceFingerprint: key.sourceFingerprint,
    compilerStamp: currentCompilerStamp(),
    ...(entry.parsed === undefined ? {} : { parsed: entry.parsed }),
    ...(entry.validatorDiagnostics === undefined ? {} : { validatorDiagnostics: entry.validatorDiagnostics }),
  };

  try {
    writeFileSync(tempPath, JSON.stringify(persisted), 'utf8');
    renameSync(tempPath, cachePath);
  } catch (error) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best-effort cleanup only; callers treat cache writes as accelerators.
    }
    throw error;
  }
}

export function clearGameDefCache(): void {
  rmSync(cacheDirectory(), { recursive: true, force: true });
  memoizedCompilerStamp = null;
}

export function deriveGameKeyFromEntrypoint(entrypointPath: string): string {
  const name = basename(entrypointPath);
  return name.endsWith('.game-spec.md') ? name.slice(0, -'.game-spec.md'.length) : name;
}

function isCacheDisabled(): boolean {
  return process.env.LUDOFORGE_GAMEDEF_CACHE === 'off';
}

function cacheFilePath(key: GameDefCacheKey): string {
  return join(cacheDirectory(), `${key.gameKey}.${key.sourceFingerprint}.${key.cacheFormatVersion}.gamedef.json`);
}

function cacheDirectory(): string {
  return process.env.LUDOFORGE_GAMEDEF_CACHE_DIR ?? join(resolveRepoRoot(), 'packages', 'engine', 'dist', '.cache');
}

function currentCompilerStamp(): string {
  if (memoizedCompilerStamp !== null) {
    return memoizedCompilerStamp;
  }

  const hash = createHash('sha256');
  for (const path of compilerStampPaths()) {
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  memoizedCompilerStamp = hash.digest('hex');
  return memoizedCompilerStamp;
}

function compilerStampPaths(): readonly string[] {
  const root = resolveRepoRoot();
  return [
    join(root, 'packages', 'engine', 'dist', 'src', 'cnl', 'staged-pipeline.js'),
    join(root, 'packages', 'engine', 'dist', 'src', 'cnl', 'validate-agents.js'),
    join(root, 'packages', 'engine', 'dist', 'src', 'contracts', 'policy-contract.js'),
  ];
}

function resolveRepoRoot(): string {
  const here = fileURLToPath(new URL('.', import.meta.url));
  let cursor = here;

  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(cursor, 'pnpm-workspace.yaml'))) {
      return cursor;
    }
    cursor = join(cursor, '..');
  }

  return process.cwd();
}
