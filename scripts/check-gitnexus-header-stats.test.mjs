import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { evaluateGitnexusHeaderStatsGuard } from './check-gitnexus-header-stats.mjs';

const ORIGINAL_STATS =
  'This project is indexed by GitNexus as **ludoforge-llm** (7589 symbols, 21649 relationships, 300 execution flows).';
const UPDATED_STATS =
  'This project is indexed by GitNexus as **ludoforge-llm** (7591 symbols, 21658 relationships, 300 execution flows).';

function withTempRepo(callback) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'check-gitnexus-header-stats-test-'));
  try {
    runGit(tempRoot, ['init']);
    runGit(tempRoot, ['config', 'user.email', 'test@example.com']);
    runGit(tempRoot, ['config', 'user.name', 'Test User']);

    writeFileSync(
      join(tempRoot, 'AGENTS.md'),
      ['# GitNexus MCP', '', ORIGINAL_STATS, '', '## Always Start Here'].join('\n'),
      'utf8',
    );
    writeFileSync(
      join(tempRoot, 'CLAUDE.md'),
      ['# GitNexus MCP', '', ORIGINAL_STATS, '', '## Always Start Here'].join('\n'),
      'utf8',
    );
    writeFileSync(join(tempRoot, 'feature.txt'), 'baseline\n', 'utf8');

    runGit(tempRoot, ['add', '.']);
    runGit(tempRoot, ['commit', '-m', 'baseline']);

    callback(tempRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
}

test('passes when AGENTS.md and CLAUDE.md are unchanged', () => {
  withTempRepo((tempRoot) => {
    const result = evaluateGitnexusHeaderStatsGuard({ cwd: tempRoot });
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout ?? '', /No repository changes detected/);
  });
});

test('passes for isolated counter-only churn in guidance docs', () => {
  withTempRepo((tempRoot) => {
    writeFileSync(
      join(tempRoot, 'AGENTS.md'),
      ['# GitNexus MCP', '', UPDATED_STATS, '', '## Always Start Here'].join('\n'),
      'utf8',
    );

    const result = evaluateGitnexusHeaderStatsGuard({ cwd: tempRoot });
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout ?? '', /counter-only churn detected and isolated/);
  });
});

test('fails when counter-only churn is mixed with unrelated changes', () => {
  withTempRepo((tempRoot) => {
    writeFileSync(
      join(tempRoot, 'AGENTS.md'),
      ['# GitNexus MCP', '', UPDATED_STATS, '', '## Always Start Here'].join('\n'),
      'utf8',
    );
    writeFileSync(join(tempRoot, 'feature.txt'), 'changed\n', 'utf8');

    const result = evaluateGitnexusHeaderStatsGuard({ cwd: tempRoot });
    assert.equal(result.ok, false);
    assert.match(result.stderr ?? '', /Blocked: mixed-purpose change includes GitNexus counter-only churn/);
    assert.match(result.stderr ?? '', /feature.txt/);
  });
});

test('passes when guidance docs include non-counter edits even with other file changes', () => {
  withTempRepo((tempRoot) => {
    writeFileSync(
      join(tempRoot, 'AGENTS.md'),
      ['# GitNexus MCP', '', ORIGINAL_STATS, '', '## Always Start Here', '', 'Policy note.'].join('\n'),
      'utf8',
    );
    writeFileSync(join(tempRoot, 'feature.txt'), 'changed\n', 'utf8');

    const result = evaluateGitnexusHeaderStatsGuard({ cwd: tempRoot });
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout ?? '', /not counter-only stat churn/);
  });
});
