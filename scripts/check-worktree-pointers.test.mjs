import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { evaluateWorktreePointersGuard } from './check-worktree-pointers.mjs';

function withTempRepo(callback) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'check-worktree-pointers-test-'));
  try {
    runGit(tempRoot, ['init']);
    runGit(tempRoot, ['config', 'user.email', 'test@example.com']);
    runGit(tempRoot, ['config', 'user.name', 'Test User']);

    mkdirSync(join(tempRoot, '.claude', 'worktrees'), { recursive: true });
    writeFileSync(join(tempRoot, '.claude', 'worktrees', 'pointer.txt'), 'baseline\n', 'utf8');
    writeFileSync(join(tempRoot, 'feature.txt'), 'baseline\n', 'utf8');

    runGit(tempRoot, ['add', '.']);
    runGit(tempRoot, ['commit', '-m', 'baseline']);

    callback(tempRoot);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('passes when worktree pointers are unchanged', () => {
  withTempRepo((tempRoot) => {
    const result = evaluateWorktreePointersGuard({ cwd: tempRoot });
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout ?? '', /No \.claude\/worktrees pointer changes detected/);
  });
});

test('fails when worktree pointer file changes', () => {
  withTempRepo((tempRoot) => {
    writeFileSync(join(tempRoot, '.claude', 'worktrees', 'pointer.txt'), 'changed\n', 'utf8');

    const result = evaluateWorktreePointersGuard({ cwd: tempRoot });
    assert.equal(result.ok, false);
    assert.match(result.stderr ?? '', /Blocked: detected changes under \.claude\/worktrees/);
    assert.match(result.stderr ?? '', /pointer.txt/);
  });
});

test('passes when non-worktree files change', () => {
  withTempRepo((tempRoot) => {
    writeFileSync(join(tempRoot, 'feature.txt'), 'changed\n', 'utf8');

    const result = evaluateWorktreePointersGuard({ cwd: tempRoot });
    assert.equal(result.ok, true, result.stderr);
    assert.match(result.stdout ?? '', /No \.claude\/worktrees pointer changes detected/);
  });
});
