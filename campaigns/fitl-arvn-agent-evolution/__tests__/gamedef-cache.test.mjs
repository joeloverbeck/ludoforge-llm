// @test-class: architectural-invariant

import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadOrCompileGameDef } from '../gamedef-cache.mjs';

test('campaign GameDef cache invalidates on source and engine identity changes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ludoforge-gamedef-cache-'));
  const previousEnv = process.env.LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE;

  try {
    delete process.env.LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE;

    const entrypoint = join(dir, 'game.game-spec.md');
    const included = join(dir, 'rules.md');
    const cacheDir = join(dir, '.gamedef-cache');
    writeFileSync(entrypoint, 'imports:\n  - ./rules.md\n', 'utf8');
    writeFileSync(included, 'rule: first\n', 'utf8');

    let compileCount = 0;
    const compileFn = () => ({
      id: 'fixture-def',
      compileCount: ++compileCount,
      stablePayload: ['same', 'content'],
    });
    const loadSources = () => ({
      sources: [
        { path: included, markdown: readFileSync(included, 'utf8') },
        { path: entrypoint, markdown: readFileSync(entrypoint, 'utf8') },
      ],
    });

    const miss = loadOrCompileGameDef({
      entrypoint,
      repoRoot: dir,
      cacheDir,
      engineCommitSha: 'commit-a',
      loadSources,
      compileFn,
    });
    assert.equal(miss.cacheHit, false);
    assert.equal(compileCount, 1);

    const hit = loadOrCompileGameDef({
      entrypoint,
      repoRoot: dir,
      cacheDir,
      engineCommitSha: 'commit-a',
      loadSources,
      compileFn,
    });
    assert.equal(hit.cacheHit, true);
    assert.equal(compileCount, 1);
    assert.equal(JSON.stringify(hit.def), JSON.stringify(miss.def));

    writeFileSync(included, 'rule: changed\n', 'utf8');
    const specChangeMiss = loadOrCompileGameDef({
      entrypoint,
      repoRoot: dir,
      cacheDir,
      engineCommitSha: 'commit-a',
      loadSources,
      compileFn,
    });
    assert.equal(specChangeMiss.cacheHit, false);
    assert.equal(compileCount, 2);

    const engineChangeMiss = loadOrCompileGameDef({
      entrypoint,
      repoRoot: dir,
      cacheDir,
      engineCommitSha: 'commit-b',
      loadSources,
      compileFn,
    });
    assert.equal(engineChangeMiss.cacheHit, false);
    assert.equal(compileCount, 3);
  } finally {
    if (previousEnv === undefined) {
      delete process.env.LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE;
    } else {
      process.env.LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE = previousEnv;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test('campaign GameDef cache opt-out bypasses reads and writes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ludoforge-gamedef-cache-off-'));
  const previousEnv = process.env.LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE;

  try {
    process.env.LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE = 'off';

    const entrypoint = join(dir, 'game.game-spec.md');
    const cacheDir = join(dir, '.gamedef-cache');
    writeFileSync(entrypoint, 'game: fixture\n', 'utf8');

    let compileCount = 0;
    const result = loadOrCompileGameDef({
      entrypoint,
      repoRoot: dir,
      cacheDir,
      engineCommitSha: 'commit-a',
      loadSources: () => {
        throw new Error('disabled cache must not read sources');
      },
      compileFn: () => ({ id: 'fixture-def', compileCount: ++compileCount }),
    });

    assert.equal(result.cacheHit, false);
    assert.equal(result.def.compileCount, 1);
    assert.equal(compileCount, 1);
  } finally {
    if (previousEnv === undefined) {
      delete process.env.LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE;
    } else {
      process.env.LUDOFORGE_CAMPAIGN_GAMEDEF_CACHE = previousEnv;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
