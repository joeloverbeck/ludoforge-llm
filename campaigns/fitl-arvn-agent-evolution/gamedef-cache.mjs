import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CAMPAIGN_GAMEDEF_CACHE_FORMAT_VERSION = 'v1';
export const CAMPAIGN_GAMEDEF_CACHE_ENV = 'LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE';

export function loadOrCompileGameDef({
  entrypoint,
  repoRoot,
  compileFn,
  loadSources,
  cacheDir = join(dirname(entrypoint), '.gamedef-cache'),
  engineCommitSha = readEngineCommitSha(repoRoot),
}) {
  if (process.env[CAMPAIGN_GAMEDEF_CACHE_ENV] === 'off') {
    return { def: compileFn(), cacheHit: false };
  }

  const sourceSummary = loadSources(entrypoint);
  const sources = normalizeSources(sourceSummary.sources);
  const specSourceContentHash = hashSources(sources);
  const cacheKey = deriveCacheKey({ specSourceContentHash, engineCommitSha });
  const cachePath = join(cacheDir, `${cacheKey}.gamedef.json`);

  const cached = readCacheEntry(cachePath);
  if (cached !== null && isValidCacheEntry(cached, { specSourceContentHash, engineCommitSha })) {
    return { def: cached.def, cacheHit: true };
  }

  const def = compileFn();
  writeCacheEntry(cachePath, {
    def,
    sources: sources.map((source) => source.path),
    specSourceContentHash,
    engineCommitSha,
    cacheFormatVersion: CAMPAIGN_GAMEDEF_CACHE_FORMAT_VERSION,
  });

  return { def, cacheHit: false };
}

export function deriveCacheKey({ specSourceContentHash, engineCommitSha }) {
  return createHash('sha256')
    .update(specSourceContentHash)
    .update('\0')
    .update(engineCommitSha)
    .update('\0')
    .update(CAMPAIGN_GAMEDEF_CACHE_FORMAT_VERSION)
    .digest('hex');
}

function normalizeSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('GameDef cache source loader returned no sources.');
  }

  return sources
    .map((source) => {
      if (typeof source?.path !== 'string' || typeof source?.markdown !== 'string') {
        throw new Error('GameDef cache sources must contain path and markdown fields.');
      }
      return { path: resolve(source.path), markdown: source.markdown };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

function hashSources(sources) {
  const hash = createHash('sha256');
  for (const source of sources) {
    hash.update(source.path);
    hash.update('\0');
    hash.update(Buffer.from(source.markdown, 'utf8'));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function readEngineCommitSha(repoRoot) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' });
  const sha = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  if (/^[0-9a-f]{40}$/i.test(sha)) {
    return sha;
  }
  if (result.error !== undefined) {
    throw result.error;
  }
  throw new Error(result.stderr.trim() || 'Unable to resolve engine commit SHA.');
}

function readCacheEntry(cachePath) {
  try {
    if (!existsSync(cachePath)) {
      return null;
    }
    return JSON.parse(readFileSync(cachePath, 'utf8'));
  } catch {
    return null;
  }
}

function isValidCacheEntry(entry, expected) {
  return entry !== null
    && typeof entry === 'object'
    && entry.cacheFormatVersion === CAMPAIGN_GAMEDEF_CACHE_FORMAT_VERSION
    && entry.specSourceContentHash === expected.specSourceContentHash
    && entry.engineCommitSha === expected.engineCommitSha
    && entry.def !== null
    && typeof entry.def === 'object'
    && Array.isArray(entry.sources);
}

function writeCacheEntry(cachePath, entry) {
  mkdirSync(dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`;

  try {
    writeFileSync(tempPath, JSON.stringify(entry), 'utf8');
    renameSync(tempPath, cachePath);
  } catch {
    try {
      unlinkSync(tempPath);
    } catch {
      // Best effort only; compiled GameDef is still returned on cache-write failure.
    }
  }
}
